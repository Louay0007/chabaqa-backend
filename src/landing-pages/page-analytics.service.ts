import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PageView, PageViewDocument } from '../schema/page-view.schema';
import {
  LandingPage,
  LandingPageDocument,
} from '../schema/landing-page.schema';
import { Lead, LeadDocument } from '../schema/lead.schema';

export interface RecordViewData {
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  device?: 'desktop' | 'tablet' | 'mobile';
  country?: string;
}

export interface PageAnalyticsResult {
  views: number;
  uniqueVisitors: number;
  conversions: number;
  conversionRate: number;
  avgTimeOnPage: number;
  bounceRate: number;
  dailyViews: Array<{
    date: string;
    views: number;
    conversions: number;
    uniqueVisitors: number;
  }>;
  deviceBreakdown: Array<{ device: string; count: number }>;
  topReferrers: Array<{ source: string; count: number }>;
}

@Injectable()
export class PageAnalyticsService {
  constructor(
    @InjectModel(PageView.name)
    private readonly pageViewModel: Model<PageViewDocument>,
    @InjectModel(LandingPage.name)
    private readonly landingPageModel: Model<LandingPageDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
  ) {}

  // ─── Record View ─────────────────────────────────────────────────────────────

  async recordView(pageId: string, data: RecordViewData): Promise<void> {
    if (!Types.ObjectId.isValid(pageId)) return;

    // Idempotency: skip duplicate session within the same page
    const existing = await this.pageViewModel
      .findOne({
        landingPage: new Types.ObjectId(pageId),
        sessionId: data.sessionId,
      })
      .lean();

    if (existing) return;

    // Detect device from user-agent when not explicitly provided
    const device = data.device ?? this.detectDevice(data.userAgent ?? '');

    // Look up the landing page to enrich with communityId / pageType
    const page = await this.landingPageModel
      .findById(pageId)
      .select('communityId pageType isPrimaryHome')
      .lean<LandingPageDocument>();

    await this.pageViewModel.create({
      landingPage: new Types.ObjectId(pageId),
      communityId: page?.communityId || undefined,
      homePageId:
        page?.pageType === 'community-home' && page?.isPrimaryHome
          ? new Types.ObjectId(pageId)
          : undefined,
      pageType: page?.pageType || 'standalone',
      sessionId: data.sessionId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      referrer: data.referrer,
      device,
      country: data.country,
      duration: 0,
      converted: false,
    });

    // Atomically increment views and uniqueVisitors on the landing page doc
    await this.landingPageModel.findByIdAndUpdate(pageId, {
      $inc: {
        'analytics.views': 1,
        'analytics.uniqueVisitors': 1,
      },
    });

    // Recalculate conversionRate after incrementing views (fire-and-forget)
    this.refreshConversionRate(pageId).catch(() => {});
  }

  // ─── Update View Duration ────────────────────────────────────────────────────

  async updateViewDuration(
    pageId: string,
    sessionId: string,
    duration: number,
    converted?: boolean,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(pageId)) return;

    const safeDuration = Math.max(0, Math.round(duration));

    const updatePayload: Record<string, any> = { duration: safeDuration };
    if (converted !== undefined) {
      updatePayload.converted = converted;
    }

    await this.pageViewModel.findOneAndUpdate(
      {
        landingPage: new Types.ObjectId(pageId),
        sessionId,
      },
      { $set: updatePayload },
    );

    // Update the landing page's avgTimeOnPage and bounceRate aggregates
    await this.refreshAvgAndBounce(pageId);
  }

  // ─── Analytics Aggregation ───────────────────────────────────────────────────

  async getPageAnalytics(
    pageId: string,
    creatorId: string,
    timeRange: string = '30d',
  ): Promise<PageAnalyticsResult> {
    // Verify ownership
    const page = await this.landingPageModel
      .findOne({
        _id: new Types.ObjectId(pageId),
        creator: new Types.ObjectId(creatorId),
      })
      .lean<LandingPageDocument>();

    if (!page) {
      throw new NotFoundException(
        'Landing page not found or you do not have access to it',
      );
    }

    const since = this.parseSince(timeRange);
    const pageOid = new Types.ObjectId(pageId);

    // ── Run all aggregations in parallel ──
    const [
      dailyViews,
      deviceBreakdown,
      topReferrers,
      durationStats,
      totalLeads,
    ] = await Promise.all([
      this.aggregateDailyViews(pageOid, since),
      this.aggregateDeviceBreakdown(pageOid, since),
      this.aggregateTopReferrers(pageOid, since),
      this.aggregateDurationStats(pageOid, since),
      this.leadModel.countDocuments({
        landingPage: pageOid,
        createdAt: { $gte: since },
      }),
    ]);

    const views = page.analytics?.views ?? 0;
    const uniqueVisitors = page.analytics?.uniqueVisitors ?? 0;
    const conversions = page.analytics?.conversions ?? 0;
    const conversionRate =
      views > 0 ? parseFloat(((conversions / views) * 100).toFixed(2)) : 0;
    const avgTimeOnPage = durationStats.avgDuration;
    const bounceRate = durationStats.bounceRate;

    return {
      views,
      uniqueVisitors,
      conversions,
      conversionRate,
      avgTimeOnPage,
      bounceRate,
      dailyViews,
      deviceBreakdown,
      topReferrers,
    };
  }

  // ─── Private Aggregation Helpers ─────────────────────────────────────────────

  private async aggregateDailyViews(
    pageOid: Types.ObjectId,
    since: Date,
  ): Promise<
    Array<{
      date: string;
      views: number;
      conversions: number;
      uniqueVisitors: number;
    }>
  > {
    const results = await this.pageViewModel.aggregate([
      {
        $match: {
          landingPage: pageOid,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          views: { $sum: 1 },
          conversions: { $sum: { $cond: ['$converted', 1, 0] } },
          uniqueVisitors: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          day: '$_id.day',
          views: 1,
          conversions: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
        },
      },
      { $sort: { year: 1, month: 1, day: 1 } },
    ]);

    return results.map((r) => ({
      date: `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
      views: r.views,
      conversions: r.conversions,
      uniqueVisitors: r.uniqueVisitors,
    }));
  }

  private async aggregateDeviceBreakdown(
    pageOid: Types.ObjectId,
    since: Date,
  ): Promise<Array<{ device: string; count: number }>> {
    const results = await this.pageViewModel.aggregate([
      {
        $match: {
          landingPage: pageOid,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: '$device',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return results.map((r) => ({
      device: r._id ?? 'unknown',
      count: r.count,
    }));
  }

  private async aggregateTopReferrers(
    pageOid: Types.ObjectId,
    since: Date,
    topN = 10,
  ): Promise<Array<{ source: string; count: number }>> {
    const results = await this.pageViewModel.aggregate([
      {
        $match: {
          landingPage: pageOid,
          createdAt: { $gte: since },
          referrer: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: '$referrer',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: topN },
    ]);

    return results.map((r) => ({
      source: r._id ?? 'direct',
      count: r.count,
    }));
  }

  private async aggregateDurationStats(
    pageOid: Types.ObjectId,
    since: Date,
  ): Promise<{ avgDuration: number; bounceRate: number }> {
    // A "bounce" is a session where duration < 10 seconds
    const BOUNCE_THRESHOLD_SECONDS = 10;

    const results = await this.pageViewModel.aggregate([
      {
        $match: {
          landingPage: pageOid,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          bounces: {
            $sum: {
              $cond: [{ $lt: ['$duration', BOUNCE_THRESHOLD_SECONDS] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!results.length || results[0].totalSessions === 0) {
      return { avgDuration: 0, bounceRate: 0 };
    }

    const { totalSessions, totalDuration, bounces } = results[0];
    const avgDuration = parseFloat((totalDuration / totalSessions).toFixed(1));
    const bounceRate = parseFloat(((bounces / totalSessions) * 100).toFixed(2));

    return { avgDuration, bounceRate };
  }

  // ─── Refresh Helpers (fire-and-forget) ───────────────────────────────────────

  private async refreshConversionRate(pageId: string): Promise<void> {
    const page = await this.landingPageModel
      .findById(pageId)
      .select('analytics')
      .lean<LandingPageDocument>();

    if (!page) return;

    const views = page.analytics?.views ?? 0;
    const conversions = page.analytics?.conversions ?? 0;
    const conversionRate =
      views > 0 ? parseFloat(((conversions / views) * 100).toFixed(2)) : 0;

    await this.landingPageModel.findByIdAndUpdate(pageId, {
      $set: { 'analytics.conversionRate': conversionRate },
    });
  }

  private async refreshAvgAndBounce(pageId: string): Promise<void> {
    const BOUNCE_THRESHOLD_SECONDS = 10;

    const results = await this.pageViewModel.aggregate([
      {
        $match: { landingPage: new Types.ObjectId(pageId) },
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          bounces: {
            $sum: {
              $cond: [{ $lt: ['$duration', BOUNCE_THRESHOLD_SECONDS] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!results.length || results[0].totalSessions === 0) {
      await this.landingPageModel.findByIdAndUpdate(pageId, {
        $set: { 'analytics.avgTimeOnPage': 0, 'analytics.bounceRate': 0 },
      });
      return;
    }

    const { totalSessions, totalDuration, bounces } = results[0];
    const avgTimeOnPage = parseFloat(
      (totalDuration / totalSessions).toFixed(1),
    );
    const bounceRate = parseFloat(((bounces / totalSessions) * 100).toFixed(2));

    await this.landingPageModel.findByIdAndUpdate(pageId, {
      $set: {
        'analytics.avgTimeOnPage': avgTimeOnPage,
        'analytics.bounceRate': bounceRate,
      },
    });
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  private parseSince(timeRange: string): Date {
    const now = new Date();
    const match = timeRange.match(/^(\d+)([dwhm])$/);

    if (!match) {
      // Default: 30 days
      now.setDate(now.getDate() - 30);
      return now;
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        now.setDate(now.getDate() - amount);
        break;
      case 'w':
        now.setDate(now.getDate() - amount * 7);
        break;
      case 'h':
        now.setHours(now.getHours() - amount);
        break;
      case 'm':
        now.setMonth(now.getMonth() - amount);
        break;
      default:
        now.setDate(now.getDate() - 30);
    }

    return now;
  }

  private detectDevice(userAgent: string): 'desktop' | 'tablet' | 'mobile' {
    const ua = userAgent.toLowerCase();

    if (
      /ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk/i.test(
        ua,
      )
    ) {
      return 'tablet';
    }

    if (
      /mobile|iphone|ipod|android.*mobile|windows.*phone|blackberry|bb\d+|meego.+mobile|avantgo|bada\/|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|phone|p(ixi|re)\/|palm|pixi|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
        ua,
      )
    ) {
      return 'mobile';
    }

    return 'desktop';
  }
}

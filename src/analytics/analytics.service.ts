import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsDaily, AnalyticsDailyDocument } from '../schema/analytics-daily.schema';
import { AnalyticsRetention, AnalyticsRetentionDocument } from '../schema/analytics-retention.schema';
import { AnalyticsWeeklyReport, AnalyticsWeeklyReportDocument } from '../schema/analytics-weekly-report.schema';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanTier } from '../schema/plan.schema';
import { TrackingAction, TrackingActionType } from '../schema/content-tracking.schema';
import { Cours, CoursSchema } from '../schema/course.schema';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Ga4ReportingService } from '../ga4/ga4-reporting.service';
import { CacheService } from '../common/services/cache.service';
import { PolicyService } from '../common/services/policy.service';


@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache: Map<string, { data: any; expiresAt: number }>; // simple TTL cache
  private readonly creatorObjectIdCache = new Map<string, Types.ObjectId>();
  private readonly analyticsRedisPrefix = 'creator-analytics';
  private readonly defaultCacheTtlMs = 60 * 1000;

  constructor(
    @InjectModel(AnalyticsDaily.name) private readonly dailyModel: Model<AnalyticsDailyDocument>,
    @InjectModel(AnalyticsRetention.name) private readonly retentionModel: Model<AnalyticsRetentionDocument>,
    @InjectModel(AnalyticsWeeklyReport.name) private readonly weeklyReportModel: Model<AnalyticsWeeklyReportDocument>,
    private readonly subscriptionService: SubscriptionService,
    @InjectConnection() private readonly dbConnection: Connection,
    private readonly ga4ReportingService: Ga4ReportingService,
    private readonly cacheService: CacheService,
    private readonly policyService: PolicyService,
  ) {
    this.cache = new Map();
  }
  /**
   * Clamp the "from" date so it does not exceed the plan's lookback window.
   * When PLAN_ENFORCEMENT_MODE=false the full range is returned unchanged.
   */
  private async clampDateRangeForPlan(
    creatorId: string,
    from: Date,
    to: Date,
  ): Promise<{ from: Date; to: Date; lookbackDays: number }> {
    const lookbackDays = await this.policyService.getAnalyticsLookbackDays(creatorId);
    const cutoff = new Date(to.getTime() - lookbackDays * 24 * 3600 * 1000);
    const effectiveFrom = from < cutoff ? cutoff : from;
    return { from: effectiveFrom, to, lookbackDays };
  }


  private cacheKey(userId: string, from: string, to: string, scope: string) {
    return `${userId}:${from}:${to}:${scope}`;
  }

  private getRedisCacheKey(key: string): string {
    return `${this.analyticsRedisPrefix}:${key}`;
  }

  private setCache(key: string, value: any, ttlMs = this.defaultCacheTtlMs) {
    this.cache.set(key, { data: value, expiresAt: Date.now() + ttlMs });
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    void this.cacheService.set(this.getRedisCacheKey(key), value, ttlSeconds);
  }

  private async getCache<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (entry) {
      if (Date.now() <= entry.expiresAt) {
        return entry.data as T;
      }
      this.cache.delete(key);
    }

    const redisValue = await this.cacheService.get<T>(this.getRedisCacheKey(key));
    if (redisValue !== undefined) {
      // Keep a short in-process hot cache layer to avoid repetitive deserialization.
      this.cache.set(key, { data: redisValue, expiresAt: Date.now() + this.defaultCacheTtlMs });
      return redisValue;
    }

    return null;
  }

  private async invalidateCreatorCache(creatorId: string): Promise<void> {
    const localPrefix = `${creatorId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(localPrefix)) {
        this.cache.delete(key);
      }
    }

    const pattern = `${this.analyticsRedisPrefix}:${creatorId}:*`;
    const deleted = await this.cacheService.deletePattern(pattern);
    if (deleted > 0) {
      this.logger.debug(`Invalidated ${deleted} creator analytics cache key(s) for ${creatorId}`);
    }
  }

  private getCreatorObjectId(creatorId: string): Types.ObjectId {
    const cached = this.creatorObjectIdCache.get(creatorId);
    if (cached) return cached;
    const objectId = new Types.ObjectId(creatorId);
    this.creatorObjectIdCache.set(creatorId, objectId);
    return objectId;
  }

  private buildLookupCommunityMatch(path: string, values: Array<string | Types.ObjectId>) {
    return { [path]: { $in: values } };
  }

  private setDailyCommunityFilter(match: Record<string, any>, communityIdStrings: string[]) {
    match.communityId = { $in: communityIdStrings };
  }

  private buildOrderContentCommunityLookup(collection: string, contentType: string, alias: string) {
    return {
      $lookup: {
        from: collection,
        let: { orderContentId: '$contentId', orderContentType: '$contentType' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$$orderContentType', contentType] },
                  {
                    $or: [
                      { $eq: ['$id', '$$orderContentId'] },
                      { $eq: [{ $toString: '$_id' }, '$$orderContentId'] },
                    ],
                  },
                ],
              },
            },
          },
          { $project: { _id: 0, communityId: 1 } },
          { $limit: 1 },
        ],
        as: alias,
      },
    } as any;
  }

  private async aggregateCreatorRevenue(
    creatorId: string,
    from: Date,
    to: Date,
    communityScope: { hasFilter: boolean; lookupCommunityValues: Array<string | Types.ObjectId> },
    extraMatch?: Record<string, any>,
  ): Promise<{ total: number; count: number }> {
    const ordersCollection = this.dbConnection.db?.collection('orders');
    if (!ordersCollection) return { total: 0, count: 0 };

    const match: any = {
      creatorId: this.getCreatorObjectId(creatorId),
      status: 'paid',
      createdAt: { $gte: from, $lte: to },
      ...(extraMatch || {}),
    };

    const revenueGroupStages: any[] = [
      {
        $group: {
          _id: null,
          total: { $sum: '$creatorNetDT' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, total: 1, count: 1 } },
    ];

    if (!communityScope.hasFilter) {
      const rows = await ordersCollection.aggregate([{ $match: match }, ...revenueGroupStages]).toArray();
      return {
        total: Number(rows?.[0]?.total ?? 0) || 0,
        count: Number(rows?.[0]?.count ?? 0) || 0,
      };
    }

    const resolvedCommunityIdExpr = {
      $ifNull: [
        '$communityId',
        {
          $ifNull: [
            { $cond: [{ $eq: ['$contentType', 'community'] }, '$contentId', null] },
            {
              $ifNull: [
                { $arrayElemAt: ['$courseDoc.communityId', 0] },
                {
                  $ifNull: [
                    { $arrayElemAt: ['$challengeDoc.communityId', 0] },
                    {
                      $ifNull: [
                        { $arrayElemAt: ['$sessionDoc.communityId', 0] },
                        {
                          $ifNull: [
                            { $arrayElemAt: ['$eventDoc.communityId', 0] },
                            { $arrayElemAt: ['$productDoc.communityId', 0] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const rows = await ordersCollection
      .aggregate([
        { $match: match },
        this.buildOrderContentCommunityLookup('cours', 'course', 'courseDoc'),
        this.buildOrderContentCommunityLookup('challenges', 'challenge', 'challengeDoc'),
        this.buildOrderContentCommunityLookup('sessions', 'session', 'sessionDoc'),
        this.buildOrderContentCommunityLookup('events', 'event', 'eventDoc'),
        this.buildOrderContentCommunityLookup('products', 'product', 'productDoc'),
        { $addFields: { resolvedCommunityId: resolvedCommunityIdExpr } },
        { $match: { resolvedCommunityId: { $in: communityScope.lookupCommunityValues } } },
        ...revenueGroupStages,
      ])
      .toArray();

    return {
      total: Number(rows?.[0]?.total ?? 0) || 0,
      count: Number(rows?.[0]?.count ?? 0) || 0,
    };
  }

  private async resolveCommunityScope(
    creatorId: string,
    communityId?: string,
    communitySlug?: string,
  ): Promise<{
    hasFilter: boolean;
    cacheKeyPart: string;
    communityIdStrings: string[];
    lookupCommunityValues: Array<string | Types.ObjectId>;
    ga4CommunityId?: string;
  }> {
    const candidate = (communityId || communitySlug || '').trim();
    if (!candidate) {
      return {
        hasFilter: false,
        cacheKeyPart: 'all',
        communityIdStrings: [],
        lookupCommunityValues: [],
      };
    }

    const creatorObjectId = this.getCreatorObjectId(creatorId);
    const communitiesCollection = this.dbConnection.db?.collection('communities');
    if (!communitiesCollection) {
      throw new ForbiddenException('Community analytics are temporarily unavailable.');
    }

    const ors: Record<string, any>[] = [{ slug: candidate }, { id: candidate }];
    if (Types.ObjectId.isValid(candidate)) {
      ors.push({ _id: new Types.ObjectId(candidate) });
    }

    const community = await communitiesCollection.findOne(
      { createur: creatorObjectId, $or: ors },
      { projection: { _id: 1, slug: 1, id: 1 } },
    );

    if (!community?._id) {
      throw new ForbiddenException('You do not have access to this community analytics.');
    }

    const stringIds = new Set<string>();
    stringIds.add(community._id.toString());

    if (typeof community.slug === 'string' && community.slug.trim()) {
      stringIds.add(community.slug.trim());
    }
    if (typeof community.id === 'string' && community.id.trim()) {
      stringIds.add(community.id.trim());
    }
    if (candidate) {
      stringIds.add(candidate);
    }

    const communityIdStrings = Array.from(stringIds);
    const lookupCommunityValues: Array<string | Types.ObjectId> = [
      ...communityIdStrings,
      community._id as Types.ObjectId,
    ];

    return {
      hasFilter: true,
      cacheKeyPart: community._id.toString(),
      communityIdStrings,
      lookupCommunityValues,
      ga4CommunityId: community._id.toString(),
    };
  }

  async getCommunities(creatorId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), 'communities');
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    // Get communities analytics
    const communities = await this.dbConnection.db?.collection('communities').find({
      createur: new Types.ObjectId(creatorId),
      createdAt: { $gte: from, $lte: to }
    }).toArray() || [];

    const result = {
      total: communities.length,
      active: communities.filter(c => c.isActive).length,
      members: communities.reduce((sum, c) => sum + (c.membersCount || 0), 0),
      averageRating: communities.reduce((sum, c) => sum + (c.averageRating || 0), 0) / communities.length || 0,
      categories: [...new Set(communities.map(c => c.category))],
      communities: communities.map(c => ({
        id: c._id,
        name: c.name,
        members: c.membersCount || 0,
        rating: c.averageRating || 0,
        category: c.category,
        createdAt: c.createdAt
      }))
    };

    this.setCache(key, result);
    return result;
  }

  async getOverview(creatorId: string, from: Date, to: Date, plan?: PlanTier, communityId?: string, communitySlug?: string) {
    if (!plan) {
      const sub = await this.subscriptionService.getMySubscription(creatorId);
      plan = (sub?.plan as PlanTier) || PlanTier.STARTER;
    }
    // Clamp date range to plan lookback window
    const clamped = await this.clampDateRangeForPlan(creatorId, from, to);
    from = clamped.from;
    to = clamped.to;
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `overview:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return this.shapeOverview(cached, plan);

    const match = {
      creatorId: this.getCreatorObjectId(creatorId),
      date: { $gte: from, $lte: to },
    } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
    const isCourseCompleteActionExpr = {
      $and: [
        { $eq: ['$actionType', TrackingActionType.COMPLETE] },
        { $eq: [chapterIdExpr, ''] },
      ],
    };
    const isChapterCompleteActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.COMPLETE] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };

    // Try GA4 first for interaction counts
    let ga4Totals: any = null;
    try {
      const ga4Counts = await this.ga4ReportingService.getCreatorEventCounts(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId
      );
      if (ga4Counts) {
        ga4Totals = {
          ...ga4Counts,
          watchTime: 0 // Will be merged from Mongo
        };
      }
    } catch (e) {
      // Ignore GA4 errors
    }

    let totalsAgg = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          chapterCompletes: { $sum: '$chapterCompletes' },
          likes: { $sum: '$likes' },
          shares: { $sum: '$shares' },
          downloads: { $sum: '$downloads' },
          bookmarks: { $sum: '$bookmarks' },
          watchTime: { $sum: '$watchTime' },
          ratingsCount: { $sum: '$ratingsCount' },
        },
      },
      { $project: { _id: 0 } },
    ]);

    // If no rollups exist yet for this creator, backfill from trackingactions once
    if (!totalsAgg.length && !ga4Totals) {
      await this.backfillForCreator(creatorId, 90);
      totalsAgg = await this.dailyModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            views: { $sum: '$views' },
            starts: { $sum: '$starts' },
            completes: { $sum: '$completes' },
            chapterCompletes: { $sum: '$chapterCompletes' },
            likes: { $sum: '$likes' },
            shares: { $sum: '$shares' },
            downloads: { $sum: '$downloads' },
            bookmarks: { $sum: '$bookmarks' },
            watchTime: { $sum: '$watchTime' },
            ratingsCount: { $sum: '$ratingsCount' },
          },
        },
        { $project: { _id: 0 } },
      ]);
    }

    const mongoTotals = totalsAgg[0] || {
      views: 0,
      starts: 0,
      completes: 0,
      chapterCompletes: 0,
      likes: 0,
      shares: 0,
      downloads: 0,
      bookmarks: 0,
      watchTime: 0,
      ratingsCount: 0,
    };

    const hasMongoActivity =
      mongoTotals.views +
      mongoTotals.starts +
      mongoTotals.completes +
      mongoTotals.chapterCompletes +
      mongoTotals.likes +
      mongoTotals.shares +
      mongoTotals.downloads +
      mongoTotals.bookmarks +
      mongoTotals.ratingsCount >
      0;

    let trackingTotals: any = null;
    if (!ga4Totals && (!totalsAgg.length || !hasMongoActivity)) {
      const tracking = this.dbConnection.collection('trackingactions');
      const contentDoc = {
        $ifNull: [
          { $arrayElemAt: ['$course', 0] },
          {
            $ifNull: [
              { $arrayElemAt: ['$challenge', 0] },
              {
                $ifNull: [
                  { $arrayElemAt: ['$session', 0] },
                  {
                    $ifNull: [
                      { $arrayElemAt: ['$event', 0] },
                      {
                        $ifNull: [
                          { $arrayElemAt: ['$product', 0] },
                          { $arrayElemAt: ['$post', 0] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const trackingAgg = await tracking
        .aggregate([
          { $match: { timestamp: { $gte: from, $lte: to } } },
          { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
          { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
          { $lookup: { from: 'sessions', localField: 'contentId', foreignField: 'id', as: 'session' } },
          { $lookup: { from: 'events', localField: 'contentId', foreignField: 'id', as: 'event' } },
          { $lookup: { from: 'products', localField: 'contentId', foreignField: 'id', as: 'product' } },
          { $lookup: { from: 'posts', localField: 'contentId', foreignField: 'id', as: 'post' } },
          { $addFields: { contentDoc } },
          { $addFields: { creatorIdResolved: { $ifNull: ['$contentDoc.creatorId', '$contentDoc.authorId'] } } },
          { $match: { creatorIdResolved: this.getCreatorObjectId(creatorId) } },
          ...(communityScope.hasFilter ? [{ $match: this.buildLookupCommunityMatch('contentDoc.communityId', communityScope.lookupCommunityValues) }] : []),
          {
            $group: {
              _id: null,
              views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
              starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
              completes: { $sum: { $cond: [isCourseCompleteActionExpr, 1, 0] } },
              chapterCompletes: { $sum: { $cond: [isChapterCompleteActionExpr, 1, 0] } },
              likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
              shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
              downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } },
              bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
              ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } },
            },
          },
          { $project: { _id: 0 } },
        ])
        .toArray();

      trackingTotals = trackingAgg?.[0] || null;
    }

    const resolvedChapterCompletes =
      Number(trackingTotals?.chapterCompletes ?? mongoTotals.chapterCompletes ?? 0) || 0;

    const totals = ga4Totals
      ? { ...ga4Totals, watchTime: mongoTotals.watchTime, chapterCompletes: resolvedChapterCompletes }
      : trackingTotals
        ? { ...trackingTotals, watchTime: mongoTotals.watchTime, chapterCompletes: resolvedChapterCompletes }
        : mongoTotals;


    // Revenue must include orders without `communityId`, so resolve community from content when needed.
    const revenue = await this.aggregateCreatorRevenue(creatorId, from, to, communityScope);

    // Calculate engagement rate: (interactions / views) * 100
    // Interactions include: starts, completes, likes, shares, downloads, bookmarks
    const interactions = totals.starts + totals.completes + totals.likes + totals.shares + totals.downloads + totals.bookmarks;
    const engagementRate = totals.views > 0 ? (interactions / totals.views) * 100 : 0;

    let trend = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$date',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          watchTime: { $sum: '$watchTime' },
        },
      },
      { $project: { _id: 0, date: '$_id', views: 1, starts: 1, completes: 1, watchTime: 1 } },
      { $sort: { date: 1 } },
    ]);

    try {
      const ga4Trend = await this.ga4ReportingService.getCreatorDailyTrend(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Trend.length > 0) {
        trend = ga4Trend;
      }
    } catch {
      // Keep Mongo trend as fallback
    }

    const topContents = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { contentType: '$contentType', contentId: '$contentId' },
          views: { $sum: '$views' },
          completes: { $sum: '$completes' },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 3 },
      { $project: { _id: 0, contentType: '$_id.contentType', contentId: '$_id.contentId', views: 1, completes: 1 } },
    ]);

    const full = {
      totals,
      revenue: {
        total: revenue.total,
        count: revenue.count
      },
      engagementRate: Math.round(engagementRate * 100) / 100, // Round to 2 decimal places
      trend,
      topContents
    };
    this.setCache(key, full);
    return this.shapeOverview(full, plan);
  }

  async getCourses(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `courses:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const match = {
      creatorId: this.getCreatorObjectId(creatorId),
      date: { $gte: from, $lte: to },
      contentType: 'course',
    } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
    const isChapterStartActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_START] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.START] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };
    const isChapterCompleteActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.COMPLETE] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };

    let byCourse = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          chapterCompletes: { $sum: '$chapterCompletes' },
          watchTime: { $sum: '$watchTime' },
          ratingsCount: { $sum: '$ratingsCount' },
        },
      },
      {
        $project: {
          _id: 0,
          contentId: '$_id',
          views: 1,
          starts: 1,
          completes: 1,
          chapterCompletes: 1,
          watchTime: 1,
          ratingsCount: 1,
          completionRate: {
            $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0],
          },
        },
      },
      { $sort: { views: -1 } },
    ]);

    // If there is no rollup data yet for this creator, attempt a one-time backfill
    if (!byCourse.length) {
      await this.backfillForCreator(creatorId, 90);

      byCourse = await this.dailyModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$contentId',
            views: { $sum: '$views' },
            starts: { $sum: '$starts' },
            completes: { $sum: '$completes' },
            chapterCompletes: { $sum: '$chapterCompletes' },
            watchTime: { $sum: '$watchTime' },
            ratingsCount: { $sum: '$ratingsCount' },
          },
        },
        {
          $project: {
            _id: 0,
            contentId: '$_id',
            views: 1,
            starts: 1,
            completes: 1,
            chapterCompletes: 1,
            watchTime: 1,
            ratingsCount: 1,
            completionRate: {
              $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0],
            },
          },
        },
        { $sort: { views: -1 } },
      ]);
    }

    // Try GA4 and merge if available
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'course',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId
      );

      if (ga4Stats.length > 0) {
        const mongoMap = new Map(byCourse.map(c => [c.contentId, c]));

        // Use GA4 stats but preserve watchTime from Mongo
        byCourse = ga4Stats.map(s => {
          const m = mongoMap.get(s.contentId) || { watchTime: 0, chapterCompletes: 0 };
          return {
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            chapterCompletes: Number((m as any)?.chapterCompletes || 0),
            watchTime: m.watchTime,
            ratingsCount: s.ratingsCount,
            completionRate: s.starts > 0 ? s.completes / s.starts : 0
          };
        }).sort((a, b) => b.views - a.views);
      }
    } catch (e) {
      // Ignore GA4 errors
    }

    const courseIds = byCourse.map((c: any) => c.contentId).filter(Boolean);
    if (courseIds.length > 0) {
      const courseDocs =
        (await this.dbConnection.db
          ?.collection('cours')
          .find({ id: { $in: courseIds } })
          .project({ id: 1, titre: 1, title: 1, name: 1 })
          .toArray()) || [];
      const titleById = new Map(
        courseDocs.map((c: any) => [
          c.id,
          (c.titre || c.title || c.name || c.id || '').toString(),
        ]),
      );
      byCourse = byCourse.map((c: any) => ({
        ...c,
        title: titleById.get(c.contentId) || c.contentId,
      }));
    }

    const tracking = this.dbConnection.collection('trackingactions');

    const chapterCompletesByCourse = await tracking
      .aggregate([
        { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'course' } },
        { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
        { $unwind: '$course' },
        { $match: { 'course.creatorId': this.getCreatorObjectId(creatorId) } },
        ...(communityScope.hasFilter ? [{ $match: this.buildLookupCommunityMatch('course.communityId', communityScope.lookupCommunityValues) }] : []),
        {
          $group: {
            _id: '$contentId',
            chapterCompletes: { $sum: { $cond: [isChapterCompleteActionExpr, 1, 0] } },
          },
        },
        { $project: { _id: 0, contentId: '$_id', chapterCompletes: 1 } },
      ])
      .toArray();

    if (chapterCompletesByCourse.length > 0) {
      const chapterCompletesMap = new Map(
        chapterCompletesByCourse.map((entry: any) => [String(entry.contentId), Number(entry.chapterCompletes || 0)]),
      );
      const existingCourseIds = new Set(byCourse.map((entry: any) => String(entry.contentId)));
      byCourse = byCourse.map((entry: any) => ({
        ...entry,
        chapterCompletes: chapterCompletesMap.get(String(entry.contentId)) ?? Number(entry.chapterCompletes || 0),
      }));

      for (const [contentId, chapterCompletes] of chapterCompletesMap.entries()) {
        if (existingCourseIds.has(contentId)) continue;
        byCourse.push({
          contentId,
          title: contentId,
          views: 0,
          starts: 0,
          completes: 0,
          chapterCompletes,
          watchTime: 0,
          ratingsCount: 0,
          completionRate: 0,
        });
      }

      byCourse.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
    }

    // Chapter funnel (drop-offs) from trackingactions metadata if available (chapterId)
    const funnelPipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'course' } },
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $unwind: '$course' },
      { $match: { 'course.creatorId': this.getCreatorObjectId(creatorId) } },
    ];

    if (communityScope.hasFilter) {
      funnelPipeline.push({ $match: this.buildLookupCommunityMatch('course.communityId', communityScope.lookupCommunityValues) });
    }

    funnelPipeline.push(
      {
        $project: {
          contentId: 1,
          actionType: 1,
          chapterId: '$metadata.chapterId',
          chapterIdNormalized: chapterIdExpr,
        },
      },
      { $match: { chapterIdNormalized: { $ne: '' } } },
      {
        $group: {
          _id: { contentId: '$contentId', chapterId: '$chapterIdNormalized' },
          views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
          starts: { $sum: { $cond: [isChapterStartActionExpr, 1, 0] } },
          completes: { $sum: { $cond: [isChapterCompleteActionExpr, 1, 0] } },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', chapterId: '$_id.chapterId', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { contentId: 1 } },
    );

    const chapterFunnel = await tracking.aggregate(funnelPipeline).toArray();

    this.setCache(key, { byCourse, chapterFunnel });
    return { byCourse, chapterFunnel };
  }

  async getChallenges(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `challenges:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const match = {
      creatorId: this.getCreatorObjectId(creatorId),
      date: { $gte: from, $lte: to },
      contentType: 'challenge',
    } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    // Aggregate from AnalyticsDaily for basic metrics
    const byChallenge = await this.dailyModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          likes: { $sum: '$likes' },
          shares: { $sum: '$shares' },
          bookmarks: { $sum: '$bookmarks' },
        },
      },
      {
        $project: {
          _id: 0,
          contentId: '$_id',
          views: 1,
          starts: 1,
          completes: 1,
          likes: 1,
          shares: 1,
          bookmarks: 1,
          participants: '$starts',
          submissions: '$completes',
          winners: { $floor: { $multiply: [{ $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] }, 0.3] } },
          completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $multiply: [{ $divide: ['$completes', '$starts'] }, 100] }, 0] }
        }
      },
      { $sort: { completes: -1 } },
    ]);

    // Prefer GA4 content stats when available
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'challenge',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );

      if (ga4Stats.length > 0) {
        byChallenge.length = 0;
        for (const s of ga4Stats) {
          const completionRate = s.starts > 0 ? (s.completes / s.starts) * 100 : 0;
          byChallenge.push({
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            likes: s.likes,
            shares: s.shares,
            bookmarks: s.bookmarks,
            participants: s.starts,
            submissions: s.completes,
            winners: completionRate >= 90 ? Math.max(1, Math.floor(s.completes * 0.3)) : 0,
            completionRate,
          });
        }
        byChallenge.sort((a: any, b: any) => Number(b.completes || 0) - Number(a.completes || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }

    // Get challenge titles
    const challengeIds = byChallenge.map((c: any) => c.contentId).filter(Boolean);
    if (challengeIds.length > 0) {
      const challengeDocs =
        (await this.dbConnection.db
          ?.collection('challenges')
          .find({ id: { $in: challengeIds } })
          .project({ id: 1, title: 1, tasks: 1 })
          .toArray()) || [];
      const titleById = new Map(
        challengeDocs.map((c: any) => [
          c.id,
          (c.title || c.id || '').toString(),
        ]),
      );
      const tasksById = new Map(
        challengeDocs.map((c: any) => [
          c.id,
          c.tasks?.length || 0,
        ]),
      );

      // Update with titles and recalculate winners based on task completion
      for (const c of byChallenge) {
        c.title = titleById.get(c.contentId) || c.contentId;
        const totalTasks = tasksById.get(c.contentId) || 1;
        // Winners are users who completed all tasks (approximated by having completionRate >= 90%)
        c.winners = c.completionRate >= 90 ? Math.max(1, Math.floor(c.completes * 0.3)) : 0;
      }
    }

    // Task-level funnel using trackingactions metadata.taskId
    const tracking = this.dbConnection.collection('trackingactions');
    const funnelPipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': this.getCreatorObjectId(creatorId) } },
    ];

    if (communityScope.hasFilter) {
      funnelPipeline.push({ $match: this.buildLookupCommunityMatch('challenge.communityId', communityScope.lookupCommunityValues) });
    }

    funnelPipeline.push(
      { $project: { contentId: 1, actionType: 1, taskId: '$metadata.taskId', userId: 1, metadata: 1 } },
      { $match: { taskId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { contentId: '$contentId', taskId: '$taskId' },
          uniqueUsers: { $addToSet: '$userId' },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
          completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, contentId: '$_id.contentId', taskId: '$_id.taskId', starts: 1, completes: 1, uniqueUsers: { $size: '$uniqueUsers' }, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { contentId: 1 } },
    );

    const stepFunnel = await tracking.aggregate(funnelPipeline).toArray();

    // Get distinct participants per challenge from tracking
    const participantsPipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge', actionType: 'start' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': this.getCreatorObjectId(creatorId) } },
    ];

    if (communityScope.hasFilter) {
      participantsPipeline.push({ $match: this.buildLookupCommunityMatch('challenge.communityId', communityScope.lookupCommunityValues) });
    }

    participantsPipeline.push(
      { $group: { _id: { contentId: '$contentId', userId: '$userId' } } },
      { $group: { _id: '$_id.contentId', participants: { $sum: 1 } } },
      { $project: { _id: 0, contentId: '$_id', participants: 1 } }
    );

    const participantsData = await tracking.aggregate(participantsPipeline).toArray();
    const participantsMap = new Map(participantsData.map(p => [p.contentId, p.participants]));

    // Merge participants into byChallenge
    for (const c of byChallenge) {
      c.participants = participantsMap.get(c.contentId) || c.starts || 0;
    }

    // FALLBACK: If no rollup data, build challenge list from trackingactions directly
    if (byChallenge.length === 0) {
      const trackingAggPipeline: any[] = [
        { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge' } },
        { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
        { $unwind: '$challenge' },
      { $match: { 'challenge.creatorId': this.getCreatorObjectId(creatorId) } },
      ];

      if (communityScope.hasFilter) {
        trackingAggPipeline.push({ $match: this.buildLookupCommunityMatch('challenge.communityId', communityScope.lookupCommunityValues) });
      }

      trackingAggPipeline.push(
        {
          $group: {
            _id: '$contentId',
            views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
            starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
            completes: { $sum: { $cond: [{ $eq: ['$actionType', 'complete'] }, 1, 0] } },
            likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
            shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
            bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
            challengeTitle: { $first: '$challenge.title' },
            challengeTasks: { $first: '$challenge.tasks' },
          },
        },
        {
          $project: {
            _id: 0,
            contentId: '$_id',
            views: 1,
            starts: 1,
            completes: 1,
            likes: 1,
            shares: 1,
            bookmarks: 1,
            participants: '$starts',
            submissions: '$completes',
            winners: { $floor: { $multiply: [{ $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] }, 0.3] } },
            completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $multiply: [{ $divide: ['$completes', '$starts'] }, 100] }, 0] },
            title: '$challengeTitle',
            totalTasks: { $size: { $ifNull: ['$challengeTasks', []] } },
          },
        },
        { $sort: { completes: -1 } },
      );

      const trackingResults = await tracking.aggregate(trackingAggPipeline).toArray();

      // Recalculate winners based on completion rate
      for (const c of trackingResults) {
        c.winners = c.completionRate >= 90 ? Math.max(1, Math.floor(c.completes * 0.3)) : 0;
        // Override participants with distinct count from participantsMap if available
        c.participants = participantsMap.get(c.contentId) || c.starts || 0;
      }

      if (trackingResults.length > 0) {
        this.setCache(key, { byChallenge: trackingResults, stepFunnel });
        return { byChallenge: trackingResults, stepFunnel };
      }
    }

    // FINAL FALLBACK: Query actual challenge documents + submissions collection directly
    // This ensures data shows up even when no tracking events or rollup data exist
    try {
      const challengeQuery: any = { creatorId: this.getCreatorObjectId(creatorId) }; // removed isActive: true to show historical data
      if (communityScope.hasFilter) {
        challengeQuery.communityId = { $in: communityScope.lookupCommunityValues };
      }

      const challengeDocs = await this.dbConnection.db
        ?.collection('challenges')
        .find(challengeQuery)
        .project({ id: 1, _id: 1, title: 1, tasks: 1, participants: 1, communityId: 1 })
        .toArray() || [];

      if (challengeDocs.length > 0) {
        const challengeObjectIds = challengeDocs.map((c: any) => c._id);

        // Count submissions within the date range
        const submissionCounts = await this.dbConnection.db
          ?.collection('challengesubmissions')
          .aggregate([
            {
              $match: {
                challengeId: { $in: challengeObjectIds },
                createdAt: { $gte: from, $lte: to } // Filter by date range
              }
            },
            { $group: { _id: '$challengeId', count: { $sum: 1 } } },
          ])
          .toArray() || [];

        const submissionMap = new Map(
          submissionCounts.map((s: any) => [s._id.toString(), s.count]),
        );

        if (byChallenge.length === 0) {
          // No rollup or tracking data at all — build from challenge docs
          const liveData = challengeDocs.map((c: any) => {
            // Filter participants by joinedAt date range
            const participantsList = Array.isArray(c.participants) ? c.participants : [];
            const periodParticipants = participantsList.filter((p: any) => {
              const joinedAt = new Date(p.joinedAt || p.createdAt || 0);
              return joinedAt >= from && joinedAt <= to;
            }).length;

            const submissionCount = submissionMap.get(c._id.toString()) || 0;
            const totalTasks = Array.isArray(c.tasks) ? c.tasks.length : 0;
            const completionRate = periodParticipants > 0
              ? (submissionCount / (periodParticipants * Math.max(totalTasks, 1))) * 100
              : 0;

            // Only include if there's activity or we really want to show valid challenges with 0 activity?
            // Usually analytics shows items with 0 activity if they exist? 
            // Better to show them.

            return {
              contentId: c.id || c._id.toString(),
              title: c.title || c.id || 'Untitled Challenge',
              views: periodParticipants, // Proxy views with starts for fallback
              starts: periodParticipants,
              completes: submissionCount > 0 ? Math.ceil(submissionCount / Math.max(totalTasks, 1)) : 0, // Approx
              likes: 0,
              shares: 0,
              bookmarks: 0,
              participants: periodParticipants, // Valid for the period
              submissions: submissionCount,
              winners: 0,
              completionRate: Math.round(completionRate),
              totalTasks,
            };
          });

          // Sort by submissions or starts
          liveData.sort((a: any, b: any) => b.submissions - a.submissions);

          this.setCache(key, { byChallenge: liveData, stepFunnel });
          return { byChallenge: liveData, stepFunnel };
        } else {
          // Enrich existing byChallenge entries
          // Note: Rollup data is already date-filtered. 
          // If we enrich, we should use the period-filtered fallback data too.
          const liveMap = new Map(
            challengeDocs.map((c: any) => {
              const participantsList = Array.isArray(c.participants) ? c.participants : [];
              const periodParticipants = participantsList.filter((p: any) => {
                const joinedAt = new Date(p.joinedAt || p.createdAt || 0);
                return joinedAt >= from && joinedAt <= to;
              }).length;

              return [
                c.id || c._id.toString(),
                {
                  participants: periodParticipants,
                  submissions: submissionMap.get(c._id.toString()) || 0,
                },
              ];
            }),
          );

          for (const c of byChallenge) {
            const live = liveMap.get(c.contentId);
            if (live) {
              // Only override if live data is greater (missing tracking)
              // But wait, if rollup says 0 and live says 5, usage live.
              c.participants = Math.max(c.participants || 0, live.participants);
              c.submissions = Math.max(c.submissions || 0, live.submissions);
            }
          }
        }
      }
    } catch (liveErr) {
      console.warn('[AnalyticsService] Live challenge data fallback error:', liveErr);
    }

    this.setCache(key, { byChallenge, stepFunnel });
    return { byChallenge, stepFunnel };
  }

  async getSessions(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `sessions:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'session' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const bySession = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, starts: { $sum: '$starts' }, completes: { $sum: '$completes' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1, completionRate: { $cond: [{ $gt: ['$starts', 0] }, { $divide: ['$completes', '$starts'] }, 0] } } },
      { $sort: { views: -1 } },
    ]);
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'session',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        bySession.length = 0;
        for (const s of ga4Stats) {
          bySession.push({
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            completionRate: s.starts > 0 ? s.completes / s.starts : 0,
          });
        }
        bySession.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { bySession });
    return { bySession };
  }

  async getEvents(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `events:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'event' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const byEvent = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, starts: { $sum: '$starts' }, completes: { $sum: '$completes' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, starts: 1, completes: 1 } },
      { $sort: { views: -1 } },
    ]);

    // Revenue by event for the same period/scope.
    const revenueMatch: any = {
      creatorId: this.getCreatorObjectId(creatorId),
      status: 'paid',
      contentType: 'event',
      createdAt: { $gte: from, $lte: to },
    };
    if (communityScope.hasFilter) {
      revenueMatch.communityId = { $in: communityScope.lookupCommunityValues };
    }

    const revenueByEvent = await this.dbConnection.db?.collection('orders').aggregate([
      { $match: revenueMatch },
      {
        $group: {
          _id: '$contentId',
          revenue: { $sum: '$creatorNetDT' },
          salesCount: { $sum: 1 },
        }
      },
      {
        $project: {
          _id: 0,
          contentId: '$_id',
          revenue: 1,
          salesCount: 1,
        }
      }
    ]).toArray() || [];

    const revenueMap = new Map<string, { revenue: number; salesCount: number }>(
      revenueByEvent.map((item: any) => [
        String(item.contentId),
        {
          revenue: Number(item.revenue || 0),
          salesCount: Number(item.salesCount || 0),
        },
      ]),
    );
    const fullRevenueMap = new Map(revenueMap);

    for (const item of byEvent) {
      const revenueItem = revenueMap.get(String(item.contentId));
      (item as any).revenue = Number(revenueItem?.revenue || 0);
      (item as any).salesCount = Number(revenueItem?.salesCount || 0);
      revenueMap.delete(String(item.contentId));
    }

    // Include events that have revenue but no tracking rows.
    for (const [contentId, rev] of revenueMap.entries()) {
      byEvent.push({
        contentId,
        views: 0,
        starts: 0,
        completes: 0,
        revenue: Number(rev.revenue || 0),
        salesCount: Number(rev.salesCount || 0),
      } as any);
    }
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'event',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        byEvent.length = 0;
        const remainingRevenueMap = new Map(fullRevenueMap);
        for (const s of ga4Stats) {
          const revenueItem = remainingRevenueMap.get(String(s.contentId));
          byEvent.push({
            contentId: s.contentId,
            views: s.views,
            starts: s.starts,
            completes: s.completes,
            revenue: Number(revenueItem?.revenue || 0),
            salesCount: Number(revenueItem?.salesCount || 0),
          });
          remainingRevenueMap.delete(String(s.contentId));
        }
        // Include revenue-only events even when GA4 data exists.
        for (const [contentId, rev] of remainingRevenueMap.entries()) {
          if (!byEvent.some((e: any) => String(e.contentId) === String(contentId))) {
            byEvent.push({
              contentId,
              views: 0,
              starts: 0,
              completes: 0,
              revenue: Number(rev.revenue || 0),
              salesCount: Number(rev.salesCount || 0),
            } as any);
          }
        }
        byEvent.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { byEvent });
    return { byEvent };
  }

  async getProducts(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `products:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const match = { creatorId: this.getCreatorObjectId(creatorId), date: { $gte: from, $lte: to }, contentType: 'product' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const byProduct = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, likes: { $sum: '$likes' }, shares: { $sum: '$shares' }, downloads: { $sum: '$downloads' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, downloads: 1 } },
      { $sort: { views: -1 } },
    ]);
    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'product',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        byProduct.length = 0;
        for (const s of ga4Stats) {
          byProduct.push({
            contentId: s.contentId,
            views: s.views,
            likes: s.likes,
            shares: s.shares,
            downloads: s.downloads,
          });
        }
        byProduct.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { byProduct });
    return { byProduct };
  }

  async getPosts(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `posts:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;
    const creatorObjectId = this.getCreatorObjectId(creatorId);
    const match = { creatorId: creatorObjectId, date: { $gte: from, $lte: to }, contentType: 'post' } as any;

    if (communityScope.hasFilter) {
      this.setDailyCommunityFilter(match, communityScope.communityIdStrings);
    }

    const byPost = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentId', views: { $sum: '$views' }, likes: { $sum: '$likes' }, shares: { $sum: '$shares' }, bookmarks: { $sum: '$bookmarks' }, ratingsCount: { $sum: '$ratingsCount' } } },
      { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, bookmarks: 1, ratingsCount: 1 } },
      { $sort: { views: -1 } },
    ]);

    const hasRollupActivity = byPost.some((row: any) =>
      Number(row?.views || 0) > 0 ||
      Number(row?.likes || 0) > 0 ||
      Number(row?.shares || 0) > 0 ||
      Number(row?.bookmarks || 0) > 0 ||
      Number(row?.ratingsCount || 0) > 0,
    );

    if (!hasRollupActivity) {
      const trackingFallback = await this.dbConnection.collection('trackingactions').aggregate([
        { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'post' } },
        { $lookup: { from: 'posts', localField: 'contentId', foreignField: 'id', as: 'post' } },
        { $unwind: { path: '$post', preserveNullAndEmptyArrays: false } },
        { $match: { 'post.authorId': creatorObjectId } },
        ...(communityScope.hasFilter
          ? [{ $match: this.buildLookupCommunityMatch('post.communityId', communityScope.lookupCommunityValues) }]
          : []),
        {
          $group: {
            _id: '$contentId',
            views: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.VIEW] }, 1, 0] } },
            likes: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.LIKE] }, 1, 0] } },
            shares: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.SHARE] }, 1, 0] } },
            bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.BOOKMARK] }, 1, 0] } },
            ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.RATE] }, 1, 0] } },
          },
        },
        { $project: { _id: 0, contentId: '$_id', views: 1, likes: 1, shares: 1, bookmarks: 1, ratingsCount: 1 } },
        { $sort: { views: -1 } },
      ]).toArray();

      if (trackingFallback.length > 0) {
        byPost.length = 0;
        byPost.push(...trackingFallback);
        this.logger.log(
          `Post analytics fallback used for creator=${creatorId}; rows=${trackingFallback.length}; range=${from.toISOString()}..${to.toISOString()}`,
        );
      }
    }

    try {
      const ga4Stats = await this.ga4ReportingService.getCreatorContentStats(
        creatorId,
        'post',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );
      if (ga4Stats.length > 0) {
        byPost.length = 0;
        for (const s of ga4Stats) {
          byPost.push({
            contentId: s.contentId,
            views: s.views,
            likes: s.likes,
            shares: s.shares,
            bookmarks: s.bookmarks,
            ratingsCount: s.ratingsCount,
          });
        }
        byPost.sort((a: any, b: any) => Number(b.views || 0) - Number(a.views || 0));
      }
    } catch {
      // Keep Mongo aggregate
    }
    this.setCache(key, { byPost });
    return { byPost };
  }

  // Build daily rollups for a specific creator and day (UTC boundaries)
  async rollupDayForCreator(
    creatorId: string,
    day: Date,
    options?: { skipInvalidation?: boolean },
  ) {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999));

    const tracking = this.dbConnection.collection('trackingactions');

    // Helper to build aggregate for a specific type
    const buildTypeAgg = async (type: string, collectionName: string) => {
      const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
      const creatorFieldPath = type === 'post' ? 'meta.authorId' : 'meta.creatorId';
      const completesCondition =
        type === 'course'
          ? {
              $and: [
                { $eq: ['$actionType', TrackingActionType.COMPLETE] },
                { $eq: [chapterIdExpr, ''] },
              ],
            }
          : { $eq: ['$actionType', TrackingActionType.COMPLETE] };
      const chapterCompletesCondition =
        type === 'course'
          ? {
              $or: [
                { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
                {
                  $and: [
                    { $eq: ['$actionType', TrackingActionType.COMPLETE] },
                    { $ne: [chapterIdExpr, ''] },
                  ],
                },
              ],
            }
          : false;

      return tracking.aggregate([
        { $match: { timestamp: { $gte: start, $lte: end }, contentType: type } },
        { $lookup: { from: collectionName, localField: 'contentId', foreignField: 'id', as: 'meta' } },
        { $unwind: { path: '$meta', preserveNullAndEmptyArrays: false } },
        { $match: { [creatorFieldPath]: new Types.ObjectId(creatorId) } },
        {
          $group: {
            _id: { contentId: '$contentId' },
            communityId: { $first: '$meta.communityId' },
            views: { $sum: { $cond: [{ $eq: ['$actionType', 'view'] }, 1, 0] } },
            starts: { $sum: { $cond: [{ $eq: ['$actionType', 'start'] }, 1, 0] } },
            completes: { $sum: { $cond: [completesCondition, 1, 0] } },
            chapterCompletes: { $sum: { $cond: [chapterCompletesCondition, 1, 0] } },
            likes: { $sum: { $cond: [{ $eq: ['$actionType', 'like'] }, 1, 0] } },
            shares: { $sum: { $cond: [{ $eq: ['$actionType', 'share'] }, 1, 0] } },
            downloads: { $sum: { $cond: [{ $eq: ['$actionType', 'download'] }, 1, 0] } },
            bookmarks: { $sum: { $cond: [{ $eq: ['$actionType', 'bookmark'] }, 1, 0] } },
            ratingsCount: { $sum: { $cond: [{ $eq: ['$actionType', 'rate'] }, 1, 0] } },
            users: { $addToSet: '$userId' },
          },
        },
        { $project: { _id: 0, contentId: '$_id.contentId', communityId: 1, views: 1, starts: 1, completes: 1, chapterCompletes: 1, likes: 1, shares: 1, downloads: 1, bookmarks: 1, ratingsCount: 1, uniqueUsers: { $size: '$users' } } },
      ]).toArray();
    };

    const courseAgg = await buildTypeAgg('course', 'cours');
    const challengeAgg = await buildTypeAgg('challenge', 'challenges');
    const sessionAgg = await buildTypeAgg('session', 'sessions');
    const eventAgg = await buildTypeAgg('event', 'events');
    const productAgg = await buildTypeAgg('product', 'products');
    const postAgg = await buildTypeAgg('post', 'posts');

    const docs: any[] = [];
    courseAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'course', ...c, date: start }));
    challengeAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'challenge', ...c, date: start }));
    sessionAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'session', ...c, date: start }));
    eventAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'event', ...c, date: start }));
    productAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'product', ...c, date: start }));
    postAgg.forEach(c => docs.push({ creatorId: new Types.ObjectId(creatorId), contentType: 'post', ...c, date: start }));

    for (const d of docs) {
      await this.dailyModel.updateOne(
        { creatorId: d.creatorId, contentType: d.contentType, contentId: d.contentId, date: d.date },
        { $set: d },
        { upsert: true },
      );
    }

    if (!options?.skipInvalidation) {
      await this.invalidateCreatorCache(creatorId);
    }
    return {
      updated: docs.length,
      date: start.toISOString(),
      byType: {
        course: courseAgg.length,
        challenge: challengeAgg.length,
        session: sessionAgg.length,
        event: eventAgg.length,
        product: productAgg.length,
        post: postAgg.length,
      },
    };
  }

  async backfillForCreator(creatorId: string, days: number = 90) {
    const completionBackfill = await this.backfillCourseCompletionEventsForCreator(creatorId, days);

    const today = new Date();
    let count = 0;
    let postCount = 0;
    for (let i = days; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 24 * 3600 * 1000);
      const r = await this.rollupDayForCreator(creatorId, day, { skipInvalidation: true });
      count += r.updated;
      postCount += Number(r.byType?.post || 0);
    }
    await this.invalidateCreatorCache(creatorId);
    this.logger.log(
      `Analytics backfill completed for creator=${creatorId}; days=${days}; updated=${count}; postRows=${postCount}; courseCompletionEventsBackfilled=${completionBackfill.inserted}`,
    );
    return {
      ok: true,
      updated: count,
      postRollupUpdated: postCount,
      postsBackfilledDays: days,
      courseCompletionEventsBackfilled: completionBackfill.inserted,
      completionDaysTouched: completionBackfill.daysTouched,
    };
  }

  private async backfillCourseCompletionEventsForCreator(creatorId: string, days: number) {
    const creatorObjectId = this.getCreatorObjectId(creatorId);
    const from = new Date(Date.now() - Math.max(1, days) * 24 * 3600 * 1000);

    const courses = await this.dbConnection.db
      ?.collection('cours')
      .find({ creatorId: creatorObjectId })
      .project({ _id: 1, id: 1, sections: 1 })
      .toArray() || [];

    if (!courses.length) {
      return { inserted: 0, daysTouched: 0 };
    }

    const courseMap = new Map<string, { trackingId: string; totalChapters: number }>();
    const courseObjectIds: Types.ObjectId[] = [];
    for (const course of courses) {
      const mongoId = String(course._id);
      const totalChapters = Array.isArray(course.sections)
        ? course.sections.reduce(
            (acc: number, section: any) => acc + (Array.isArray(section?.chapitres) ? section.chapitres.length : 0),
            0,
          )
        : 0;
      courseMap.set(mongoId, {
        trackingId: String(course.id || course._id),
        totalChapters,
      });
      courseObjectIds.push(course._id);
    }

    const enrollments = await this.dbConnection.db
      ?.collection('courseenrollments')
      .find({
        isActive: true,
        courseId: { $in: courseObjectIds },
        updatedAt: { $gte: from },
      })
      .project({ _id: 1, userId: 1, courseId: 1, progression: 1, completedAt: 1, updatedAt: 1, enrolledAt: 1 })
      .toArray() || [];

    const trackingCollection = this.dbConnection.collection('trackingactions');
    const contentProgressCollection = this.dbConnection.collection('contentprogresses');
    let inserted = 0;
    const touchedDays = new Set<string>();

    for (const enrollment of enrollments) {
      const courseMeta = courseMap.get(String(enrollment.courseId));
      if (!courseMeta || courseMeta.totalChapters <= 0) continue;

      const completedChapters = Array.isArray(enrollment.progression)
        ? enrollment.progression.filter((p: any) => Boolean(p?.isCompleted)).length
        : 0;
      if (completedChapters < courseMeta.totalChapters) continue;

      const rawUserId = String(enrollment.userId || '');
      if (!(enrollment.userId instanceof Types.ObjectId) && !Types.ObjectId.isValid(rawUserId)) {
        continue;
      }
      const userId = enrollment.userId instanceof Types.ObjectId
        ? enrollment.userId
        : new Types.ObjectId(rawUserId);
      const completionDate = new Date(
        enrollment.completedAt || enrollment.updatedAt || enrollment.enrolledAt || Date.now(),
      );

      const existingComplete = await trackingCollection.findOne({
        userId,
        contentType: 'course',
        contentId: courseMeta.trackingId,
        actionType: 'complete',
        $or: [
          { 'metadata.chapterId': { $exists: false } },
          { 'metadata.chapterId': '' },
          { 'metadata.chapterId': null },
        ],
      });

      if (existingComplete) continue;

      await trackingCollection.insertOne({
        id: new Types.ObjectId().toString(),
        userId,
        contentId: courseMeta.trackingId,
        contentType: 'course',
        actionType: 'complete',
        metadata: {
          source: 'analytics_backfill_course_completion',
          autoFromChapterCompletion: true,
          backfilled: true,
        },
        timestamp: completionDate,
      });

      await contentProgressCollection.updateOne(
        {
          userId,
          contentType: 'course',
          contentId: courseMeta.trackingId,
        },
        {
          $set: {
            isCompleted: true,
            completedAt: completionDate,
            lastAccessedAt: completionDate,
          },
          $setOnInsert: {
            id: new Types.ObjectId().toString(),
            metadata: {},
            watchTime: 0,
            viewCount: 0,
            likeCount: 0,
            shareCount: 0,
            downloadCount: 0,
            bookmarks: [],
          },
        },
        { upsert: true },
      );

      inserted += 1;
      const dayKey = new Date(Date.UTC(
        completionDate.getUTCFullYear(),
        completionDate.getUTCMonth(),
        completionDate.getUTCDate(),
      )).toISOString();
      touchedDays.add(dayKey);
    }

    return { inserted, daysTouched: touchedDays.size };
  }

  private isMeaningfulDeviceValue(device: string | undefined | null): boolean {
    const value = (device || '').trim().toLowerCase();
    return (
      value !== '' &&
      value !== 'unknown' &&
      value !== '(not set)' &&
      value !== 'not set' &&
      value !== '(not provided)' &&
      value !== 'undefined' &&
      value !== 'null'
    );
  }

  private normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeIpAddress(value: unknown): string | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    const candidate = raw.split(',')[0]?.trim();
    if (!candidate) return null;
    return candidate.startsWith('::ffff:') ? candidate.slice(7) : candidate;
  }

  private extractDeviceModelFromUserAgent(userAgent: string | null): string | null {
    if (!userAgent) return null;

    const iosMatch = userAgent.match(/\((iPhone|iPad|iPod)[^)]*\)/i);
    if (iosMatch?.[1]) return iosMatch[1];

    const androidBuildMatch = userAgent.match(/Android[^;)]*;\s*([^;)]+?)\s*Build\//i);
    if (androidBuildMatch?.[1]) return androidBuildMatch[1].trim();

    const androidGenericMatch = userAgent.match(/Android[^;)]*;\s*([^;)]+?)\)/i);
    if (androidGenericMatch?.[1]) return androidGenericMatch[1].trim();

    if (/\bMacintosh\b/i.test(userAgent)) return 'Mac';
    if (/\bWindows\b/i.test(userAgent)) return 'Windows PC';

    return null;
  }

  private buildTrackingScopePipeline(
    creatorId: string,
    from: Date | null,
    to: Date | null,
    communityScope: { hasFilter: boolean; lookupCommunityValues: Array<string | Types.ObjectId> },
  ) {
    const contentDoc = {
      $ifNull: [
        { $arrayElemAt: ['$course', 0] },
        {
          $ifNull: [
            { $arrayElemAt: ['$challenge', 0] },
            {
              $ifNull: [
                { $arrayElemAt: ['$session', 0] },
                {
                  $ifNull: [
                    { $arrayElemAt: ['$event', 0] },
                    {
                      $ifNull: [
                        { $arrayElemAt: ['$product', 0] },
                        { $arrayElemAt: ['$post', 0] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const pipeline: any[] = [];
    if (from && to) {
      pipeline.push({ $match: { timestamp: { $gte: from, $lte: to } } });
    }

    pipeline.push(
      { $lookup: { from: 'cours', localField: 'contentId', foreignField: 'id', as: 'course' } },
      { $lookup: { from: 'challenges', localField: 'contentId', foreignField: 'id', as: 'challenge' } },
      { $lookup: { from: 'sessions', localField: 'contentId', foreignField: 'id', as: 'session' } },
      { $lookup: { from: 'events', localField: 'contentId', foreignField: 'id', as: 'event' } },
      { $lookup: { from: 'products', localField: 'contentId', foreignField: 'id', as: 'product' } },
      { $lookup: { from: 'posts', localField: 'contentId', foreignField: 'id', as: 'post' } },
      { $addFields: { contentDoc } },
      { $addFields: { creatorIdResolved: { $ifNull: ['$contentDoc.creatorId', '$contentDoc.authorId'] } } },
      { $match: { creatorIdResolved: this.getCreatorObjectId(creatorId) } },
    );

    if (communityScope.hasFilter) {
      pipeline.push({ $match: this.buildLookupCommunityMatch('contentDoc.communityId', communityScope.lookupCommunityValues) });
    }

    return pipeline;
  }

  private async resolveLatestKnownIps(
    tracking: any,
    creatorId: string,
    communityScope: { hasFilter: boolean; lookupCommunityValues: Array<string | Types.ObjectId> },
    userIds: string[],
  ): Promise<Map<string, string>> {
    const normalizedUserIds = Array.from(new Set(userIds.filter((value) => Types.ObjectId.isValid(value))));
    if (!normalizedUserIds.length) return new Map();

    const objectIds = normalizedUserIds.map((value) => new Types.ObjectId(value));
    const basePipeline = this.buildTrackingScopePipeline(creatorId, null, null, communityScope);

    const rows = await tracking.aggregate([
      ...basePipeline,
      { $match: { userId: { $in: objectIds } } },
      {
        $project: {
          userId: 1,
          timestamp: 1,
          ipAddress: {
            $ifNull: [
              '$metadata.ipAddress',
              {
                $ifNull: [
                  '$metadata.ip',
                  {
                    $ifNull: [
                      '$metadata.clientIp',
                      {
                        $ifNull: ['$metadata.remoteIp', '$metadata.ip_address'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $match: {
          ipAddress: {
            $nin: [null, '', 'unknown', '(not set)', 'not set', '(not provided)', 'undefined', 'null'],
          },
        },
      },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$userId', ipAddress: { $first: '$ipAddress' } } },
      { $project: { _id: 0, userId: '$_id', ipAddress: 1 } },
    ]).toArray();

    const map = new Map<string, string>();
    rows.forEach((row: any) => {
      const userId = row?.userId ? row.userId.toString() : null;
      const ipAddress = this.normalizeIpAddress(row?.ipAddress);
      if (userId && ipAddress) {
        map.set(userId, ipAddress);
      }
    });

    return map;
  }

  private buildDeviceAggregatePipeline(basePipeline: any[]) {
    return [
      ...basePipeline,
      { $addFields: { uaLower: { $toLower: { $ifNull: ['$metadata.userAgent', ''] } } } },
      {
        $project: {
          userId: 1,
          device: {
            $ifNull: [
              '$metadata.device',
              {
                $cond: [
                  {
                    $or: [
                      { $regexMatch: { input: '$uaLower', regex: 'ipad|tablet|playbook|silk' } },
                      {
                        $and: [
                          { $regexMatch: { input: '$uaLower', regex: 'android' } },
                          { $not: [{ $regexMatch: { input: '$uaLower', regex: 'mobile' } }] },
                        ],
                      },
                    ],
                  },
                  'tablet',
                  {
                    $cond: [
                      { $regexMatch: { input: '$uaLower', regex: 'mobi|iphone|ipod|iemobile|blackberry|kindle|opera mini|windows phone|android' } },
                      'mobile',
                      'desktop',
                    ],
                  },
                ],
              },
            ],
          },
          os: { $ifNull: ['$metadata.os', 'unknown'] },
          browser: { $ifNull: ['$metadata.browser', 'unknown'] },
        },
      },
      { $group: { _id: { device: '$device', os: '$os', browser: '$browser', userId: '$userId' } } },
      { $group: { _id: { device: '$_id.device', os: '$_id.os', browser: '$_id.browser' }, count: { $sum: 1 } } },
      { $project: { _id: 0, device: '$_id.device', os: '$_id.os', browser: '$_id.browser', count: 1 } },
      { $sort: { count: -1 } },
    ];
  }

  private buildDeviceDetailsPipeline(basePipeline: any[]) {
    return [
      ...basePipeline,
      { $addFields: { uaLower: { $toLower: { $ifNull: ['$metadata.userAgent', ''] } } } },
      {
        $project: {
          userId: 1,
          timestamp: 1,
          userAgent: { $ifNull: ['$metadata.userAgent', null] },
          device: {
            $ifNull: [
              '$metadata.device',
              {
                $cond: [
                  {
                    $or: [
                      { $regexMatch: { input: '$uaLower', regex: 'ipad|tablet|playbook|silk' } },
                      {
                        $and: [
                          { $regexMatch: { input: '$uaLower', regex: 'android' } },
                          { $not: [{ $regexMatch: { input: '$uaLower', regex: 'mobile' } }] },
                        ],
                      },
                    ],
                  },
                  'tablet',
                  {
                    $cond: [
                      { $regexMatch: { input: '$uaLower', regex: 'mobi|iphone|ipod|iemobile|blackberry|kindle|opera mini|windows phone|android' } },
                      'mobile',
                      'desktop',
                    ],
                  },
                ],
              },
            ],
          },
          os: { $ifNull: ['$metadata.os', 'unknown'] },
          browser: { $ifNull: ['$metadata.browser', 'unknown'] },
          ipAddress: {
            $ifNull: [
              '$metadata.ipAddress',
              {
                $ifNull: [
                  '$metadata.ip',
                  { $ifNull: ['$metadata.clientIp', '$metadata.remoteIp'] },
                ],
              },
            ],
          },
          deviceModel: {
            $ifNull: [
              '$metadata.deviceModel',
              { $ifNull: ['$metadata.model', '$metadata.device_name'] },
            ],
          },
        },
      },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            userId: '$userId',
            device: '$device',
            os: '$os',
            browser: '$browser',
            ipAddress: '$ipAddress',
          },
          lastSeenAt: { $first: '$timestamp' },
          eventsCount: { $sum: 1 },
          userAgent: { $first: '$userAgent' },
          deviceModel: { $first: '$deviceModel' },
        },
      },
      { $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' } },
      { $addFields: { user: { $arrayElemAt: ['$user', 0] } } },
      {
        $project: {
          _id: 0,
          userId: '$_id.userId',
          userName: '$user.name',
          userEmail: '$user.email',
          device: '$_id.device',
          os: '$_id.os',
          browser: '$_id.browser',
          ipAddress: '$_id.ipAddress',
          lastSeenAt: 1,
          eventsCount: 1,
          userAgent: 1,
          deviceModel: 1,
        },
      },
      { $sort: { lastSeenAt: -1 } },
      { $limit: 100 },
    ];
  }

  private async queryTrackingDeviceDetails(tracking: any, pipeline: any[]) {
    const rawRows = await tracking.aggregate(pipeline).toArray();
    return rawRows.map((entry: any) => {
      const userAgent = this.normalizeText(entry?.userAgent);
      const explicitModel = this.normalizeText(entry?.deviceModel);
      const inferredModel = this.extractDeviceModelFromUserAgent(userAgent);
      const deviceModel = explicitModel || inferredModel;
      return {
        userId: entry?.userId ? entry.userId.toString() : null,
        userName: this.normalizeText(entry?.userName),
        userEmail: this.normalizeText(entry?.userEmail),
        device: this.normalizeText(entry?.device),
        deviceModel,
        os: this.normalizeText(entry?.os),
        browser: this.normalizeText(entry?.browser),
        ipAddress: this.normalizeIpAddress(entry?.ipAddress),
        lastSeenAt: entry?.lastSeenAt || null,
        eventsCount: Number(entry?.eventsCount || 0),
      };
    });
  }

  async getDevices(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `devices:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const tracking = this.dbConnection.collection('trackingactions');
    const queryTracking = async () => {
      const basePipeline = this.buildTrackingScopePipeline(creatorId, from, to, communityScope);
      let rows = await tracking.aggregate(this.buildDeviceAggregatePipeline(basePipeline)).toArray();
      const meaningfulRows = rows.filter((row: any) => this.isMeaningfulDeviceValue(row?.device));
      if (meaningfulRows.length > 0) {
        rows = meaningfulRows;
      }
      let details = await this.queryTrackingDeviceDetails(
        tracking,
        this.buildDeviceDetailsPipeline(basePipeline),
      );

      const userIdsMissingIp = details
        .filter((entry: any) => !entry?.ipAddress && typeof entry?.userId === 'string')
        .map((entry: any) => entry.userId as string);

      if (userIdsMissingIp.length > 0) {
        const fallbackIps = await this.resolveLatestKnownIps(
          tracking,
          creatorId,
          communityScope,
          userIdsMissingIp,
        );
        details = details.map((entry: any) => {
          if (entry?.ipAddress || !entry?.userId) return entry;
          const fallbackIp = fallbackIps.get(entry.userId);
          if (!fallbackIp) return entry;
          return {
            ...entry,
            ipAddress: fallbackIp,
          };
        });
      }

      return { rows, details };
    };

    let trackingResult = await queryTracking();

    let ga4Rows: any[] | null = null;
    try {
      const ga4Devices = await this.ga4ReportingService.getCreatorDevices(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId,
      );

      const meaningful = ga4Devices.filter((device) => this.isMeaningfulDeviceValue(device.device));
      if (meaningful.length > 0) {
        ga4Rows = meaningful.map((device) => ({
          device: device.device,
          count: device.count,
        }));
      }
    } catch {
      // Ignore GA4 errors and rely on Mongo tracking data.
    }

    if (!ga4Rows?.length && !trackingResult.rows.length && !trackingResult.details.length) {
      await this.backfillForCreator(creatorId, 90);
      trackingResult = await queryTracking();
    }

    const result = {
      rows: ga4Rows?.length ? ga4Rows : trackingResult.rows,
      details: trackingResult.details,
    };

    this.setCache(key, result, 60 * 1000);
    return result;
  }

  private isMeaningfulAttributionValue(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return (
      normalized !== '' &&
      normalized !== 'unknown' &&
      normalized !== '(not set)' &&
      normalized !== 'not set' &&
      normalized !== '(not provided)' &&
      normalized !== '(none)' &&
      normalized !== 'none' &&
      normalized !== 'undefined' &&
      normalized !== 'null' &&
      normalized !== 'n/a'
    );
  }

  private normalizeAttributionValue(value: unknown): string | null {
    if (!this.isMeaningfulAttributionValue(value)) return null;
    return (value as string).trim();
  }

  private extractReferrerDomain(referrer: string | null): string | null {
    if (!referrer) return null;
    const raw = referrer.trim();
    if (!raw) return null;
    if (raw.toLowerCase() === 'direct' || raw.toLowerCase() === '(direct)') return null;

    const normalizeHost = (host: string): string | null => {
      const normalizedHost = host.trim().toLowerCase().replace(/^www\./, '');
      return normalizedHost.length > 0 ? normalizedHost : null;
    };

    try {
      const url = new URL(raw);
      return normalizeHost(url.hostname);
    } catch {
      // Ignore, try to coerce host below.
    }

    try {
      const url = new URL(`https://${raw}`);
      return normalizeHost(url.hostname);
    } catch {
      // Ignore, fallback below.
    }

    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) {
      return normalizeHost(raw);
    }

    return null;
  }

  private resolveReferrerChannel(input: {
    domain: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    rawReferrer: string | null;
  }): 'direct' | 'search' | 'social' | 'email' | 'paid' | 'referral' {
    const domain = (input.domain || '').toLowerCase();
    const source = (input.utmSource || '').toLowerCase();
    const medium = (input.utmMedium || '').toLowerCase();
    const referrer = (input.rawReferrer || '').toLowerCase();

    const hasDirectHint =
      source === 'direct' ||
      source === '(direct)' ||
      medium === 'direct' ||
      referrer === 'direct' ||
      referrer === '(direct)';
    if (hasDirectHint || (!domain && !source && !medium && !referrer)) return 'direct';

    if (
      /email|newsletter/.test(medium) ||
      /email|newsletter/.test(source) ||
      domain.includes('mail.google.com')
    ) {
      return 'email';
    }

    if (/cpc|ppc|paid|display|affiliate|sponsored/.test(medium)) return 'paid';

    const socialDomains = [
      'facebook.com',
      'instagram.com',
      'linkedin.com',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'youtube.com',
      'reddit.com',
      'pinterest.com',
      'snapchat.com',
      'telegram.org',
      't.me',
      'discord.com',
      'whatsapp.com',
    ];
    if (
      /social/.test(medium) ||
      socialDomains.some((value) => domain.endsWith(value)) ||
      /facebook|instagram|linkedin|twitter|x|tiktok|youtube|reddit|pinterest|snapchat|telegram|discord|whatsapp/.test(source)
    ) {
      return 'social';
    }

    const searchDomains = ['google.', 'bing.com', 'duckduckgo.com', 'yahoo.', 'baidu.com', 'yandex.', 'ecosia.org'];
    if (
      /organic|search|seo/.test(medium) ||
      searchDomains.some((value) => domain.includes(value)) ||
      /google|bing|duckduckgo|yahoo|baidu|yandex|ecosia/.test(source)
    ) {
      return 'search';
    }

    return 'referral';
  }

  private resolveReferrerSourceName(input: {
    domain: string | null;
    utmSource: string | null;
    rawReferrer: string | null;
  }): string {
    if (input.domain) return input.domain;
    if (input.utmSource) return input.utmSource;
    if (input.rawReferrer) return input.rawReferrer;
    return 'Direct';
  }

  private formatReferrerRows(rows: any[]) {
    return rows
      .map((row: any) => {
        const rawReferrer = this.normalizeAttributionValue(row?.referrer);
        const utmSource = this.normalizeAttributionValue(row?.utm_source);
        const utmMedium = this.normalizeAttributionValue(row?.utm_medium);
        const utmCampaign = this.normalizeAttributionValue(row?.utm_campaign);
        const domain = this.extractReferrerDomain(rawReferrer);
        const channel = this.resolveReferrerChannel({
          domain,
          utmSource,
          utmMedium,
          rawReferrer,
        });
        const source = this.resolveReferrerSourceName({
          domain,
          utmSource,
          rawReferrer,
        });
        const count = Number(row?.count || 0);
        const uniqueUsers = Number.isFinite(Number(row?.uniqueUsers))
          ? Number(row?.uniqueUsers)
          : undefined;
        const lastSeenAt = row?.lastSeenAt || null;

        return {
          source,
          channel,
          domain,
          referrer: rawReferrer,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          count,
          uniqueUsers,
          lastSeenAt,
        };
      })
      .filter((row: any) => row.count > 0)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 50);
  }

  private summarizeReferrerRows(rows: any[], provider: 'ga4' | 'tracking') {
    const totalEvents = rows.reduce((acc: number, row: any) => acc + Number(row?.count || 0), 0);
    const channelTotals = rows.reduce((acc: Record<string, number>, row: any) => {
      const channel = row?.channel || 'referral';
      acc[channel] = (acc[channel] || 0) + Number(row?.count || 0);
      return acc;
    }, {});

    const topChannel = (Object.entries(channelTotals) as Array<[string, number]>)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      provider,
      totalEvents,
      sources: rows.length,
      topChannel,
      topSource: rows[0]?.source || null,
    };
  }

  async getReferrers(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(creatorId, from.toISOString(), to.toISOString(), `referrers:${communityScope.cacheKeyPart}`);
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    // Try GA4 first
    try {
      const ga4Referrers = await this.ga4ReportingService.getCreatorReferrers(
        creatorId,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
        communityScope.ga4CommunityId
      );
      if (ga4Referrers.length > 0) {
        const rows = this.formatReferrerRows(ga4Referrers.map(r => ({
          referrer: r.referrer,
          count: r.count,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
        })));
        if (rows.length > 0) {
          const result = { rows, summary: this.summarizeReferrerRows(rows, 'ga4') };
          this.setCache(key, result, 60 * 1000);
          return result;
        }
      }
    } catch (e) {
      // Ignore
    }

    const tracking = this.dbConnection.collection('trackingactions');

    const buildPipeline = () => {
      const basePipeline = this.buildTrackingScopePipeline(creatorId, from, to, communityScope);
      return [
        ...basePipeline,
        {
          $project: {
            userId: 1,
            timestamp: 1,
            referrer: '$metadata.referrer',
            utm_source: '$metadata.utm_source',
            utm_medium: '$metadata.utm_medium',
            utm_campaign: '$metadata.utm_campaign',
          },
        },
        {
          $group: {
            _id: {
              referrer: '$referrer',
              utm_source: '$utm_source',
              utm_medium: '$utm_medium',
              utm_campaign: '$utm_campaign',
            },
            count: { $sum: 1 },
            users: { $addToSet: '$userId' },
            lastSeenAt: { $max: '$timestamp' },
          },
        },
        {
          $project: {
            _id: 0,
            referrer: '$_id.referrer',
            utm_source: '$_id.utm_source',
            utm_medium: '$_id.utm_medium',
            utm_campaign: '$_id.utm_campaign',
            count: 1,
            uniqueUsers: { $size: '$users' },
            lastSeenAt: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 100 },
      ];
    };

    let rows = await tracking.aggregate(buildPipeline()).toArray();

    if (!rows.length) {
      await this.backfillForCreator(creatorId, 90);
      rows = await tracking.aggregate(buildPipeline()).toArray();
    }

    const formattedRows = this.formatReferrerRows(rows);
    const result = {
      rows: formattedRows,
      summary: this.summarizeReferrerRows(formattedRows, 'tracking'),
    };

    this.setCache(key, result, 60 * 1000);
    return result;
  }

  async exportCsv(creatorId: string, scope: 'overview' | 'courses' | 'challenges' | 'sessions' | 'events' | 'products' | 'posts', from: Date, to: Date, communityId?: string, communitySlug?: string) {
    // CSV export: enforce Pro-only when plan enforcement is active
    const enforcementOn = process.env.PLAN_ENFORCEMENT_MODE === 'true';
    if (enforcementOn) {
      const sub = await this.subscriptionService.getMySubscription(creatorId);
      const plan = (sub?.plan as PlanTier) || PlanTier.STARTER;
      if (plan !== PlanTier.PRO) {
        throw new ForbiddenException('CSV export is available on the Pro plan only. Please upgrade.');
      }
    }
    // Clamp date range to plan lookback window
    const clamped = await this.clampDateRangeForPlan(creatorId, from, to);
    from = clamped.from;
    to = clamped.to;

    if (scope === 'overview') {
      const data = await this.getOverview(creatorId, from, to, PlanTier.PRO, communityId, communitySlug);
      const rows = [
        ['metric', 'value'],
        ['views', data.totals.views],
        ['starts', data.totals.starts],
        ['completes', data.totals.completes],
        ['chapterCompletes', data.totals.chapterCompletes],
        ['likes', data.totals.likes],
        ['shares', data.totals.shares],
        ['downloads', data.totals.downloads],
        ['bookmarks', data.totals.bookmarks],
        ['watchTime', data.totals.watchTime],
        ['ratingsCount', data.totals.ratingsCount],
        ['revenue', data.revenue.total],
        ['salesCount', data.revenue.count],
        ['engagementRate', data.engagementRate],
      ];
      return { filename: 'overview.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'courses') {
      const res = await this.getCourses(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes', 'chapterCompletes', 'completionRate', 'watchTime', 'ratingsCount'];
      const rows = [head, ...res.byCourse.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.chapterCompletes || 0, c.completionRate, c.watchTime, c.ratingsCount])];
      return { filename: 'courses.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'challenges') {
      const res = await this.getChallenges(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes', 'completionRate'];
      const rows = [head, ...res.byChallenge.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate])];
      return { filename: 'challenges.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'sessions') {
      const res = await this.getSessions(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes', 'completionRate'];
      const rows = [head, ...res.bySession.map((c: any) => [c.contentId, c.views, c.starts, c.completes, c.completionRate])];
      return { filename: 'sessions.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'events') {
      const res = await this.getEvents(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'starts', 'completes'];
      const rows = [head, ...res.byEvent.map((c: any) => [c.contentId, c.views, c.starts, c.completes])];
      return { filename: 'events.csv', csv: this.toCsv(rows) };
    }

    if (scope === 'products') {
      const res = await this.getProducts(creatorId, from, to, communityId, communitySlug);
      const head = ['contentId', 'views', 'likes', 'shares', 'downloads'];
      const rows = [head, ...res.byProduct.map((c: any) => [c.contentId, c.views, c.likes, c.shares, c.downloads])];
      return { filename: 'products.csv', csv: this.toCsv(rows) };
    }

    // posts
    const res = await this.getPosts(creatorId, from, to, communityId, communitySlug);
    const head = ['contentId', 'views', 'likes', 'shares', 'bookmarks', 'ratingsCount'];
    const rows = [head, ...res.byPost.map((c: any) => [c.contentId, c.views, c.likes, c.shares, c.bookmarks, c.ratingsCount])];
    return { filename: 'posts.csv', csv: this.toCsv(rows) };
  }

  private toCsv(rows: (string | number)[][]) {
    return rows.map(r => r.map(v => (v === null || v === undefined) ? '' : String(v).replace(/"/g, '""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(',')).join('\n');
  }

  private shapeOverview(full: any, plan: PlanTier) {
    const baseData = {
      totals: full.totals,
      revenue: full.revenue,
      avgEngagement: full.engagementRate,
      engagementRate: full.engagementRate,
    };

    // Always return full data regardless of plan
    return {
      ...baseData,
      views: Number(full?.totals?.views ?? 0) || 0,
      viewsTotal: Number(full?.totals?.views ?? 0) || 0,
      starts: Number(full?.totals?.starts ?? 0) || 0,
      // Guardrail: course-level completion events only (not chapter completion events).
      completes: Number(full?.totals?.completes ?? 0) || 0,
      courseCompletes: Number(full?.totals?.completes ?? 0) || 0,
      chapterCompletes: Number(full?.totals?.chapterCompletes ?? 0) || 0,
      completions: Number(full?.totals?.completes ?? 0) || 0,
      completionRate:
        (Number(full?.totals?.starts ?? 0) || 0) > 0
          ? ((Number(full?.totals?.completes ?? 0) || 0) / (Number(full?.totals?.starts ?? 0) || 0)) * 100
          : 0,
      avgDuration:
        (Number(full?.totals?.starts ?? 0) || 0) > 0
          ? Math.round((Number(full?.totals?.watchTime ?? 0) / (Number(full?.totals?.starts ?? 0) || 1)) / 60)
          : 0,
      averageDuration:
        (Number(full?.totals?.starts ?? 0) || 0) > 0
          ? Math.round((Number(full?.totals?.watchTime ?? 0) / (Number(full?.totals?.starts ?? 0) || 1)) / 60)
          : 0,
      trend7d: full.trend.slice(-7),
      trend28d: full.trend.slice(-28),
      trendAll: full.trend,
      topContents: full.topContents,
    };
  }

  private getFunnelMinStarts(): number {
    const raw = Number(process.env.ANALYTICS_FUNNEL_MIN_STARTS || 30);
    if (!Number.isFinite(raw)) return 30;
    return Math.max(1, Math.min(100000, Math.floor(raw)));
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private buildDropOffSummary(params: {
    steps: Array<{ stepKey: string; stepLabel: string; uniqueUsers?: number; events?: number }>;
    minStarts: number;
    sampleSizeKey?: string;
  }): {
    worstStep: { stepKey: string; stepLabel: string; dropOffRate: number; fromUsers: number; toUsers: number } | null;
    dropOffRate: number;
    sampleSizeWarnings: string[];
  } {
    const { steps, minStarts } = params;
    const sampleSizeWarnings: string[] = [];

    // compute per-step drop-off against previous step
    const candidates: Array<{ idx: number; fromUsers: number; toUsers: number; dropOffRate: number }> = [];
    for (let i = 1; i < steps.length; i++) {
      const prev = Number(steps[i - 1]?.uniqueUsers ?? 0);
      const curr = Number(steps[i]?.uniqueUsers ?? 0);
      if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
      if (prev <= 0) continue;
      const drop = Math.max(0, Math.min(1, 1 - curr / prev));
      candidates.push({ idx: i, fromUsers: prev, toUsers: curr, dropOffRate: drop });
    }

    const eligible = candidates.filter((c) => c.fromUsers >= minStarts);
    if (eligible.length === 0 && candidates.length > 0) {
      const maxFrom = Math.max(...candidates.map((c) => c.fromUsers));
      if (maxFrom > 0 && maxFrom < minStarts) {
        sampleSizeWarnings.push(
          `Low sample size: max step volume is ${maxFrom} (< ${minStarts}). Drop-off ranking may be noisy.`,
        );
      }
    }

    const toRank = eligible.length > 0 ? eligible : candidates;
    if (toRank.length === 0) {
      return { worstStep: null, dropOffRate: 0, sampleSizeWarnings };
    }

    toRank.sort((a, b) => {
      if (b.dropOffRate !== a.dropOffRate) return b.dropOffRate - a.dropOffRate;
      return b.fromUsers - a.fromUsers;
    });
    const worst = toRank[0];
    const step = steps[worst.idx];
    const prev = steps[worst.idx - 1];
    const worstStep = {
      stepKey: String(step.stepKey),
      stepLabel: String(step.stepLabel),
      dropOffRate: this.round4(worst.dropOffRate),
      fromUsers: worst.fromUsers,
      toUsers: worst.toUsers,
    };

    const first = Number(steps[0]?.uniqueUsers ?? 0);
    const last = Number(steps[steps.length - 1]?.uniqueUsers ?? 0);
    const overallDrop = first > 0 ? Math.max(0, Math.min(1, 1 - last / first)) : 0;
    return {
      worstStep,
      dropOffRate: this.round4(overallDrop),
      sampleSizeWarnings,
    };
  }

  private async aggregateUniqueActionCounts(params: {
    creatorId: string;
    contentType: string;
    contentIds: string[];
    from: Date;
    to: Date;
    includeActionTypes: TrackingActionType[];
    excludeTaskScoped?: boolean;
    excludeChapterScoped?: boolean;
  }): Promise<Record<string, { uniqueUsers: number; events: number }>> {
    const tracking = this.dbConnection.collection('trackingactions');
    const contentIds = Array.from(new Set(params.contentIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (contentIds.length === 0) return {};

    const match: any = {
      timestamp: { $gte: params.from, $lte: params.to },
      contentType: params.contentType,
      contentId: { $in: contentIds },
      actionType: { $in: params.includeActionTypes },
    };

    const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
    const taskIdExpr = { $ifNull: ['$metadata.taskId', ''] };

    const scopedFilters: any[] = [];
    if (params.excludeChapterScoped) {
      scopedFilters.push({
        $or: [
          { $ne: ['$actionType', TrackingActionType.START] },
          { $eq: [chapterIdExpr, ''] },
        ],
      });
      scopedFilters.push({
        $or: [
          { $ne: ['$actionType', TrackingActionType.COMPLETE] },
          { $eq: [chapterIdExpr, ''] },
        ],
      });
    }
    if (params.excludeTaskScoped) {
      scopedFilters.push({
        $or: [
          { $ne: ['$actionType', TrackingActionType.START] },
          { $eq: [taskIdExpr, ''] },
        ],
      });
      scopedFilters.push({
        $or: [
          { $ne: ['$actionType', TrackingActionType.COMPLETE] },
          { $eq: [taskIdExpr, ''] },
        ],
      });
    }

    const pipeline: any[] = [{ $match: match }];
    if (scopedFilters.length > 0) {
      pipeline.push(
        {
          $addFields: {
            chapterIdNormalized: chapterIdExpr,
            taskIdNormalized: taskIdExpr,
          },
        },
        {
          $match: {
            $expr: scopedFilters.length === 1 ? scopedFilters[0] : { $and: scopedFilters },
          },
        },
      );
    }
    pipeline.push(
      {
        $group: {
          _id: { actionType: '$actionType', userId: '$userId' },
          events: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.actionType',
          uniqueUsers: { $sum: 1 },
          events: { $sum: '$events' },
        },
      },
      { $project: { _id: 0, actionType: '$_id', uniqueUsers: 1, events: 1 } },
    );

    const rows = await tracking.aggregate(pipeline).toArray();
    const result: Record<string, { uniqueUsers: number; events: number }> = {};
    for (const row of rows) {
      const key = String(row?.actionType || '');
      if (!key) continue;
      result[key] = {
        uniqueUsers: Number(row?.uniqueUsers || 0) || 0,
        events: Number(row?.events || 0) || 0,
      };
    }
    return result;
  }

  private async resolveContentMeta(params: {
    creatorId: string;
    contentType: string;
    contentId: string;
    communityScope: {
      hasFilter: boolean;
      lookupCommunityValues: Array<string | Types.ObjectId>;
      communityIdStrings: string[];
    };
  }): Promise<{
    title: string;
    communityId?: string;
    currency?: string;
    price?: number;
    trackingIds: string[];
    orderIds: string[];
    enrollmentCourseObjectId?: Types.ObjectId;
  }> {
    const { contentType, contentId } = params;

    const findOneByIdOrObjectId = async (collectionName: string) => {
      const col = this.dbConnection.db?.collection(collectionName);
      if (!col) return null;
      const match: any[] = [{ id: contentId }];
      if (Types.ObjectId.isValid(contentId)) match.push({ _id: new Types.ObjectId(contentId) });
      if (contentType === 'community') match.push({ slug: contentId });
      return col.findOne({ $or: match });
    };

    if (contentType === 'course') {
      const doc = await findOneByIdOrObjectId('cours');
      if (!doc) throw new NotFoundException('Course not found');
      const creatorOk = String(doc?.creatorId || '') === String(params.creatorId);
      if (!creatorOk) throw new ForbiddenException('Access denied');
      const communityId = doc?.communityId ? String(doc.communityId) : undefined;
      if (params.communityScope.hasFilter && communityId) {
        const ok = params.communityScope.communityIdStrings.includes(String(communityId));
        if (!ok) throw new ForbiddenException('Content not in requested community scope');
      }
      const trackingIds = Array.from(new Set([String(doc?.id || ''), String(doc?._id || '')].filter(Boolean)));
      const orderIds = Array.from(new Set([String(doc?._id || ''), String(doc?.id || '')].filter(Boolean)));
      return {
        title: String(doc?.titre || doc?.title || doc?.name || doc?.id || contentId),
        communityId,
        currency: String(doc?.devise || 'TND'),
        price: Number(doc?.prix || 0) || 0,
        trackingIds,
        orderIds,
        enrollmentCourseObjectId: doc?._id ? new Types.ObjectId(String(doc._id)) : undefined,
      };
    }

    if (contentType === 'challenge') {
      const doc = await findOneByIdOrObjectId('challenges');
      if (!doc) throw new NotFoundException('Challenge not found');
      const creatorOk = String(doc?.creatorId || '') === String(params.creatorId);
      if (!creatorOk) throw new ForbiddenException('Access denied');
      const communityId = doc?.communityId ? String(doc.communityId) : undefined;
      if (params.communityScope.hasFilter && communityId) {
        const ok = params.communityScope.communityIdStrings.includes(String(communityId));
        if (!ok) throw new ForbiddenException('Content not in requested community scope');
      }
      const trackingIds = Array.from(new Set([String(doc?.id || ''), String(doc?._id || '')].filter(Boolean)));
      const orderIds = Array.from(new Set([String(doc?._id || ''), String(doc?.id || '')].filter(Boolean)));
      return {
        title: String(doc?.title || doc?.name || doc?.id || contentId),
        communityId,
        currency: 'TND',
        price: Number(doc?.pricing?.participationFee || 0) || 0,
        trackingIds,
        orderIds,
      };
    }

    if (contentType === 'session') {
      const doc = await findOneByIdOrObjectId('sessions');
      if (!doc) throw new NotFoundException('Session not found');
      const creatorOk = String(doc?.creatorId || '') === String(params.creatorId);
      if (!creatorOk) throw new ForbiddenException('Access denied');
      const communityId = doc?.communityId ? String(doc.communityId) : undefined;
      if (params.communityScope.hasFilter && communityId) {
        const ok = params.communityScope.communityIdStrings.includes(String(communityId));
        if (!ok) throw new ForbiddenException('Content not in requested community scope');
      }
      const trackingIds = Array.from(new Set([String(doc?.id || ''), String(doc?._id || '')].filter(Boolean)));
      const orderIds = Array.from(new Set([String(doc?._id || ''), String(doc?.id || '')].filter(Boolean)));
      return {
        title: String(doc?.title || doc?.name || doc?.id || contentId),
        communityId,
        currency: String(doc?.currency || 'TND'),
        price: Number(doc?.price || 0) || 0,
        trackingIds,
        orderIds,
      };
    }

    if (contentType === 'event') {
      const doc = await findOneByIdOrObjectId('events');
      if (!doc) throw new NotFoundException('Event not found');
      const creatorOk = String(doc?.creatorId || '') === String(params.creatorId);
      if (!creatorOk) throw new ForbiddenException('Access denied');
      const communityId = doc?.communityId ? String(doc.communityId) : undefined;
      if (params.communityScope.hasFilter && communityId) {
        const ok = params.communityScope.communityIdStrings.includes(String(communityId));
        if (!ok) throw new ForbiddenException('Content not in requested community scope');
      }
      const trackingIds = Array.from(new Set([String(doc?.id || ''), String(doc?._id || '')].filter(Boolean)));
      const orderIds = Array.from(new Set([String(doc?._id || ''), String(doc?.id || '')].filter(Boolean)));
      return {
        title: String(doc?.title || doc?.name || doc?.id || contentId),
        communityId,
        currency: 'TND',
        price: Number(doc?.price || 0) || 0,
        trackingIds,
        orderIds,
      };
    }

    if (contentType === 'product') {
      const doc = await findOneByIdOrObjectId('products');
      if (!doc) throw new NotFoundException('Product not found');
      const creatorOk = String(doc?.creatorId || '') === String(params.creatorId);
      if (!creatorOk) throw new ForbiddenException('Access denied');
      const communityId = doc?.communityId ? String(doc.communityId) : undefined;
      if (params.communityScope.hasFilter && communityId) {
        const ok = params.communityScope.communityIdStrings.includes(String(communityId));
        if (!ok) throw new ForbiddenException('Content not in requested community scope');
      }
      const trackingIds = Array.from(new Set([String(doc?.id || ''), String(doc?._id || '')].filter(Boolean)));
      const orderIds = Array.from(new Set([String(doc?._id || ''), String(doc?.id || '')].filter(Boolean)));
      return {
        title: String(doc?.title || doc?.name || doc?.id || contentId),
        communityId,
        currency: String(doc?.currency || 'TND'),
        price: Number(doc?.price || 0) || 0,
        trackingIds,
        orderIds,
      };
    }

    if (contentType === 'post') {
      const doc = await findOneByIdOrObjectId('posts');
      if (!doc) throw new NotFoundException('Post not found');
      const authorOk = String(doc?.authorId || '') === String(params.creatorId);
      if (!authorOk) throw new ForbiddenException('Access denied');
      const communityId = doc?.communityId ? String(doc.communityId) : undefined;
      if (params.communityScope.hasFilter && communityId) {
        const ok = params.communityScope.communityIdStrings.includes(String(communityId));
        if (!ok) throw new ForbiddenException('Content not in requested community scope');
      }
      const trackingIds = Array.from(new Set([String(doc?.id || ''), String(doc?._id || '')].filter(Boolean)));
      return {
        title: String(doc?.title || doc?.id || contentId),
        communityId,
        trackingIds,
        orderIds: [],
      };
    }

    // community
    const doc = await findOneByIdOrObjectId('communities');
    if (!doc) throw new NotFoundException('Community not found');
    const creatorOk = String(doc?.createur || doc?.creatorId || '') === String(params.creatorId);
    if (!creatorOk) throw new ForbiddenException('Access denied');
    const communityId = doc?._id ? String(doc._id) : undefined;
    if (params.communityScope.hasFilter && communityId) {
      const ok = params.communityScope.lookupCommunityValues.some((value) => String(value) === String(communityId));
      if (!ok) throw new ForbiddenException('Content not in requested community scope');
    }
    const trackingIds = Array.from(
      new Set([String(doc?._id || ''), String(doc?.id || ''), String(doc?.slug || '')].filter(Boolean)),
    );
    const orderIds = Array.from(new Set([String(doc?._id || ''), String(doc?.id || '')].filter(Boolean)));
    return {
      title: String(doc?.name || doc?.slug || contentId),
      communityId,
      currency: 'TND',
      price: Number(doc?.fees_of_join || doc?.price || 0) || 0,
      trackingIds,
      orderIds,
    };
  }

  async getFunnel(
    creatorId: string,
    contentType: string,
    contentId: string,
    from: Date,
    to: Date,
    communityId?: string,
    communitySlug?: string,
  ) {
    const normalizedType = String(contentType || '').trim().toLowerCase();
    const allowed = new Set(['course', 'challenge', 'session', 'event', 'product', 'post', 'community']);
    if (!allowed.has(normalizedType)) {
      throw new NotFoundException('Unsupported content type');
    }

    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(
      creatorId,
      from.toISOString(),
      to.toISOString(),
      `funnel:${normalizedType}:${contentId}:${communityScope.cacheKeyPart}`,
    );
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const meta = await this.resolveContentMeta({
      creatorId,
      contentType: normalizedType,
      contentId,
      communityScope,
    });

    const warnings: string[] = [];
    const actionsToInclude =
      normalizedType === 'post'
        ? [
            TrackingActionType.VIEW,
            TrackingActionType.LIKE,
            TrackingActionType.SHARE,
            TrackingActionType.BOOKMARK,
            TrackingActionType.COMMENT,
          ]
        : normalizedType === 'product'
          ? [TrackingActionType.VIEW]
          : [TrackingActionType.VIEW, TrackingActionType.START, TrackingActionType.COMPLETE];

    const actionCounts = await this.aggregateUniqueActionCounts({
      creatorId,
      contentType: normalizedType,
      contentIds: meta.trackingIds,
      from,
      to,
      includeActionTypes: actionsToInclude,
      excludeChapterScoped: normalizedType === 'course',
      excludeTaskScoped: normalizedType === 'challenge',
    });

    const step = (actionType: TrackingActionType, label: string) => ({
      stepKey: actionType,
      stepLabel: label,
      uniqueUsers: Number(actionCounts?.[actionType]?.uniqueUsers || 0) || 0,
      events: Number(actionCounts?.[actionType]?.events || 0) || 0,
      rateFromPrev: null as number | null,
    });

    const steps: Array<any> = [];
    if (normalizedType === 'post') {
      steps.push(step(TrackingActionType.VIEW, 'Views'));
      steps.push(step(TrackingActionType.LIKE, 'Likes'));
      steps.push(step(TrackingActionType.SHARE, 'Shares'));
      steps.push(step(TrackingActionType.BOOKMARK, 'Bookmarks'));
      steps.push(step(TrackingActionType.COMMENT, 'Comments'));
    } else if (normalizedType === 'product') {
      steps.push(step(TrackingActionType.VIEW, 'Views'));
    } else {
      steps.push(step(TrackingActionType.VIEW, 'Views'));
      steps.push(step(TrackingActionType.START, 'Starts'));
      steps.push(step(TrackingActionType.COMPLETE, 'Completes'));
    }

    // Compute revenue/purchases when applicable (orders use mongo _id string in many flows; resolveContentMeta provides both).
    let revenueTotal = 0;
    let purchaseCount = 0;
    let uniqueBuyers = 0;
    if (normalizedType !== 'post') {
      const ordersCollection = this.dbConnection.db?.collection('orders');
      if (ordersCollection) {
        const orderMatch: any = {
          creatorId: this.getCreatorObjectId(creatorId),
          status: 'paid',
          contentType: normalizedType,
          contentId: { $in: meta.orderIds },
          createdAt: { $gte: from, $lte: to },
        };

        // Prefer explicit order communityId when filtering.
        if (communityScope.hasFilter) {
          orderMatch.communityId = { $in: communityScope.lookupCommunityValues };
        }

        const rows = await ordersCollection
          .aggregate([
            { $match: orderMatch },
            {
              $group: {
                _id: null,
                revenue: { $sum: '$creatorNetDT' },
                count: { $sum: 1 },
                buyers: { $addToSet: '$buyerId' },
              },
            },
            { $project: { _id: 0, revenue: 1, count: 1, uniqueBuyers: { $size: '$buyers' } } },
          ])
          .toArray();
        revenueTotal = Number(rows?.[0]?.revenue || 0) || 0;
        purchaseCount = Number(rows?.[0]?.count || 0) || 0;
        uniqueBuyers = Number(rows?.[0]?.uniqueBuyers || 0) || 0;
      } else {
        warnings.push('Orders collection is unavailable; revenue metrics omitted.');
      }
    }

    // Course enrollments (true conversion) for course funnel.
    let enrollments = 0;
    let enrollmentUsers = 0;
    if (normalizedType === 'course' && meta.enrollmentCourseObjectId) {
      const enrollmentsCollection = this.dbConnection.db?.collection('courseenrollments');
      if (enrollmentsCollection) {
        const allEnrollments =
          (await enrollmentsCollection
            .find({ courseId: new Types.ObjectId(String(meta.enrollmentCourseObjectId)) })
            .project({ userId: 1, enrolledAt: 1, createdAt: 1 })
            .toArray()) || [];

        const inRange = (value: any): boolean => {
          const date = value instanceof Date ? value : new Date(value);
          return !Number.isNaN(date.getTime()) && date >= from && date <= to;
        };

        const getEnrollmentDate = (enrollment: any): Date | null => {
          const candidate = enrollment?.enrolledAt || enrollment?.createdAt;
          if (!candidate) return null;
          const parsed = candidate instanceof Date ? candidate : new Date(candidate);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const periodEnrollments = allEnrollments.filter((entry: any) => {
          const dt = getEnrollmentDate(entry);
          return dt ? inRange(dt) : false;
        });

        enrollments = periodEnrollments.length;
        const distinctUsers = new Set(periodEnrollments.map((e: any) => String(e?.userId || '')).filter(Boolean));
        enrollmentUsers = distinctUsers.size;
      }
    }

    // Add purchases/revenue steps for commerce items.
    if (normalizedType !== 'post') {
      steps.push({
        stepKey: 'purchases',
        stepLabel: 'Purchases',
        uniqueUsers: uniqueBuyers,
        events: purchaseCount,
        rateFromPrev: null,
      });
      if (normalizedType === 'course') {
        steps.push({
          stepKey: 'enrollments',
          stepLabel: 'Enrollments',
          uniqueUsers: enrollmentUsers,
          events: enrollments,
          rateFromPrev: null,
        });
      }
      steps.push({
        stepKey: 'revenue',
        stepLabel: 'Revenue',
        uniqueUsers: null,
        events: Number(revenueTotal || 0),
        rateFromPrev: null,
      });
    }

    // compute step conversion rates
    for (let i = 1; i < steps.length; i++) {
      const prev = Number(steps[i - 1]?.uniqueUsers ?? 0);
      const curr = Number(steps[i]?.uniqueUsers ?? 0);
      if (!Number.isFinite(prev) || prev <= 0) {
        steps[i].rateFromPrev = null;
      } else {
        steps[i].rateFromPrev = this.round4(curr / prev);
      }
    }

    const minStarts = this.getFunnelMinStarts();
    const dropOff = this.buildDropOffSummary({ steps, minStarts });
    const payload = {
      contentMeta: {
        title: meta.title,
        communityId: meta.communityId,
        currency: meta.currency,
        price: meta.price,
        trackingIds: meta.trackingIds,
        orderIds: meta.orderIds,
      },
      funnel: steps,
      dropOff,
      warnings: [...warnings, ...dropOff.sampleSizeWarnings],
    };

    this.setCache(key, payload, 5 * 60 * 1000);
    return payload;
  }

  async getCourseChaptersFunnel(
    creatorId: string,
    courseId: string,
    from: Date,
    to: Date,
    communityId?: string,
    communitySlug?: string,
  ) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(
      creatorId,
      from.toISOString(),
      to.toISOString(),
      `course-chapters-funnel:${courseId}:${communityScope.cacheKeyPart}`,
    );
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const coursesCollection = this.dbConnection.db?.collection('cours');
    if (!coursesCollection) {
      throw new NotFoundException('Courses collection is unavailable');
    }

    const match: any[] = [{ id: courseId }];
    if (Types.ObjectId.isValid(courseId)) match.push({ _id: new Types.ObjectId(courseId) });
    const course = await coursesCollection.findOne({ $or: match, creatorId: this.getCreatorObjectId(creatorId) });
    if (!course) throw new NotFoundException('Course not found');

    const courseCommunityId = course?.communityId ? String(course.communityId) : undefined;
    if (communityScope.hasFilter && courseCommunityId) {
      const ok = communityScope.communityIdStrings.includes(courseCommunityId);
      if (!ok) throw new ForbiddenException('Content not in requested community scope');
    }

    const trackingIds = Array.from(new Set([String(course?.id || ''), String(course?._id || '')].filter(Boolean)));
    const canonicalCourseId = String(course?.id || courseId);

    const sections = Array.isArray(course.sections) ? course.sections : [];
    const orderedChapters: Array<{
      stepId: string;
      stepTitle: string;
      sectionId: string;
      order: number;
      isPreview: boolean;
      isPaidChapter: boolean;
    }> = [];

    for (const section of sections) {
      const sectionId = String(section?.id || '');
      const chapitres = Array.isArray(section?.chapitres) ? section.chapitres : [];
      for (const chapitre of chapitres) {
        orderedChapters.push({
          stepId: String(chapitre?.id || ''),
          stepTitle: String(chapitre?.titre || chapitre?.title || 'Chapter'),
          sectionId,
          order: Number(chapitre?.ordre ?? 0) || 0,
          isPreview: Boolean(chapitre?.isPreview),
          isPaidChapter: Boolean(chapitre?.isPaidChapter),
        });
      }
    }

    // Stable ordering: section order is not guaranteed, but chapter ordre is within section.
    orderedChapters.sort((a, b) => a.order - b.order);

    const tracking = this.dbConnection.collection('trackingactions');
    const chapterIdExpr = { $ifNull: ['$metadata.chapterId', ''] };
    const isChapterStartActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_START] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.START] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };
    const isChapterCompleteActionExpr = {
      $or: [
        { $eq: ['$actionType', TrackingActionType.CHAPTER_COMPLETE] },
        {
          $and: [
            { $eq: ['$actionType', TrackingActionType.COMPLETE] },
            { $ne: [chapterIdExpr, ''] },
          ],
        },
      ],
    };

    const pipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'course', contentId: { $in: trackingIds } } },
      {
        $project: {
          userId: 1,
          chapterId: '$metadata.chapterId',
          chapterIdNormalized: chapterIdExpr,
          isStart: { $cond: [isChapterStartActionExpr, 1, 0] },
          isComplete: { $cond: [isChapterCompleteActionExpr, 1, 0] },
        },
      },
      { $match: { chapterIdNormalized: { $ne: '' } } },
      {
        $group: {
          _id: { chapterId: '$chapterIdNormalized', userId: '$userId' },
          didStart: { $max: '$isStart' },
          didComplete: { $max: '$isComplete' },
        },
      },
      {
        $group: {
          _id: '$_id.chapterId',
          uniqueStarts: { $sum: '$didStart' },
          uniqueCompletes: { $sum: '$didComplete' },
        },
      },
      { $project: { _id: 0, chapterId: '$_id', uniqueStarts: 1, uniqueCompletes: 1 } },
    ];

    const rows = await tracking.aggregate(pipeline).toArray();
    const byChapter = new Map(rows.map((r: any) => [String(r.chapterId), r]));

    const items = orderedChapters.map((chapter) => {
      const row = byChapter.get(String(chapter.stepId)) || { uniqueStarts: 0, uniqueCompletes: 0 };
      const uniqueStarts = Number(row.uniqueStarts || 0) || 0;
      const uniqueCompletes = Number(row.uniqueCompletes || 0) || 0;
      const completionRate = uniqueStarts > 0 ? uniqueCompletes / uniqueStarts : 0;
      const dropOffRate = uniqueStarts > 0 ? 1 - completionRate : 0;
      return {
        ...chapter,
        uniqueStarts,
        uniqueCompletes,
        completionRate: this.round4(completionRate),
        dropOffRate: this.round4(dropOffRate),
      };
    });

    const minStarts = this.getFunnelMinStarts();
    const ranked = items
      .filter((it) => it.uniqueStarts >= minStarts)
      .sort((a, b) => {
        if (b.dropOffRate !== a.dropOffRate) return b.dropOffRate - a.dropOffRate;
        return b.uniqueStarts - a.uniqueStarts;
      });
    const maxStarts = Math.max(0, ...items.map((it) => it.uniqueStarts));
    const warnings: string[] = [];
    if (ranked.length === 0 && maxStarts > 0 && maxStarts < minStarts) {
      warnings.push(`Low sample size: max chapter starts is ${maxStarts} (< ${minStarts}).`);
    }

    const payload = {
      contentMeta: {
        courseId: canonicalCourseId,
        courseTitle: String(course?.titre || ''),
        communityId: courseCommunityId,
        totalChapters: items.length,
      },
      items,
      dropOff: {
        worstStep: ranked.length > 0
          ? {
              stepId: ranked[0].stepId,
              stepTitle: ranked[0].stepTitle,
              dropOffRate: ranked[0].dropOffRate,
              uniqueStarts: ranked[0].uniqueStarts,
              uniqueCompletes: ranked[0].uniqueCompletes,
            }
          : null,
      },
      warnings,
    };

    this.setCache(key, payload, 10 * 60 * 1000);
    return payload;
  }

  async getChallengeTasksFunnel(
    creatorId: string,
    challengeId: string,
    from: Date,
    to: Date,
    communityId?: string,
    communitySlug?: string,
  ) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const key = this.cacheKey(
      creatorId,
      from.toISOString(),
      to.toISOString(),
      `challenge-tasks-funnel:${challengeId}:${communityScope.cacheKeyPart}`,
    );
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const challengesCollection = this.dbConnection.db?.collection('challenges');
    if (!challengesCollection) throw new NotFoundException('Challenges collection is unavailable');

    const match: any[] = [{ id: challengeId }];
    if (Types.ObjectId.isValid(challengeId)) match.push({ _id: new Types.ObjectId(challengeId) });
    const challenge = await challengesCollection.findOne({ $or: match, creatorId: this.getCreatorObjectId(creatorId) });
    if (!challenge) throw new NotFoundException('Challenge not found');

    const challengeCommunityId = challenge?.communityId ? String(challenge.communityId) : undefined;
    if (communityScope.hasFilter && challengeCommunityId) {
      const ok = communityScope.communityIdStrings.includes(challengeCommunityId);
      if (!ok) throw new ForbiddenException('Content not in requested community scope');
    }

    const trackingIds = Array.from(new Set([String(challenge?.id || ''), String(challenge?._id || '')].filter(Boolean)));
    const canonicalChallengeId = String(challenge?.id || challengeId);
    const tasks = Array.isArray(challenge.tasks) ? challenge.tasks : [];
    const orderedTasks = tasks
      .map((task: any) => ({
        stepId: String(task?.id || task?._id || task?.day || ''),
        stepTitle: String(task?.title || `Task ${task?.day || ''}` || 'Task'),
        day: Number(task?.day || 0) || 0,
      }))
      .filter((task: any) => task.stepId);
    orderedTasks.sort((a, b) => a.day - b.day);

    const tracking = this.dbConnection.collection('trackingactions');
    const taskIdExpr = { $ifNull: ['$metadata.taskId', ''] };
    const pipeline: any[] = [
      { $match: { timestamp: { $gte: from, $lte: to }, contentType: 'challenge', contentId: { $in: trackingIds } } },
      { $project: { userId: 1, actionType: 1, taskId: '$metadata.taskId', taskIdNormalized: taskIdExpr } },
      { $match: { taskIdNormalized: { $ne: '' } } },
      {
        $group: {
          _id: { taskId: '$taskIdNormalized', userId: '$userId' },
          didStart: { $max: { $cond: [{ $eq: ['$actionType', TrackingActionType.START] }, 1, 0] } },
          didComplete: { $max: { $cond: [{ $eq: ['$actionType', TrackingActionType.COMPLETE] }, 1, 0] } },
        },
      },
      {
        $group: {
          _id: '$_id.taskId',
          uniqueStarts: { $sum: '$didStart' },
          uniqueCompletes: { $sum: '$didComplete' },
        },
      },
      { $project: { _id: 0, taskId: '$_id', uniqueStarts: 1, uniqueCompletes: 1 } },
    ];

    const rows = await tracking.aggregate(pipeline).toArray();
    const byTask = new Map(rows.map((r: any) => [String(r.taskId), r]));

    const items = orderedTasks.map((task) => {
      const row = byTask.get(String(task.stepId)) || { uniqueStarts: 0, uniqueCompletes: 0 };
      const uniqueStarts = Number(row.uniqueStarts || 0) || 0;
      const uniqueCompletes = Number(row.uniqueCompletes || 0) || 0;
      const completionRate = uniqueStarts > 0 ? uniqueCompletes / uniqueStarts : 0;
      const dropOffRate = uniqueStarts > 0 ? 1 - completionRate : 0;
      return {
        ...task,
        uniqueStarts,
        uniqueCompletes,
        completionRate: this.round4(completionRate),
        dropOffRate: this.round4(dropOffRate),
      };
    });

    const minStarts = this.getFunnelMinStarts();
    const ranked = items
      .filter((it) => it.uniqueStarts >= minStarts)
      .sort((a, b) => {
        if (b.dropOffRate !== a.dropOffRate) return b.dropOffRate - a.dropOffRate;
        return b.uniqueStarts - a.uniqueStarts;
      });
    const maxStarts = Math.max(0, ...items.map((it) => it.uniqueStarts));
    const warnings: string[] = [];
    if (ranked.length === 0 && maxStarts > 0 && maxStarts < minStarts) {
      warnings.push(`Low sample size: max task starts is ${maxStarts} (< ${minStarts}).`);
    }

    const payload = {
      contentMeta: {
        challengeId: canonicalChallengeId,
        challengeTitle: String(challenge?.title || ''),
        communityId: challengeCommunityId,
        totalTasks: items.length,
      },
      items,
      dropOff: {
        worstStep: ranked.length > 0
          ? {
              stepId: ranked[0].stepId,
              stepTitle: ranked[0].stepTitle,
              dropOffRate: ranked[0].dropOffRate,
              uniqueStarts: ranked[0].uniqueStarts,
              uniqueCompletes: ranked[0].uniqueCompletes,
            }
          : null,
      },
      warnings,
    };

    this.setCache(key, payload, 10 * 60 * 1000);
    return payload;
  }

  async getCourseAnalytics(creatorId: string, courseId: string, from: Date, to: Date) {
    const key = this.cacheKey(creatorId, `${courseId}:${from.toISOString()}`, to.toISOString(), 'course');
    const cached = await this.getCache<any>(key);
    if (cached) return cached;

    const creatorObjectId = this.getCreatorObjectId(creatorId);
    const coursesCollection = this.dbConnection.db?.collection('cours');
    const enrollmentsCollection = this.dbConnection.db?.collection('courseenrollments');
    const tracking = this.dbConnection.collection('trackingactions');

    // Resolve by either custom id or Mongo _id string
    const courseMatch: any[] = [{ id: courseId }];
    if (Types.ObjectId.isValid(courseId)) {
      courseMatch.push({ _id: new Types.ObjectId(courseId) });
    }

    const course = await coursesCollection?.findOne({ $or: courseMatch, creatorId: creatorObjectId });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Canonical course content id for tracking/rollups is custom `id`.
    const canonicalCourseId = String(course.id || courseId);

    // Fetch enrollments, then filter by period in-memory to support inconsistent date field usage.
    const allEnrollments = await enrollmentsCollection?.find({
      courseId: new Types.ObjectId(course._id),
    }).toArray() || [];

    const inRange = (value: any): boolean => {
      const date = value instanceof Date ? value : new Date(value);
      return !Number.isNaN(date.getTime()) && date >= from && date <= to;
    };

    const getEnrollmentDate = (enrollment: any): Date | null => {
      const candidate = enrollment?.enrolledAt || enrollment?.createdAt;
      if (!candidate) return null;
      const parsed = candidate instanceof Date ? candidate : new Date(candidate);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const periodEnrollments = allEnrollments.filter((enrollment: any) => {
      const enrollmentDate = getEnrollmentDate(enrollment);
      return enrollmentDate ? inRange(enrollmentDate) : false;
    });

    const pricePerEnrollment = Number(course?.prix || 0);
    const enrollmentsCount = periodEnrollments.length;
    const revenue = enrollmentsCount * pricePerEnrollment;

    const completionCount = periodEnrollments.filter((enrollment: any) => {
      const completedAt = enrollment?.completedAt;
      if (completedAt) return inRange(completedAt);
      // Fallback: treat as completed if all progression entries are complete
      const progression = Array.isArray(enrollment?.progression) ? enrollment.progression : [];
      if (progression.length === 0) return false;
      return progression.every((entry: any) => Boolean(entry?.isCompleted));
    }).length;

    let totalProgressItems = 0;
    let completedProgressItems = 0;
    for (const enrollment of periodEnrollments) {
      const progression = Array.isArray(enrollment?.progression) ? enrollment.progression : [];
      totalProgressItems += progression.length;
      completedProgressItems += progression.filter((entry: any) => Boolean(entry?.isCompleted)).length;
    }

    const completionRate = totalProgressItems > 0
      ? (completedProgressItems / totalProgressItems) * 100
      : 0;

    const courseTracking = await tracking.aggregate([
      {
        $match: {
          timestamp: { $gte: from, $lte: to },
          contentType: 'course',
          contentId: canonicalCourseId,
        },
      },
      {
        $group: {
          _id: null,
          views: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.VIEW] }, 1, 0] } },
          starts: { $sum: { $cond: [{ $eq: ['$actionType', TrackingActionType.START] }, 1, 0] } },
        },
      },
    ]).toArray();

    const dailyTrendFromMongo = await this.dailyModel.aggregate([
      {
        $match: {
          creatorId: creatorObjectId,
          contentType: 'course',
          contentId: canonicalCourseId,
          date: { $gte: from, $lte: to },
        },
      },
      {
        $project: {
          _id: 0,
          date: 1,
          views: 1,
          starts: 1,
          completes: 1,
          watchTimeSeconds: '$watchTime',
        },
      },
      { $sort: { date: 1 } },
    ]);

    let trendForCourse = dailyTrendFromMongo;
    try {
      if (process.env.USE_GA4_COURSE_TREND === 'true') {
        const ga4Trend = await this.ga4ReportingService.getContentTimeSeries(
          canonicalCourseId,
          'course',
          from.toISOString().slice(0, 10),
          to.toISOString().slice(0, 10),
        );
        if (ga4Trend.length > 0) {
          trendForCourse = ga4Trend.map((row) => ({
            date: row.date,
            views: Number(row.views || 0),
            starts: Number(row.starts || 0),
            completes: Number(row.completes || 0),
            watchTimeSeconds: 0,
          }));
        }
      }
    } catch {
      // Fail silently and keep Mongo-based trend
    }

    const views = Number(courseTracking?.[0]?.views || 0);
    const starts = Number(courseTracking?.[0]?.starts || 0);
    const totalWatchTimeSeconds = trendForCourse.reduce(
      (sum, day: any) => sum + Number(day?.watchTimeSeconds || 0),
      0,
    );
    const avgWatchTimeSeconds = starts > 0 ? totalWatchTimeSeconds / starts : 0;

    const round2 = (value: number): number => Math.round(value * 100) / 100;
    const viewsToEnrollmentRate = views > 0 ? (enrollmentsCount / views) * 100 : 0;
    const dropOffRate = totalProgressItems > 0 ? 100 - completionRate : 0;
    const engagementScore = views > 0 ? (starts / views) * 100 : 0;

    if (process.env.DEBUG_ANALYTICS_COURSE === 'true') {
      this.logger.debug(
        `[CourseAnalytics] course=${canonicalCourseId} range=${from.toISOString()}..${to.toISOString()} enrollments=${enrollmentsCount} views=${views} starts=${starts} progress=${completedProgressItems}/${totalProgressItems}`,
      );
    }

    const analytics = {
      courseId: canonicalCourseId,
      courseTitle: String(course.titre || ''),
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      kpis: {
        enrollments: enrollmentsCount,
        revenue: round2(revenue),
        views,
        starts,
        completes: completionCount,
        completionRate: round2(completionRate),
        avgWatchTimeSeconds: round2(avgWatchTimeSeconds),
        totalWatchTimeSeconds: round2(totalWatchTimeSeconds),
      },
      rates: {
        viewsToEnrollmentRate: round2(viewsToEnrollmentRate),
        dropOffRate: round2(dropOffRate),
        engagementScore: round2(engagementScore),
      },
      dailyTrend: trendForCourse.map((day: any) => ({
        date: day?.date,
        views: Number(day?.views || 0),
        starts: Number(day?.starts || 0),
        completes: Number(day?.completes || 0),
        watchTimeSeconds: Number(day?.watchTimeSeconds || 0),
      })),
      meta: {
        completionSource: 'progression',
        timezone: 'UTC',
        currency: String(course.devise || 'TND'),
      },
    };

    this.setCache(key, analytics);
    return analytics;
  }

  async debugCreatorStatus(creatorId: string, communityId?: string, communitySlug?: string) {
    const communityScope = await this.resolveCommunityScope(creatorId, communityId, communitySlug);
    const tracking = this.dbConnection.collection('trackingactions');
    const coursesCol = this.dbConnection.collection('cours');

    // 1. Check raw tracking actions for this creator's courses
    const trackingSummary = await tracking.aggregate([
      { $match: { contentType: 'course' } },
      {
        $lookup: {
          from: 'cours',
          localField: 'contentId',
          foreignField: 'id',
          as: 'courseInfo'
        }
      },
      { $unwind: '$courseInfo' },
      { $match: { 'courseInfo.creatorId': this.getCreatorObjectId(creatorId) } },
      ...(communityScope.hasFilter ? [{ $match: this.buildLookupCommunityMatch('courseInfo.communityId', communityScope.lookupCommunityValues) }] : []),
      {
        $group: {
          _id: { action: '$actionType', contentId: '$contentId' },
          count: { $sum: 1 },
          communityId: { $first: '$courseInfo.communityId' }
        }
      }
    ]).toArray();

    // 2. Count tracking actions for ALL content types
    const trackingByAllTypes = await tracking.aggregate([
      { $group: { _id: '$contentType', count: { $sum: 1 } } }
    ]).toArray();

    // 3. Check rollups in analytics_daily
    const match: any = { creatorId: this.getCreatorObjectId(creatorId) };
    if (communityScope.hasFilter) this.setDailyCommunityFilter(match, communityScope.communityIdStrings);

    const rollupSummary = await this.dailyModel.aggregate([
      { $match: match },
      { $group: { _id: '$contentType', count: { $sum: 1 }, totalViews: { $sum: '$views' }, totalStarts: { $sum: '$starts' } } }
    ]);

    // 4. Check course id vs _id usage for a sample course
    const sampleCourse = await coursesCol.findOne({ creatorId: new Types.ObjectId(creatorId) });

    return {
      creatorId,
      communityIdFilter: communityScope.cacheKeyPart,
      trackingSummary,
      trackingByAllTypes,
      rollupSummary,
      courseMapping: sampleCourse ? {
        mongoId: sampleCourse._id,
        customId: sampleCourse.id,
        communityId: sampleCourse.communityId
      } : 'No courses found'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: New Analytics Endpoints
  // ═══════════════════════════════════════════════════════════

  async getRevenue(creatorId: string, from: Date, to: Date, communityId?: string, communitySlug?: string, contentType?: string, contentId?: string) {
    const { from: clampedFrom, to: clampedTo } = await this.clampDateRangeForPlan(creatorId, from, to);
    const cacheKeyStr = this.cacheKey(creatorId, clampedFrom.toISOString(), clampedTo.toISOString(), `revenue:${contentType || 'all'}:${contentId || 'all'}`);
    const cached = await this.getCache<any>(cacheKeyStr);
    if (cached) return cached;

    const creatorObjId = this.getCreatorObjectId(creatorId);
    const { communityIdStrings } = await this.resolveCommunityScope(creatorId, communityId, communitySlug);

    const match: Record<string, any> = {
      creatorId: creatorObjId,
      date: { $gte: clampedFrom, $lte: clampedTo },
      revenueAttributed: { $gt: 0 },
    };
    if (communityIdStrings.length > 0) this.setDailyCommunityFilter(match, communityIdStrings);
    if (contentType) match.contentType = contentType;
    if (contentId) match.contentId = contentId;

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: { contentType: '$contentType', contentId: '$contentId' },
          revenue: { $sum: '$revenueAttributed' },
          views: { $sum: '$views' },
          starts: { $sum: '$starts' },
          completes: { $sum: '$completes' },
          currency: { $first: '$currency' },
        },
      },
      { $sort: { revenue: -1 } },
    ];

    const byContent = await this.dailyModel.aggregate(pipeline).exec();

    const trendPipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          revenue: { $sum: '$revenueAttributed' },
          orders: { $sum: '$completes' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const trend = await this.dailyModel.aggregate(trendPipeline).exec();
    const totalRevenue = byContent.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const totalOrders = byContent.reduce((sum, r) => sum + (r.completes || 0), 0);

    const result = {
      totalRevenue,
      currency: byContent[0]?.currency || 'TND',
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      byContent: byContent.map((r) => ({
        contentType: r._id.contentType,
        contentId: r._id.contentId,
        revenue: r.revenue,
        views: r.views,
        starts: r.starts,
        completes: r.completes,
        revenueShare: totalRevenue > 0 ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0,
      })),
      trend: trend.map((t) => ({ date: t._id, revenue: t.revenue, orders: t.orders })),
    };

    this.setCache(cacheKeyStr, result, 5 * 60 * 1000);
    return result;
  }

  async getGeography(creatorId: string, from: Date, to: Date, granularity: 'country' | 'city', communityId?: string, communitySlug?: string) {
    const { from: clampedFrom, to: clampedTo } = await this.clampDateRangeForPlan(creatorId, from, to);
    const cacheKeyStr = this.cacheKey(creatorId, clampedFrom.toISOString(), clampedTo.toISOString(), `geo:${granularity}`);
    const cached = await this.getCache<any>(cacheKeyStr);
    if (cached) return cached;

    const creatorObjId = this.getCreatorObjectId(creatorId);
    const { communityIdStrings } = await this.resolveCommunityScope(creatorId, communityId, communitySlug);

    const match: Record<string, any> = {
      creatorId: creatorObjId,
      date: { $gte: clampedFrom, $lte: clampedTo },
    };
    if (communityIdStrings.length > 0) this.setDailyCommunityFilter(match, communityIdStrings);

    const pipeline: any[] = [
      { $match: match },
      {
        $project: {
          countryViews: { $objectToArray: { $ifNull: ['$countryViews', {}] } },
          views: 1,
        },
      },
      { $unwind: { path: '$countryViews', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$countryViews.k',
          views: { $sum: '$countryViews.v' },
        },
      },
      { $sort: { views: -1 } },
    ];

    const rows = await this.dailyModel.aggregate(pipeline).exec();
    const totalViews = rows.reduce((s, r) => s + r.views, 0);

    const result = {
      granularity,
      data: rows.map((r) => ({
        code: r._id,
        name: r._id,
        views: r.views,
        share: totalViews > 0 ? Math.round((r.views / totalViews) * 1000) / 10 : 0,
      })),
    };

    this.setCache(cacheKeyStr, result, 30 * 60 * 1000);
    return result;
  }

  async getRetention(creatorId: string, from: Date, to: Date, period: 'weekly' | 'monthly', communityId?: string) {
    const { from: clampedFrom, to: clampedTo } = await this.clampDateRangeForPlan(creatorId, from, to);
    const cacheKeyStr = this.cacheKey(creatorId, clampedFrom.toISOString(), clampedTo.toISOString(), `retention:${period}`);
    const cached = await this.getCache<any>(cacheKeyStr);
    if (cached) return cached;

    const creatorObjId = this.getCreatorObjectId(creatorId);
    const match: Record<string, any> = {
      creatorId: creatorObjId,
      period,
      cohortStart: { $gte: clampedFrom, $lte: clampedTo },
    };
    if (communityId) match.communityId = communityId;

    const rows = await this.retentionModel.find(match).sort({ cohortStart: -1, week: 1 }).lean();

    const cohortMap = new Map<string, { cohortLabel: string; cohortStart: string; cohortSize: number; weeks: any[] }>();
    for (const row of rows) {
      const key = row.cohortStart.toISOString();
      if (!cohortMap.has(key)) {
        cohortMap.set(key, {
          cohortLabel: period === 'weekly' ? `Week of ${row.cohortStart.toISOString().slice(0, 10)}` : row.cohortStart.toISOString().slice(0, 7),
          cohortStart: row.cohortStart.toISOString().slice(0, 10),
          cohortSize: row.cohortSize,
          weeks: [],
        });
      }
      cohortMap.get(key)!.weeks.push({ week: row.week, retained: row.retained, rate: row.retentionRate });
    }

    const result = { cohorts: Array.from(cohortMap.values()) };
    this.setCache(cacheKeyStr, result, 60 * 60 * 1000);
    return result;
  }

  async getCompare(creatorId: string, from: Date, to: Date, compareFrom: Date, compareTo: Date, metric: string, communityId?: string, communitySlug?: string) {
    const { from: clampedFrom, to: clampedTo } = await this.clampDateRangeForPlan(creatorId, from, to);
    const creatorObjId = this.getCreatorObjectId(creatorId);
    const { communityIdStrings } = await this.resolveCommunityScope(creatorId, communityId, communitySlug);

    const aggregateForRange = async (rangeFrom: Date, rangeTo: Date) => {
      const match: Record<string, any> = {
        creatorId: creatorObjId,
        date: { $gte: rangeFrom, $lte: rangeTo },
      };
      if (communityIdStrings.length > 0) this.setDailyCommunityFilter(match, communityIdStrings);

      const metricField = `$${metric}`;
      const pipeline: any[] = [
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            value: { $sum: metricField },
          },
        },
        { $sort: { _id: 1 } },
      ];
      return this.dailyModel.aggregate(pipeline).exec();
    };

    const [currentTrend, previousTrend] = await Promise.all([
      aggregateForRange(clampedFrom, clampedTo),
      aggregateForRange(compareFrom, compareTo),
    ]);

    const currentTotal = currentTrend.reduce((s, r) => s + (r.value || 0), 0);
    const previousTotal = previousTrend.reduce((s, r) => s + (r.value || 0), 0);
    const change = previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10 : 0;

    return {
      metric,
      current: { value: currentTotal, trend: currentTrend.map((t) => ({ date: t._id, value: t.value })) },
      previous: { value: previousTotal, trend: previousTrend.map((t) => ({ date: t._id, value: t.value })) },
      change,
      changeDirection: change >= 0 ? 'up' : 'down',
    };
  }

  async getSessionQuality(creatorId: string, sessionId: string, from: Date, to: Date) {
    const { from: clampedFrom, to: clampedTo } = await this.clampDateRangeForPlan(creatorId, from, to);
    const creatorObjId = this.getCreatorObjectId(creatorId);

    const match: Record<string, any> = {
      creatorId: creatorObjId,
      contentType: 'session',
      contentId: sessionId,
      date: { $gte: clampedFrom, $lte: clampedTo },
    };

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: '$starts' },
          showUps: { $sum: '$sessionShowUps' },
          noShows: { $sum: '$sessionNoShows' },
          rebookings: { $sum: '$sessionRebookings' },
          avgRating: { $avg: '$avgRating' },
          completes: { $sum: '$completes' },
          revenue: { $sum: '$revenueAttributed' },
        },
      },
    ];

    const [agg] = await this.dailyModel.aggregate(pipeline).exec();
    const totalBookings = agg?.totalBookings || 0;

    return {
      sessionId,
      totalBookings,
      showUpRate: totalBookings > 0 ? Math.round((agg?.showUps / totalBookings) * 1000) / 10 : 0,
      noShowRate: totalBookings > 0 ? Math.round((agg?.noShows / totalBookings) * 1000) / 10 : 0,
      rebookingRate: totalBookings > 0 ? Math.round((agg?.rebookings / totalBookings) * 1000) / 10 : 0,
      avgRating: Math.round((agg?.avgRating || 0) * 10) / 10,
      completedSessions: agg?.completes || 0,
      revenue: agg?.revenue || 0,
    };
  }

  async getChallengeStreaks(creatorId: string, challengeId: string, from: Date, to: Date) {
    const { from: clampedFrom, to: clampedTo } = await this.clampDateRangeForPlan(creatorId, from, to);
    const creatorObjId = this.getCreatorObjectId(creatorId);

    const match: Record<string, any> = {
      creatorId: creatorObjId,
      contentType: 'challenge',
      contentId: challengeId,
      date: { $gte: clampedFrom, $lte: clampedTo },
    };

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalParticipants: { $sum: '$uniqueUsers' },
          totalCompletes: { $sum: '$completes' },
          totalStarts: { $sum: '$starts' },
          activeStreaks: { $max: '$activeStreaks' },
          maxStreakDays: { $max: '$maxStreakDays' },
        },
      },
    ];

    const [agg] = await this.dailyModel.aggregate(pipeline).exec();
    const participants = agg?.totalParticipants || 0;

    return {
      challengeId,
      activeChallengers: participants,
      dailyActiveRate: participants > 0 ? Math.round(((agg?.activeStreaks || 0) / participants) * 1000) / 10 : 0,
      avgStreakDays: agg?.activeStreaks ? Math.round((agg.maxStreakDays || 0) / Math.max(agg.activeStreaks, 1) * 10) / 10 : 0,
      maxStreakDays: agg?.maxStreakDays || 0,
      completionRate: agg?.totalStarts > 0 ? Math.round(((agg?.totalCompletes || 0) / agg.totalStarts) * 1000) / 10 : 0,
    };
  }

  async getLatestWeeklyReport(creatorId: string) {
    const creatorObjId = this.getCreatorObjectId(creatorId);
    return this.weeklyReportModel.findOne({ creatorId: creatorObjId }).sort({ weekStart: -1 }).lean();
  }

}

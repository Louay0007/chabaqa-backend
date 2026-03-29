import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsService } from './analytics.service';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../schema/subscription.schema';
import { AnalyticsWeeklyReport, AnalyticsWeeklyReportDocument } from '../schema/analytics-weekly-report.schema';
import { CreatorInsightsService } from './creator-insights.service';

@Injectable()
export class AnalyticsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsScheduler.name);
  private hourlyTimer?: NodeJS.Timeout;
  private dailyTimer?: NodeJS.Timeout;
  private weeklyTimer?: NodeJS.Timeout;

  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(AnalyticsWeeklyReport.name) private readonly weeklyReportModel: Model<AnalyticsWeeklyReportDocument>,
  ) {}

  async onModuleInit() {
    const hourlyMs = Number(process.env.ANALYTICS_HOURLY_MS || 60 * 60 * 1000);
    this.hourlyTimer = setInterval(() => {
      this.runHourly().catch(err => this.logger.error('Hourly rollup failed', err.stack));
    }, hourlyMs);

    this.scheduleDaily(2, 15);
    this.scheduleWeekly(1, 9, 0); // Monday 09:00
    this.logger.log('Analytics rollup scheduler started (hourly + daily + weekly)');
  }

  private async runHourly() {
    const creators = await this.getActiveCreatorIds();
    const today = new Date();
    for (const creatorId of creators) {
      await this.analyticsService.rollupDayForCreator(creatorId, today);
    }
    this.logger.log(`Hourly rollup completed for ${creators.length} creators`);
  }

  private scheduleDaily(hour: number, minute: number) {
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date();
      next.setHours(hour, minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const delay = next.getTime() - now.getTime();
      this.dailyTimer = setTimeout(async () => {
        try {
          const creators = await this.getActiveCreatorIds();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          for (const creatorId of creators) {
            await this.analyticsService.rollupDayForCreator(creatorId, yesterday);
          }
          this.logger.log(`Daily rollup completed for ${creators.length} creators`);
        } catch (err) {
          this.logger.error('Daily rollup failed', err.stack);
        } finally {
          scheduleNext();
        }
      }, delay);
    };
    scheduleNext();
  }

  private scheduleWeekly(dayOfWeek: number, hour: number, minute: number) {
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date();
      next.setHours(hour, minute, 0, 0);

      const daysUntil = (dayOfWeek - now.getDay() + 7) % 7;
      if (daysUntil === 0 && next <= now) {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + daysUntil);
      }

      const delay = next.getTime() - now.getTime();
      this.weeklyTimer = setTimeout(async () => {
        try {
          await this.runWeeklyReports();
        } catch (err) {
          this.logger.error('Weekly report generation failed', err.stack);
        } finally {
          scheduleNext();
        }
      }, delay);
    };
    scheduleNext();
  }

  private async runWeeklyReports() {
    const growthPlusSubs = await this.subModel.find({
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      plan: { $in: ['growth', 'pro', 'enterprise'] },
    }, { creatorId: 1, plan: 1 }).lean();

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    let generated = 0;
    for (const sub of growthPlusSubs) {
      try {
        const creatorId = String(sub.creatorId);
        const from = weekStart;
        const to = new Date();

        const ovData = await this.analyticsService.getOverview(creatorId, from, to);

        const highlights = [
          { metric: 'views', value: ovData?.views ?? 0, change: 0 },
          { metric: 'completes', value: ovData?.completes ?? 0, change: 0 },
          { metric: 'revenue', value: ovData?.revenue ?? 0, change: 0 },
          { metric: 'starts', value: ovData?.starts ?? 0, change: 0 },
        ];

        const summary = `This week you had ${ovData?.views ?? 0} views, ${ovData?.completes ?? 0} completions, and ${ovData?.starts ?? 0} starts across all your content.`;

        await this.weeklyReportModel.findOneAndUpdate(
          { creatorId: new Types.ObjectId(creatorId), weekStart },
          {
            creatorId: new Types.ObjectId(creatorId),
            weekStart,
            plan: sub.plan || 'growth',
            summary,
            topIssues: [],
            fixes: [],
            highlights,
            deliveredAt: new Date(),
          },
          { upsert: true, new: true },
        );

        generated++;
      } catch (err) {
        this.logger.warn(`Weekly report failed for creator ${sub.creatorId}: ${err.message}`);
      }
    }

    this.logger.log(`Weekly reports generated for ${generated}/${growthPlusSubs.length} Growth+ creators`);
  }

  private async getActiveCreatorIds(): Promise<string[]> {
    const subs = await this.subModel.find({ status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } }, { creatorId: 1 }).lean();
    return subs.map(s => String(s.creatorId));
  }
}

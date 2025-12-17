import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsService } from './analytics.service';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../schema/subscription.schema';

@Injectable()
export class AnalyticsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsScheduler.name);
  private hourlyTimer?: NodeJS.Timeout;
  private dailyTimer?: NodeJS.Timeout;

  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
  ) {}

  async onModuleInit() {
    // Always enabled by default
    const hourlyMs = Number(process.env.ANALYTICS_HOURLY_MS || 60 * 60 * 1000);
    this.hourlyTimer = setInterval(() => {
      this.runHourly().catch(err => this.logger.error('Hourly rollup failed', err.stack));
    }, hourlyMs);

    // Daily: roll yesterday at 02:15 AM server time
    this.scheduleDaily(2, 15);
    this.logger.log('Analytics rollup scheduler started');
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

  private async getActiveCreatorIds(): Promise<string[]> {
    const subs = await this.subModel.find({ status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } }, { creatorId: 1 }).lean();
    return subs.map(s => String(s.creatorId));
  }
}



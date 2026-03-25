import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from '../schema/subscription.schema';

/**
 * Periodically checks for expired subscriptions / trials and marks them
 * as PAST_DUE so that PolicyService begins restricting access.
 *
 * Only runs when PLAN_ENFORCEMENT_MODE=true.
 */
@Injectable()
export class SubscriptionScheduler {
  private readonly logger = new Logger(SubscriptionScheduler.name);

  constructor(
    @InjectModel(Subscription.name)
    private readonly subModel: Model<SubscriptionDocument>,
  ) {}

  /** Every hour: move active subscriptions past their billing end → PAST_DUE */
  @Cron(CronExpression.EVERY_HOUR)
  async expireSubscriptions(): Promise<void> {
    if (process.env.PLAN_ENFORCEMENT_MODE !== 'true') return;

    const now = new Date();
    const result = await this.subModel.updateMany(
      {
        status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        currentPeriodEnd: { $lt: now },
      },
      { $set: { status: SubscriptionStatus.PAST_DUE } },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Expired ${result.modifiedCount} subscription(s) whose currentPeriodEnd < now`,
      );
    }
  }

  /** Every hour: expire free trials that have no payment method attached */
  @Cron(CronExpression.EVERY_HOUR)
  async expireTrials(): Promise<void> {
    if (process.env.PLAN_ENFORCEMENT_MODE !== 'true') return;

    const now = new Date();
    const result = await this.subModel.updateMany(
      {
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: { $lt: now },
        hasPaymentMethod: false,
      },
      { $set: { status: SubscriptionStatus.PAST_DUE } },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Expired ${result.modifiedCount} trial subscription(s) without payment method`,
      );
    }
  }

  /** Daily at 03:00: archive subscriptions canceled > 90 days ago */
  @Cron('0 3 * * *')
  async archiveCanceled(): Promise<void> {
    if (process.env.PLAN_ENFORCEMENT_MODE !== 'true') return;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.subModel.updateMany(
      {
        status: SubscriptionStatus.CANCELED,
        updatedAt: { $lt: ninetyDaysAgo },
        archived: { $ne: true },
      },
      { $set: { archived: true } },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Archived ${result.modifiedCount} subscription(s) canceled > 90 days ago`,
      );
    }
  }
}

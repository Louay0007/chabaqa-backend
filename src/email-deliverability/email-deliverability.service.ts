import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  EmailDeliverabilitySnapshot,
  EmailDeliverabilitySnapshotDocument,
} from '../schema/email-deliverability.schema';

export type DeliverabilityStatus = 'healthy' | 'warning' | 'critical';

function computeScore(bounceRate: number, spamRate: number, unsubscribeRate: number): number {
  const raw = 100 - bounceRate * 200 - spamRate * 1000 - unsubscribeRate * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function getStatus(score: number): DeliverabilityStatus {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  return 'critical';
}

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class EmailDeliverabilityService {
  private readonly logger = new Logger(EmailDeliverabilityService.name);

  constructor(
    @InjectModel(EmailDeliverabilitySnapshot.name)
    private readonly snapshotModel: Model<EmailDeliverabilitySnapshotDocument>,
  ) {}

  async recordBounce(communityId: string | Types.ObjectId, _email: string, _campaignId?: string): Promise<void> {
    const date = todayUtc();
    await this.snapshotModel.updateOne(
      { communityId: new Types.ObjectId(communityId.toString()), date },
      { $inc: { bounced: 1 } },
      { upsert: true },
    );
  }

  async recordSpamComplaint(communityId: string | Types.ObjectId, _email: string): Promise<void> {
    const date = todayUtc();
    await this.snapshotModel.updateOne(
      { communityId: new Types.ObjectId(communityId.toString()), date },
      { $inc: { spamComplaints: 1 } },
      { upsert: true },
    );
  }

  async incrementSent(communityId: string | Types.ObjectId, count = 1): Promise<void> {
    const date = todayUtc();
    await this.snapshotModel.updateOne(
      { communityId: new Types.ObjectId(communityId.toString()), date },
      { $inc: { sent: count, delivered: count } },
      { upsert: true },
    );
  }

  async incrementUnsubscribe(communityId: string | Types.ObjectId): Promise<void> {
    const date = todayUtc();
    await this.snapshotModel.updateOne(
      { communityId: new Types.ObjectId(communityId.toString()), date },
      { $inc: { unsubscribes: 1 } },
      { upsert: true },
    );
  }

  async getDailySnapshots(communityId: string | Types.ObjectId, days = 30) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);
    return this.snapshotModel
      .find({ communityId: new Types.ObjectId(communityId.toString()), date: { $gte: since } })
      .sort({ date: 1 })
      .lean();
  }

  async getHealthSummary(communityId: string | Types.ObjectId) {
    const snapshots = await this.getDailySnapshots(communityId, 30);
    const totals = snapshots.reduce(
      (acc, s) => ({
        sent: acc.sent + s.sent,
        bounced: acc.bounced + s.bounced,
        spamComplaints: acc.spamComplaints + s.spamComplaints,
        unsubscribes: acc.unsubscribes + s.unsubscribes,
        openRateSum: acc.openRateSum + s.openRate,
        clickRateSum: acc.clickRateSum + s.clickRate,
        count: acc.count + 1,
      }),
      { sent: 0, bounced: 0, spamComplaints: 0, unsubscribes: 0, openRateSum: 0, clickRateSum: 0, count: 0 },
    );

    const bounceRate = totals.sent > 0 ? totals.bounced / totals.sent : 0;
    const spamRate = totals.sent > 0 ? totals.spamComplaints / totals.sent : 0;
    const unsubscribeRate = totals.sent > 0 ? totals.unsubscribes / totals.sent : 0;
    const score = computeScore(bounceRate, spamRate, unsubscribeRate);

    return {
      score,
      status: getStatus(score),
      bounceRate: Math.round(bounceRate * 10000) / 100,
      spamRate: Math.round(spamRate * 10000) / 100,
      unsubscribeRate: Math.round(unsubscribeRate * 10000) / 100,
      avgOpenRate: totals.count > 0 ? Math.round((totals.openRateSum / totals.count) * 10000) / 100 : 0,
      avgClickRate: totals.count > 0 ? Math.round((totals.clickRateSum / totals.count) * 10000) / 100 : 0,
      totalSent: totals.sent,
    };
  }

  @Cron('0 2 * * *')
  async computeDailySnapshot(): Promise<void> {
    this.logger.log('Running daily deliverability snapshot computation');
    // Aggregate previous day's data — snapshots are already incremented in real-time.
    // This cron simply refreshes deliverabilityScore on all snapshots from yesterday.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const snapshots = await this.snapshotModel.find({ date: yesterday }).lean();
    for (const snap of snapshots) {
      const bounceRate = snap.sent > 0 ? snap.bounced / snap.sent : 0;
      const spamRate = snap.sent > 0 ? snap.spamComplaints / snap.sent : 0;
      const unsubRate = snap.sent > 0 ? snap.unsubscribes / snap.sent : 0;
      const score = computeScore(bounceRate, spamRate, unsubRate);
      await this.snapshotModel.updateOne({ _id: snap._id }, { $set: { deliverabilityScore: score } });
    }
  }
}

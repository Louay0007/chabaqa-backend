import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';
import { EmailCampaignSendJobPayload } from './email-campaign.jobs';

const REDIS_READY_LIST = 'email-campaigns:ready';
const REDIS_SCHEDULED_ZSET = 'email-campaigns:scheduled';
const REDIS_PAYLOAD_HASH = 'email-campaigns:payloads';

/** Error strings from Redis that indicate the connection is no longer usable. */
const REDIS_CONNECTION_ERROR_PATTERNS = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'socket hang up', 'Connection is closed'];

function isConnectionError(message: string): boolean {
  return REDIS_CONNECTION_ERROR_PATTERNS.some((p) => message.includes(p));
}

@Injectable()
export class EmailCampaignQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailCampaignQueueService.name);
  private client: any = null;
  private connectingPromise: Promise<any> | null = null;

  async queueCampaignSend(
    payload: EmailCampaignSendJobPayload,
    scheduledAt?: Date,
  ): Promise<{ queued: true; jobId: string; delayMs: number }> {
    const client = await this.getClient();
    const jobId = this.getJobId(payload.campaignId);
    const delayMs = Math.max(0, (scheduledAt?.getTime() || Date.now()) - Date.now());

    await this.removeScheduledCampaignSend(payload.campaignId);
    await client.hSet(REDIS_PAYLOAD_HASH, payload.campaignId, JSON.stringify(payload));

    if (delayMs > 0) {
      await client.zAdd(REDIS_SCHEDULED_ZSET, [
        { score: Date.now() + delayMs, value: payload.campaignId },
      ]);
    } else {
      await client.rPush(REDIS_READY_LIST, payload.campaignId);
    }

    this.logger.log(`Queued campaign ${payload.campaignId} (delayMs=${delayMs})`);
    return { queued: true, jobId, delayMs };
  }

  async removeScheduledCampaignSend(campaignId: string): Promise<boolean> {
    const client = await this.getClient();
    const removedScheduled = await client.zRem(REDIS_SCHEDULED_ZSET, campaignId);
    await client.lRem(REDIS_READY_LIST, 0, campaignId);
    return removedScheduled > 0;
  }

  async moveDueScheduledToReady(nowMs: number = Date.now()): Promise<number> {
    const client = await this.getClient();
    const dueCampaignIds = await client.zRangeByScore(REDIS_SCHEDULED_ZSET, 0, nowMs);
    if (dueCampaignIds.length === 0) return 0;

    const multi = client.multi();
    multi.zRem(REDIS_SCHEDULED_ZSET, dueCampaignIds);
    multi.rPush(REDIS_READY_LIST, dueCampaignIds);
    await multi.exec();
    return dueCampaignIds.length;
  }

  async dequeueReadyJobs(maxCount = 10): Promise<EmailCampaignSendJobPayload[]> {
    const client = await this.getClient();
    const jobs: EmailCampaignSendJobPayload[] = [];

    for (let index = 0; index < maxCount; index += 1) {
      const campaignId = await client.lPop(REDIS_READY_LIST);
      if (!campaignId) break;
      const payloadRaw = await client.hGet(REDIS_PAYLOAD_HASH, campaignId);
      if (!payloadRaw) {
        jobs.push({
          campaignId,
          requestedBy: 'system',
          trigger: 'scheduled',
          attempt: 0,
        });
        continue;
      }
      try {
        jobs.push(JSON.parse(payloadRaw) as EmailCampaignSendJobPayload);
      } catch {
        jobs.push({
          campaignId,
          requestedBy: 'system',
          trigger: 'scheduled',
          attempt: 0,
        });
      }
    }

    return jobs;
  }

  async clearJob(campaignId: string): Promise<void> {
    const client = await this.getClient();
    await client.hDel(REDIS_PAYLOAD_HASH, campaignId);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  private getJobId(campaignId: string): string {
    return `campaign-send:${campaignId}`;
  }

  private async getClient(): Promise<any> {
    if (this.client?.isOpen) return this.client;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = (async () => {
      const host = process.env.REDIS_HOST || '127.0.0.1';
      const port = Number(process.env.REDIS_PORT || 6379);
      const password = process.env.REDIS_PASSWORD || undefined;
      const db = Number(process.env.REDIS_DB || 0);

      const client = createClient({
        socket: { host, port, reconnectStrategy: false },
        password,
        database: db,
      });

      client.on('error', (error: Error) => {
        this.logger.error(`Redis queue error: ${error.message}`);
        // Drop the reference on connection errors so the next call reconnects
        if (isConnectionError(error.message)) {
          this.client = null;
        }
      });

      client.on('end', () => {
        this.client = null;
      });

      await client.connect();
      this.client = client;
      return client;
    })();

    try {
      return await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }
}

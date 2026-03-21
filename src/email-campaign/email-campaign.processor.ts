import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EMAIL_CAMPAIGN_MAX_RETRY_ATTEMPTS,
  EMAIL_CAMPAIGN_RETRY_BASE_DELAY_MS,
  EmailCampaignSendJobPayload,
} from './email-campaign.jobs';
import { EmailCampaignQueueService } from './email-campaign.queue';
import { EmailCampaignService } from './email-campaign.service';

/** Redis error messages that indicate a transient infrastructure problem. */
const REDIS_INFRA_ERROR_PATTERNS = [
  'MISCONF',
  'LOADING',
  'READONLY',
  'BUSY',
  'CLUSTERDOWN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
];

function isRedisInfraError(message: string): boolean {
  return REDIS_INFRA_ERROR_PATTERNS.some((p) => message.includes(p));
}

@Injectable()
export class EmailCampaignProcessor {
  private readonly logger = new Logger(EmailCampaignProcessor.name);
  private isProcessing = false;
  private isDailyRunning = false;

  /** Circuit-breaker: timestamp until which queue processing is paused. */
  private redisBackoffUntilMs = 0;
  /** Current backoff duration, doubles on each consecutive failure (30 s → 5 min cap). */
  private redisBackoffDurationMs = 30_000;
  private static readonly REDIS_BACKOFF_MAX_MS = 5 * 60 * 1000;

  constructor(
    private readonly emailCampaignQueueService: EmailCampaignQueueService,
    private readonly emailCampaignService: EmailCampaignService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    // Circuit-breaker: skip silently while in backoff period
    if (Date.now() < this.redisBackoffUntilMs) return;

    this.isProcessing = true;

    try {
      const movedCount = await this.emailCampaignQueueService.moveDueScheduledToReady();
      if (movedCount > 0) {
        this.logger.log(`Moved ${movedCount} due scheduled campaigns to ready queue`);
      }

      const jobs = await this.emailCampaignQueueService.dequeueReadyJobs(10);
      for (const job of jobs) {
        await this.process(job);
      }

      // Reset backoff on success
      this.redisBackoffDurationMs = 30_000;
    } catch (error: any) {
      const message: string = error?.message || 'Unknown error';

      if (isRedisInfraError(message)) {
        this.redisBackoffUntilMs = Date.now() + this.redisBackoffDurationMs;
        this.logger.warn(
          `Redis infrastructure error — pausing queue for ${this.redisBackoffDurationMs / 1000}s: ${message}`,
        );
        // Exponential backoff, capped at 5 minutes
        this.redisBackoffDurationMs = Math.min(
          this.redisBackoffDurationMs * 2,
          EmailCampaignProcessor.REDIS_BACKOFF_MAX_MS,
        );
      } else {
        this.logger.error(`Queue processing error: ${message}`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Runs once per day at 08:00 server time.
   * Sends automated inactivity emails to users in all communities that have
   * configured a continuous inactivity automation (managed via their campaign settings).
   */
  @Cron('0 8 * * *', { name: 'daily-inactivity-automations' })
  async runDailyInactivityAutomations(): Promise<void> {
    if (this.isDailyRunning) return;
    this.isDailyRunning = true;
    try {
      this.logger.log('\u25b6 Running daily inactivity email automations');
      await this.emailCampaignService.runDailyInactivityAutomations();
      this.logger.log('\u2705 Daily inactivity email automations complete');
    } catch (error: any) {
      this.logger.error(`Daily inactivity automation error: ${error?.message || error}`);
    } finally {
      this.isDailyRunning = false;
    }
  }

  async process(job: EmailCampaignSendJobPayload): Promise<void> {
    const attempt = job.attempt || 0;
    try {
      await this.emailCampaignService.executeSendCampaignJob(job);
      await this.emailCampaignQueueService.clearJob(job.campaignId).catch(() => undefined);
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown queue processing error';
      const nextAttempt = attempt + 1;
      if (nextAttempt < EMAIL_CAMPAIGN_MAX_RETRY_ATTEMPTS) {
        const delayMs = EMAIL_CAMPAIGN_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(
          `Retrying campaign ${job.campaignId} in ${delayMs}ms (attempt ${nextAttempt}/${EMAIL_CAMPAIGN_MAX_RETRY_ATTEMPTS}) due to: ${errorMessage}`,
        );
        await this.emailCampaignQueueService.queueCampaignSend(
          {
            campaignId: job.campaignId,
            requestedBy: job.requestedBy || 'system',
            trigger: 'retry',
            attempt: nextAttempt,
          },
          new Date(Date.now() + delayMs),
        );
        return;
      }

      this.logger.error(
        `Campaign ${job.campaignId} failed after ${EMAIL_CAMPAIGN_MAX_RETRY_ATTEMPTS} attempts: ${errorMessage}`,
      );
      await this.emailCampaignService.markCampaignSendFailed(job.campaignId, errorMessage).catch(() => undefined);
      await this.emailCampaignQueueService.clearJob(job.campaignId).catch(() => undefined);
    }
  }
}

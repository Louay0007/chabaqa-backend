import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EMAIL_CAMPAIGN_MAX_RETRY_ATTEMPTS,
  EMAIL_CAMPAIGN_RETRY_BASE_DELAY_MS,
  EmailCampaignSendJobPayload,
} from './email-campaign.jobs';
import { EmailCampaignQueueService } from './email-campaign.queue';
import { EmailCampaignService } from './email-campaign.service';

@Injectable()
export class EmailCampaignProcessor {
  private readonly logger = new Logger(EmailCampaignProcessor.name);
  private isProcessing = false;

  constructor(
    private readonly emailCampaignQueueService: EmailCampaignQueueService,
    private readonly emailCampaignService: EmailCampaignService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
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
    } catch (error: any) {
      this.logger.error(`Queue processing error: ${error?.message || 'Unknown error'}`);
    } finally {
      this.isProcessing = false;
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

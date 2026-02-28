export const EMAIL_CAMPAIGN_QUEUE = 'email-campaigns';
export const EMAIL_CAMPAIGN_SEND_JOB = 'email-campaign.send';

export const EMAIL_CAMPAIGN_MAX_RETRY_ATTEMPTS = 3;
export const EMAIL_CAMPAIGN_RETRY_BASE_DELAY_MS = 30_000;

export type EmailCampaignSendTrigger =
  | 'manual'
  | 'scheduled'
  | 'content-reminder'
  | 'backfill'
  | 'retry';

export interface EmailCampaignSendJobPayload {
  campaignId: string;
  requestedBy: string;
  trigger: EmailCampaignSendTrigger;
  attempt?: number;
}

export const getCampaignSendJobId = (campaignId: string): string => `campaign-send:${campaignId}`;

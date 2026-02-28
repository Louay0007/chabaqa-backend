import mongoose from 'mongoose';
import { createClient } from 'redis';
import {
  EmailCampaign,
  EmailCampaignDocument,
  EmailCampaignSchema,
  EmailCampaignStatus,
} from '../src/schema/email-campaign.schema';
import {
  EmailCampaignSendJobPayload,
} from '../src/email-campaign/email-campaign.jobs';

const REDIS_READY_LIST = 'email-campaigns:ready';
const REDIS_SCHEDULED_ZSET = 'email-campaigns:scheduled';
const REDIS_PAYLOAD_HASH = 'email-campaigns:payloads';

const run = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(mongoUri, {
    dbName: process.env.DB_NAME,
  });

  const EmailCampaignModel = mongoose.model<EmailCampaignDocument>(
    EmailCampaign.name,
    EmailCampaignSchema as any,
  );
  const now = new Date();

  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT || 6379);
  const redisDb = Number(process.env.REDIS_DB || 0);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  const redis = createClient({
    socket: { host: redisHost, port: redisPort },
    database: redisDb,
    password: redisPassword,
  });
  await redis.connect();

  const candidates = (await EmailCampaignModel.find({
    status: EmailCampaignStatus.DRAFT,
    scheduledAt: { $exists: true, $ne: null },
    sentAt: { $exists: false },
  }).exec()) as EmailCampaignDocument[];

  let scheduledCount = 0;
  let immediateQueuedCount = 0;

  for (const campaign of candidates) {
    const scheduledAt = campaign.scheduledAt;
    if (!scheduledAt) continue;

    const campaignId = campaign._id.toString();
    const payload: EmailCampaignSendJobPayload = {
      campaignId,
      requestedBy: campaign.creatorId.toString(),
      trigger: 'backfill',
    };
    await redis.lRem(REDIS_READY_LIST, 0, campaignId);
    await redis.zRem(REDIS_SCHEDULED_ZSET, campaignId);
    await redis.hSet(REDIS_PAYLOAD_HASH, campaignId, JSON.stringify(payload));

    if (scheduledAt.getTime() > now.getTime()) {
      campaign.status = EmailCampaignStatus.SCHEDULED;
      await campaign.save();
      await redis.zAdd(REDIS_SCHEDULED_ZSET, [
        { score: scheduledAt.getTime(), value: campaignId },
      ]);
      scheduledCount += 1;
      continue;
    }

    campaign.status = EmailCampaignStatus.DRAFT;
    campaign.scheduledAt = undefined;
    await campaign.save();

    await redis.rPush(REDIS_READY_LIST, campaignId);
    immediateQueuedCount += 1;
  }

  console.log(
    `[backfill-email-campaign-schedules] candidates=${candidates.length} scheduled=${scheduledCount} immediateQueued=${immediateQueuedCount}`,
  );

  await redis.quit();
  await mongoose.disconnect();
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[backfill-email-campaign-schedules] failed:', error);
    process.exit(1);
  });

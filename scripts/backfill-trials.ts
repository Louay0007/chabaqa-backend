/**
 * Backfill: give all creators without a subscription a 14-day trial on Starter plan.
 * Usage: MONGO_URI="mongodb://..." npx ts-node scripts/backfill-trials.ts
 */

import mongoose, { Types } from 'mongoose';
import { SubscriptionSchema, SubscriptionStatus } from '../src/schema/subscription.schema';
import { PlanSchema, PlanTier } from '../src/schema/plan.schema';
import { UserSchema } from '../src/schema/user.schema';

const SubscriptionModel = mongoose.model('Subscription', SubscriptionSchema, 'subscriptions');
const PlanModel = mongoose.model('Plan', PlanSchema, 'plans');
const UserModel = mongoose.model('User', UserSchema, 'users');

const TRIAL_DAYS = 14;

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/chabaqa_demo';
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const starterPlan = await PlanModel.findOne({ tier: PlanTier.STARTER }).lean();
  if (!starterPlan) throw new Error('Starter plan not found — run seed-plans.ts first!');

  console.log(`📦 Starter plan found: ${starterPlan.name} (${starterPlan.priceDTPerMonth} TND/mo)`);

  const creators = await UserModel.find({ role: 'creator' }, { _id: 1, email: 1 }).lean();
  console.log(`👥 Found ${creators.length} creators`);

  const existingSubCreatorIds = await SubscriptionModel.distinct('creatorId');
  const existingStr = new Set(existingSubCreatorIds.map((id: any) => id.toString()));

  const toBackfill = creators.filter((c: any) => !existingStr.has(c._id.toString()));
  console.log(`⚙️  ${toBackfill.length} creators need a trial (${existingStr.size} already have subscriptions)`);

  if (toBackfill.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  let created = 0;
  let failed = 0;

  for (const creator of toBackfill) {
    try {
      await SubscriptionModel.create({
        creatorId: new Types.ObjectId((creator as any)._id),
        subscriberId: new Types.ObjectId((creator as any)._id), // self (platform subscription)
        plan: PlanTier.STARTER,
        status: SubscriptionStatus.TRIALING,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        cancelAtPeriodEnd: false,
        hasPaymentMethod: false,
        amount: 0,
        currency: 'TND',
        // Denormalized limits from Starter plan
        communitiesMax: starterPlan.limits.communitiesMax,
        membersMax: starterPlan.limits.membersMax,
        coursesActivationMax: starterPlan.limits.coursesActivationMax,
        storageGB: starterPlan.limits.storageGB,
        adminsMax: starterPlan.limits.adminsMax,
        emailCampaignRecipientsPerMonth: starterPlan.limits.emailCampaignRecipientsPerMonth,
        whatsappMessagesPerMonth: starterPlan.limits.whatsappMessagesPerMonth,
        analyticsLookbackDays: starterPlan.limits.analyticsLookbackDays,
        sessionBookingsPerMonth: starterPlan.limits.sessionBookingsPerMonth,
      });
      console.log(`  ✅ ${(creator as any).email} → 14-day trial until ${trialEndsAt.toDateString()}`);
      created++;
    } catch (err: any) {
      console.error(`  ❌ Failed for ${(creator as any).email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🎉 Done! Created ${created} trials. Failed: ${failed}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

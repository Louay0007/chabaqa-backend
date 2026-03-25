/**
 * seed-plans.ts
 *
 * Upserts the canonical plan documents into MongoDB.
 * Run once on first deploy and again whenever plan details change.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed-plans.ts
 *
 * Requires MONGODB_URI in the environment (or loads from .env).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { PlanSchema } from '../src/schema/plan.schema';

const MONGODB_URI = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '';

if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set. Export it or add it to .env');
  process.exit(1);
}

const Plan = mongoose.model('Plan', PlanSchema);

const PLANS = [
  {
    tier: 'starter',
    name: 'Starter',
    priceDTPerMonth: 39,
    yearlyPriceDTPerMonth: 31,
    yearlyTotalDT: 372,
    trialDays: 7,
    transactionFeePercent: 7.9,
    transactionFixedFeeDT: 0,
    isActive: true,
    limits: {
      communitiesMax: 1,
      membersMax: 100,
      coursesActivationMax: 3,
      storageGB: 5,
      adminsMax: 1,
      emailCampaignRecipientsPerMonth: 0,
      whatsappMessagesPerMonth: 0,
      analyticsLookbackDays: 30,
      sessionBookingsPerMonth: 0,
    },
    features: {
      courses: true,
      challenges: false,
      sessions: false,
      products: true,
      events: false,
      automationQuota: 0,
      branding: false,
      gamification: false,
      verifiedBadge: false,
      featuredBadge: false,
    },
  },
  {
    tier: 'growth',
    name: 'Growth',
    priceDTPerMonth: 99,
    yearlyPriceDTPerMonth: 79,
    yearlyTotalDT: 948,
    trialDays: 7,
    transactionFeePercent: 4.9,
    transactionFixedFeeDT: 0,
    isActive: true,
    limits: {
      communitiesMax: 3,
      membersMax: 500,
      coursesActivationMax: 999,
      storageGB: 50,
      adminsMax: 2,
      emailCampaignRecipientsPerMonth: 1000,
      whatsappMessagesPerMonth: 250,
      analyticsLookbackDays: 180,
      sessionBookingsPerMonth: 300,
    },
    features: {
      courses: true,
      challenges: true,
      sessions: true,
      products: true,
      events: true,
      automationQuota: 500,
      branding: false,
      gamification: true,
      verifiedBadge: true,
      featuredBadge: false,
    },
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceDTPerMonth: 159,
    yearlyPriceDTPerMonth: 127,
    yearlyTotalDT: 1524,
    trialDays: 7,
    transactionFeePercent: 2.9,
    transactionFixedFeeDT: 0,
    isActive: true,
    limits: {
      communitiesMax: 10,
      membersMax: 999999,
      coursesActivationMax: 999999,
      storageGB: 300,
      adminsMax: 3,
      emailCampaignRecipientsPerMonth: 15000,
      whatsappMessagesPerMonth: 1000,
      analyticsLookbackDays: 365,
      sessionBookingsPerMonth: 1000,
    },
    features: {
      courses: true,
      challenges: true,
      sessions: true,
      products: true,
      events: true,
      automationQuota: 5000,
      branding: true,
      gamification: true,
      verifiedBadge: true,
      featuredBadge: true,
    },
  },
];

async function seed(): Promise<void> {
  console.log('🌱  Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅  Connected.');

  for (const plan of PLANS) {
    const result = await Plan.findOneAndUpdate(
      { tier: plan.tier },
      { $set: plan },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`  → ${plan.tier.toUpperCase()} plan upserted (id: ${result._id})`);
  }

  console.log('🎉  All plans seeded successfully.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});

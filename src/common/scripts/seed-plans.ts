import 'dotenv/config';
import mongoose from 'mongoose';
import { Plan, PlanSchema, PlanTier } from '../../schema/plan.schema';

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shabaka';
  await mongoose.connect(mongoUri);
  const PlanModel = mongoose.model(Plan.name, PlanSchema, 'plans');

  const docs = [
    {
      tier: PlanTier.STARTER,
      name: 'STARTER',
      priceDTPerMonth: 29,
      trialDays: 7,
      limits: { communitiesMax: 1, membersMax: 100, coursesActivationMax: 3, storageGB: 2, adminsMax: 0 },
      features: { courses: true, products: true, challenges: false, sessions: false, events: false, automationQuota: 0, branding: false, gamification: false, verifiedBadge: false, featuredBadge: false },
      transactionFeePercent: 9.0,
      transactionFixedFeeDT: 0.5,
      isActive: true,
    },
    {
      tier: PlanTier.GROWTH,
      name: 'GROWTH',
      priceDTPerMonth: 69,
      trialDays: 7,
      limits: { communitiesMax: 3, membersMax: 10000, coursesActivationMax: 9999, storageGB: 50, adminsMax: 1 },
      features: { courses: true, products: true, challenges: true, sessions: true, events: true, automationQuota: 500, branding: false, gamification: true, verifiedBadge: true, featuredBadge: false },
      transactionFeePercent: 3.9,
      transactionFixedFeeDT: 0.5,
      isActive: true,
    },
    {
      tier: PlanTier.PRO,
      name: 'PRO',
      priceDTPerMonth: 99,
      trialDays: 7,
      limits: { communitiesMax: 9999, membersMax: 9999999, coursesActivationMax: 9999999, storageGB: 500, adminsMax: 3 },
      features: { courses: true, products: true, challenges: true, sessions: true, events: true, automationQuota: 999999, branding: true, gamification: true, verifiedBadge: true, featuredBadge: true },
      transactionFeePercent: 2.8,
      transactionFixedFeeDT: 0.5,
      isActive: true,
    },
  ];

  for (const doc of docs) {
    await PlanModel.updateOne({ tier: doc.tier }, { $set: doc }, { upsert: true });
    console.log(`Seeded plan: ${doc.name}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



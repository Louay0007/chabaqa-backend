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
      name: 'Starter',
      priceDTPerMonth: 39,
      yearlyPriceDTPerMonth: 31,
      yearlyTotalDT: 372,
      trialDays: 7,
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
        products: true,
        challenges: false,
        sessions: false,
        events: false,
        automationQuota: 0,
        branding: false,
        gamification: false,
        verifiedBadge: false,
        featuredBadge: false,
      },
      transactionFeePercent: 7.9,
      transactionFixedFeeDT: 0.5,
      isActive: true,
    },
    {
      tier: PlanTier.GROWTH,
      name: 'Growth',
      priceDTPerMonth: 99,
      yearlyPriceDTPerMonth: 79,
      yearlyTotalDT: 948,
      trialDays: 7,
      limits: {
        communitiesMax: 1,
        membersMax: 500,
        coursesActivationMax: 999999,
        storageGB: 50,
        adminsMax: 2,
        emailCampaignRecipientsPerMonth: 1000,
        whatsappMessagesPerMonth: 250,
        analyticsLookbackDays: 180,
        sessionBookingsPerMonth: 300,
      },
      features: {
        courses: true,
        products: true,
        challenges: true,
        sessions: true,
        events: true,
        automationQuota: 1000,
        branding: false,
        gamification: true,
        verifiedBadge: true,
        featuredBadge: false,
      },
      transactionFeePercent: 4.9,
      transactionFixedFeeDT: 0.5,
      isActive: true,
    },
    {
      tier: PlanTier.PRO,
      name: 'Pro',
      priceDTPerMonth: 159,
      yearlyPriceDTPerMonth: 127,
      yearlyTotalDT: 1524,
      trialDays: 7,
      limits: {
        communitiesMax: 1,
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
        products: true,
        challenges: true,
        sessions: true,
        events: true,
        automationQuota: 15000,
        branding: true,
        gamification: true,
        verifiedBadge: true,
        featuredBadge: true,
      },
      transactionFeePercent: 2.9,
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



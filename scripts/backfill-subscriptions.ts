/**
 * Backfill subscription documents with subscriberId, amount, currency, and nextBillingAt.
 * - Maps subscriberId from the latest paid SUBSCRIPTION order for the same creator.
 * - Sets amount from the plan price if missing/zero, else from order creatorNetDT.
 * - Defaults currency to 'TND'.
 * - Sets nextBillingAt from currentPeriodEnd if missing.
 *
 * Usage:
 *   MONGO_URI="mongodb://..." npx ts-node scripts/backfill-subscriptions.ts
 */

import mongoose, { Types } from 'mongoose';
import { SubscriptionSchema, SubscriptionStatus } from '../src/schema/subscription.schema';
import { PlanSchema } from '../src/schema/plan.schema';
import { OrderSchema } from '../src/schema/order.schema';
import { TrackableContentType } from '../src/schema/content-tracking.schema';

// Build local models for the script
const SubscriptionModel = mongoose.model('Subscription', SubscriptionSchema);
const PlanModel = mongoose.model('Plan', PlanSchema);
const OrderModel = mongoose.model('Order', OrderSchema);

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const plans = await PlanModel.find({}).lean();
  const priceByTier = new Map(plans.map((p) => [p.tier, p.priceDTPerMonth || 0]));

  const subs = await SubscriptionModel.find({}).exec();
  let updated = 0;
  let missingOrder = 0;
  let missingSubscriber = 0;

  for (const sub of subs) {
    const updates: any = {};

    // If subscriberId missing, try to infer from latest paid subscription order for this creator
    if (!sub.subscriberId) {
      const order = await OrderModel.findOne({
        creatorId: new Types.ObjectId(sub.creatorId),
        contentType: TrackableContentType.SUBSCRIPTION,
        status: 'paid',
      })
        .sort({ createdAt: -1 })
        .lean();

      if (order?.buyerId) {
        updates.subscriberId = order.buyerId;
      } else {
        missingSubscriber++;
        missingOrder += order ? 0 : 1;
      }
    }

    // Backfill amount/currency
    if (!sub.amount || sub.amount === 0) {
      const planPrice = priceByTier.get(sub.plan) || 0;
      updates.amount = planPrice;
    }
    if (!sub.currency) {
      updates.currency = 'TND';
    }

    // If still zero amount and we have an order, use creatorNetDT
    if ((updates.amount === 0 || sub.amount === 0) && updates.subscriberId) {
      const order = await OrderModel.findOne({
        creatorId: new Types.ObjectId(sub.creatorId),
        buyerId: updates.subscriberId,
        contentType: TrackableContentType.SUBSCRIPTION,
        status: 'paid',
      })
        .sort({ createdAt: -1 })
        .lean();
      if (order?.creatorNetDT) {
        updates.amount = order.creatorNetDT;
      }
    }

    // Next billing
    if (!sub.nextBillingAt && sub.currentPeriodEnd) {
      updates.nextBillingAt = sub.currentPeriodEnd;
    }

    if (Object.keys(updates).length > 0) {
      await SubscriptionModel.updateOne({ _id: sub._id }, { $set: updates });
      updated++;
    }
  }

  console.log(`Updated ${updated} subscriptions`);
  if (missingSubscriber) {
    console.log(`Missing subscriberId for ${missingSubscriber} subscriptions (no matching paid order: ${missingOrder})`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

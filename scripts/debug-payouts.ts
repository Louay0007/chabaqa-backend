import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { Payout, PayoutSchema, PayoutStatus } from '../src/schema/payout.schema';
import { Order, OrderSchema } from '../src/schema/order.schema';
import { Community, CommunitySchema } from '../src/schema/community.schema';
import { User, UserSchema } from '../src/schema/user.schema';

type ParsedArgs = {
  creatorId?: string;
  communityId?: string;
  limit?: number;
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const pick = (name: string) => {
    const prefix = `--${name}=`;
    const raw = args.find((a) => a.startsWith(prefix));
    return raw ? raw.slice(prefix.length) : undefined;
  };
  const limit = pick('limit');
  return {
    creatorId: pick('creatorId'),
    communityId: pick('communityId'),
    limit: limit ? Number(limit) : undefined,
  };
};

const toObjectId = (id?: string) => {
  if (!id) return undefined;
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined;
};

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI env variable is required');
    process.exit(1);
  }

  const { creatorId, communityId, limit = 50 } = parseArgs();
  const creatorObjId = toObjectId(creatorId);
  const communityObjId = toObjectId(communityId);

  const conn = await mongoose.connect(mongoUri);

  const PayoutModel = conn.model<Payout>('Payout', PayoutSchema);
  const OrderModel = conn.model<Order>('Order', OrderSchema);
  // Included for completeness; not directly used but helpful if you want to extend the script
  conn.model<Community>('Community', CommunitySchema);
  conn.model<User>('User', UserSchema);

  const payoutMatch: any = {};
  if (creatorObjId) payoutMatch.creatorId = creatorObjId;
  if (communityObjId) payoutMatch.communityId = communityObjId;

  const payouts = await PayoutModel.find(payoutMatch)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const payoutStatsAgg = await PayoutModel.aggregate([
    { $match: payoutMatch },
    {
      $group: {
        _id: '$status',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalPayoutsByStatus = payoutStatsAgg.reduce(
    (acc, cur) => {
      acc[cur._id as PayoutStatus] = {
        amount: cur.totalAmount,
        count: cur.count,
      };
      acc.total += cur.totalAmount || 0;
      return acc;
    },
    {
      total: 0,
      [PayoutStatus.PENDING]: { amount: 0, count: 0 },
      [PayoutStatus.COMPLETED]: { amount: 0, count: 0 },
      [PayoutStatus.FAILED]: { amount: 0, count: 0 },
      [PayoutStatus.CANCELLED]: { amount: 0, count: 0 },
      [PayoutStatus.SCHEDULED]: { amount: 0, count: 0 },
    } as Record<string, any>,
  );

  const orderMatch: any = { status: 'paid' as const };
  if (creatorObjId) orderMatch.creatorId = creatorObjId;
  if (communityObjId) orderMatch.communityId = communityObjId; // Note: order schema currently has no communityId field

  const totalEarnings = await OrderModel.aggregate([
    { $match: orderMatch },
    { $group: { _id: null, total: { $sum: '$creatorNetDT' } } },
  ]);

  const totalEarningsValue = totalEarnings[0]?.total || 0;

  const payoutBalanceMatch = { ...payoutMatch, status: { $in: [PayoutStatus.COMPLETED, PayoutStatus.PENDING, PayoutStatus.SCHEDULED] } };
  const totalPayouts = await PayoutModel.aggregate([
    { $match: payoutBalanceMatch },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalPayoutsValue = totalPayouts[0]?.total || 0;

  const availableBalance = Math.max(0, totalEarningsValue - totalPayoutsValue);

  console.log('--- Payout Debug ---');
  console.log({ creatorId, communityId, limit });
  console.log('\nPayout stats by status:', totalPayoutsByStatus);
  console.log('\nEarnings (sum of Order.creatorNetDT with status=paid):', totalEarningsValue);
  console.log('Payouts (completed+pending+scheduled):', totalPayoutsValue);
  console.log('Available balance:', availableBalance);
  console.log(`\nRecent payouts (max ${limit}):`);
  console.log(
    payouts.map((p) => ({
      id: p._id?.toString(),
      amount: p.amount,
      status: p.status,
      communityId: (p as any).communityId?.toString?.(),
      creatorId: (p as any).creatorId?.toString?.(),
      createdAt: p['createdAt'],
    })),
  );

  await conn.disconnect();
}

main().catch((err) => {
  console.error('Error running payout debug:', err);
  process.exit(1);
});

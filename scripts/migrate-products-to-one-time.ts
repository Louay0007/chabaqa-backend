/**
 * Normalize all products to one-time/free pricing and remove recurring fields.
 *
 * Usage:
 *   MONGO_URI="mongodb://..." npx ts-node scripts/migrate-products-to-one-time.ts
 */

import mongoose from 'mongoose';
import { ProductSchema } from '../src/schema/product.schema';

const ProductModel = mongoose.model('Product', ProductSchema);

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const products = await ProductModel.find({}).select('_id price pricing').lean();
  let updated = 0;

  for (const product of products) {
    const price = Number((product as any)?.price || 0);
    const priceType = price > 0 ? 'one-time' : 'free';

    await ProductModel.updateOne(
      { _id: (product as any)._id },
      {
        $set: {
          'pricing.priceType': priceType,
        },
        $unset: {
          isRecurring: 1,
          recurringInterval: 1,
          'pricing.isRecurring': 1,
          'pricing.recurringInterval': 1,
        },
      },
    );
    updated += 1;
  }

  console.log(`Updated ${updated} products`);
  await mongoose.disconnect();
  console.log('Done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

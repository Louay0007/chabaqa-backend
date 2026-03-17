/**
 * Backfill Migration: Populate community_staff from legacy admins[] / moderateurs[]
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-community-staff.ts
 *
 * Or via the run-with-local-db-env wrapper:
 *   node scripts/run-with-local-db-env.js scripts/backfill-community-staff.ts
 *
 * This script:
 *  1. Iterates all communities.
 *  2. For each community's admins[]: upserts a community_staff record with role "admin".
 *  3. For each community's moderateurs[]: upserts a community_staff record with role "moderator".
 *  4. Skips the owner (community.createur) — owner is always derived, never stored as staff.
 *  5. Is idempotent: safe to run multiple times.
 */

import { connect, connection, model, Schema, Types } from 'mongoose';

// ── Minimal schemas (we don't need the full app schemas) ──

const CommunityMinimalSchema = new Schema(
  {
    createur: { type: Schema.Types.ObjectId },
    admins: [{ type: Schema.Types.ObjectId }],
    moderateurs: [{ type: Schema.Types.ObjectId }],
    name: String,
    slug: String,
  },
  { collection: 'communities', strict: false },
);

const CommunityStaffSchema = new Schema(
  {
    communityId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['admin', 'moderator', 'support'], required: true },
    createdBy: { type: Schema.Types.ObjectId },
    status: { type: String, default: 'active' },
  },
  { collection: 'community_staff', timestamps: true },
);

CommunityStaffSchema.index({ communityId: 1, userId: 1 }, { unique: true });
CommunityStaffSchema.index({ communityId: 1, role: 1 });

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGO_URI env var is required');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB…');
  await connect(uri);
  console.log('✅ Connected');

  const CommunityModel = model('Community', CommunityMinimalSchema);
  const StaffModel = model('CommunityStaff', CommunityStaffSchema);

  // Ensure indexes
  await StaffModel.createIndexes();

  const communities = await CommunityModel.find({}).lean().exec();
  console.log(`📊 Found ${communities.length} communities to process`);

  let totalAdmins = 0;
  let totalModerators = 0;
  let skippedOwner = 0;
  let errors = 0;

  for (const community of communities) {
    const communityId = community._id as Types.ObjectId;
    const createur = community.createur as Types.ObjectId | undefined;
    const admins = (community.admins as Types.ObjectId[]) || [];
    const moderateurs = (community.moderateurs as Types.ObjectId[]) || [];

    // Process admins
    for (const adminId of admins) {
      if (!adminId) continue;
      // Skip the owner — owner is derived
      if (createur && createur.equals(adminId)) {
        skippedOwner++;
        continue;
      }

      try {
        await StaffModel.updateOne(
          { communityId, userId: adminId },
          {
            $set: { role: 'admin', status: 'active' },
            $setOnInsert: {
              communityId,
              userId: adminId,
              createdBy: createur || adminId,
            },
          },
          { upsert: true },
        );
        totalAdmins++;
      } catch (err: any) {
        if (err.code === 11000) {
          // Duplicate — already exists, which is fine
          totalAdmins++;
        } else {
          console.error(`  ❌ Error upserting admin ${adminId} in community ${communityId}:`, err.message);
          errors++;
        }
      }
    }

    // Process moderateurs
    for (const modId of moderateurs) {
      if (!modId) continue;
      if (createur && createur.equals(modId)) {
        skippedOwner++;
        continue;
      }

      // If user is already admin (from admins[]), don't downgrade to moderator
      const existingAsAdmin = await StaffModel.findOne({
        communityId,
        userId: modId,
        role: 'admin',
      }).lean().exec();
      if (existingAsAdmin) continue;

      try {
        await StaffModel.updateOne(
          { communityId, userId: modId },
          {
            $set: { role: 'moderator', status: 'active' },
            $setOnInsert: {
              communityId,
              userId: modId,
              createdBy: createur || modId,
            },
          },
          { upsert: true },
        );
        totalModerators++;
      } catch (err: any) {
        if (err.code === 11000) {
          totalModerators++;
        } else {
          console.error(`  ❌ Error upserting moderator ${modId} in community ${communityId}:`, err.message);
          errors++;
        }
      }
    }
  }

  console.log('\n────────────────────────────────────');
  console.log('✅ Backfill complete!');
  console.log(`   Communities processed: ${communities.length}`);
  console.log(`   Admin staff created:   ${totalAdmins}`);
  console.log(`   Moderator staff created: ${totalModerators}`);
  console.log(`   Owner entries skipped: ${skippedOwner}`);
  console.log(`   Errors:                ${errors}`);
  console.log('────────────────────────────────────\n');

  await connection.close();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

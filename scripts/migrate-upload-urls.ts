/**
 * Migration Script: Update Upload URLs to Production
 * 
 * This script migrates all localhost and local IP URLs in the database
 * to use the production URL (https://api.chabaqa.io)
 * 
 * Usage:
 *   npx ts-node scripts/migrate-upload-urls.ts
 * 
 * What it does:
 * - Scans all collections for upload URLs
 * - Transforms localhost/IP URLs to production URLs
 * - Updates documents in place
 * - Provides detailed logging
 */

import { connect, connection } from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PRODUCTION_URL = 'https://api.chabaqa.io';

// Patterns to match and replace
const LOCAL_PATTERNS = [
  /http:\/\/localhost:\d+\/uploads\//g,
  /http:\/\/127\.0\.0\.1:\d+\/uploads\//g,
  /http:\/\/192\.168\.\d+\.\d+:\d+\/uploads\//g,
  /http:\/\/10\.\d+\.\d+\.\d+:\d+\/uploads\//g,
];

interface MigrationStats {
  collection: string;
  documentsScanned: number;
  documentsUpdated: number;
  fieldsUpdated: number;
  errors: number;
}

/**
 * Transform a URL to use production server
 */
function transformUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;

  // Already using production URL
  if (url.startsWith(PRODUCTION_URL)) {
    return url;
  }

  // Transform localhost/IP URLs
  for (const pattern of LOCAL_PATTERNS) {
    if (pattern.test(url)) {
      return url.replace(pattern, `${PRODUCTION_URL}/uploads/`);
    }
  }

  // Transform relative paths
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${PRODUCTION_URL}${cleanPath}`;
  }

  return url;
}

/**
 * Recursively transform URLs in an object
 */
function transformObject(obj: any): { transformed: any; changeCount: number } {
  let changeCount = 0;

  if (typeof obj === 'string') {
    const transformed = transformUrl(obj);
    if (transformed !== obj) {
      changeCount++;
      return { transformed, changeCount };
    }
    return { transformed: obj, changeCount: 0 };
  }

  if (Array.isArray(obj)) {
    const transformedArray = obj.map(item => {
      const result = transformObject(item);
      changeCount += result.changeCount;
      return result.transformed;
    });
    return { transformed: transformedArray, changeCount };
  }

  if (obj && typeof obj === 'object') {
    const transformedObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const result = transformObject(value);
      changeCount += result.changeCount;
      transformedObj[key] = result.transformed;
    }
    return { transformed: transformedObj, changeCount };
  }

  return { transformed: obj, changeCount: 0 };
}

/**
 * Migrate a collection
 */
async function migrateCollection(
  collectionName: string,
  fieldsToCheck: string[]
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    collection: collectionName,
    documentsScanned: 0,
    documentsUpdated: 0,
    fieldsUpdated: 0,
    errors: 0,
  };

  try {
    const collection = connection.collection(collectionName);
    const documents = await collection.find({}).toArray();
    stats.documentsScanned = documents.length;

    console.log(`\n📊 Processing ${collectionName}: ${documents.length} documents`);

    for (const doc of documents) {
      try {
        let documentChanged = false;
        const updates: any = {};

        for (const field of fieldsToCheck) {
          const fieldPath = field.split('.');
          let value: any = doc;
          
          // Navigate nested fields
          for (const part of fieldPath) {
            if (value && typeof value === 'object') {
              value = value[part];
            } else {
              value = undefined;
              break;
            }
          }

          if (value) {
            const result = transformObject(value);
            if (result.changeCount > 0) {
              updates[field] = result.transformed;
              stats.fieldsUpdated += result.changeCount;
              documentChanged = true;
              console.log(`  ✓ Updated ${field} in document ${doc._id}`);
            }
          }
        }

        if (documentChanged) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stats.documentsUpdated++;
        }
      } catch (error) {
        console.error(`  ✗ Error processing document ${doc._id}:`, error.message);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`✗ Error processing collection ${collectionName}:`, error.message);
    stats.errors++;
  }

  return stats;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting Upload URL Migration');
  console.log(`📍 Target URL: ${PRODUCTION_URL}`);
  console.log('━'.repeat(60));

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not found in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Define collections and fields to migrate
    const migrations = [
      {
        collection: 'users',
        fields: ['profile_picture', 'photo_profil', 'avatar'],
      },
      {
        collection: 'communities',
        fields: [
          'logo',
          'coverImage',
          'photo_de_couverture',
          'image',
          'creatorAvatar',
          'settings.logo',
          'settings.heroBackground',
          'settings.gallery',
        ],
      },
      {
        collection: 'courses',
        fields: [
          'thumbnail',
          'image',
          'coverImage',
          'sections.chapters.thumbnail',
          'sections.chapters.videoUrl',
        ],
      },
      {
        collection: 'events',
        fields: ['image', 'coverImage', 'thumbnail', 'bannerImage'],
      },
      {
        collection: 'posts',
        fields: ['images', 'attachments', 'media'],
      },
      {
        collection: 'challenges',
        fields: ['image', 'thumbnail', 'coverImage'],
      },
      {
        collection: 'topuprequests',
        fields: ['proofUrl'],
      },
      {
        collection: 'products',
        fields: ['images', 'thumbnail', 'gallery'],
      },
    ];

    // Run migrations
    const allStats: MigrationStats[] = [];
    for (const migration of migrations) {
      const stats = await migrateCollection(migration.collection, migration.fields);
      allStats.push(stats);
    }

    // Print summary
    console.log('\n' + '━'.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('━'.repeat(60));

    let totalScanned = 0;
    let totalUpdated = 0;
    let totalFields = 0;
    let totalErrors = 0;

    for (const stats of allStats) {
      console.log(`\n${stats.collection}:`);
      console.log(`  Documents scanned: ${stats.documentsScanned}`);
      console.log(`  Documents updated: ${stats.documentsUpdated}`);
      console.log(`  Fields updated: ${stats.fieldsUpdated}`);
      console.log(`  Errors: ${stats.errors}`);

      totalScanned += stats.documentsScanned;
      totalUpdated += stats.documentsUpdated;
      totalFields += stats.fieldsUpdated;
      totalErrors += stats.errors;
    }

    console.log('\n' + '━'.repeat(60));
    console.log('TOTALS:');
    console.log(`  Documents scanned: ${totalScanned}`);
    console.log(`  Documents updated: ${totalUpdated}`);
    console.log(`  Fields updated: ${totalFields}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log('━'.repeat(60));

    if (totalErrors === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${totalErrors} errors`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n✨ Migration script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });

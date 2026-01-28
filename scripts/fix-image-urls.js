const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
const NEW_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function fixImageUrls() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found in environment variables');
    process.exit(1);
  }

  console.log(`🔧 Connecting to MongoDB...`);
  console.log(`🌐 Target BASE_URL: ${NEW_BASE_URL}`);
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();

    const urlPatterns = [
      /http:\/\/localhost:\d+\/uploads\//g,
      /https?:\/\/[^\/]+\/uploads\//g,
      /^\/uploads\//g,
      /^uploads\//g,
    ];

    const collections = [
      { name: 'cours', fields: ['thumbnail'] },
      { name: 'users', fields: ['profilePicture', 'avatar'] },
      { name: 'communities', fields: ['logo', 'banner', 'avatar'] },
      { name: 'challenges', fields: ['thumbnail', 'image'] },
      { name: 'events', fields: ['image', 'thumbnail'] },
      { name: 'products', fields: ['images', 'thumbnail'] },
      { name: 'posts', fields: ['images', 'media'] },
      { name: 'sessions', fields: ['thumbnail'] },
    ];

    let totalUpdated = 0;

    for (const collectionInfo of collections) {
      console.log(`\n📦 Processing collection: ${collectionInfo.name}`);
      const collection = db.collection(collectionInfo.name);

      const documents = await collection.find({}).toArray();
      console.log(`   Found ${documents.length} documents`);

      for (const doc of documents) {
        const updates = {};
        let needsUpdate = false;

        for (const field of collectionInfo.fields) {
          const value = doc[field];
          
          if (Array.isArray(value)) {
            const updatedArray = value.map((url) => {
              if (typeof url === 'string') {
                return fixUrl(url, urlPatterns);
              }
              return url;
            });
            
            if (JSON.stringify(value) !== JSON.stringify(updatedArray)) {
              updates[field] = updatedArray;
              needsUpdate = true;
            }
          } else if (typeof value === 'string' && value) {
            const fixedUrl = fixUrl(value, urlPatterns);
            if (fixedUrl !== value) {
              updates[field] = fixedUrl;
              needsUpdate = true;
              console.log(`   🔄 ${field}: ${value} -> ${fixedUrl}`);
            }
          }
        }

        if (needsUpdate) {
          await collection.updateOne({ _id: doc._id }, { $set: updates });
          totalUpdated++;
        }
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`📊 Total documents updated: ${totalUpdated}`);
    console.log(`🌐 New BASE_URL: ${NEW_BASE_URL}`);

  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

function fixUrl(url, patterns) {
  if (!url) return url;

  let fixedUrl = url;

  for (const pattern of patterns) {
    if (pattern.test(fixedUrl)) {
      fixedUrl = fixedUrl.replace(pattern, `${NEW_BASE_URL}/uploads/`);
      break;
    }
  }

  if (!fixedUrl.startsWith('http') && fixedUrl.includes('uploads/')) {
    const uploadsIndex = fixedUrl.indexOf('uploads/');
    fixedUrl = `${NEW_BASE_URL}/${fixedUrl.substring(uploadsIndex)}`;
  }

  return fixedUrl;
}

fixImageUrls()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

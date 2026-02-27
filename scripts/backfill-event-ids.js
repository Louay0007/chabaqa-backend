const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGO_DB_NAME || process.env.DB_NAME || undefined;
const COLLECTION = 'events';

if (!MONGO_URI) {
  console.error('Missing MONGO_URI (or MONGODB_URI).');
  process.exit(1);
}

function isMissingIdFilter() {
  return {
    $or: [
      { id: { $exists: false } },
      { id: null },
      { id: '' },
    ],
  };
}

async function ensureUniqueIdIndex(collection) {
  const indexes = await collection.indexes();
  const idIndex = indexes.find((idx) => idx && idx.key && idx.key.id === 1);

  if (!idIndex) {
    await collection.createIndex({ id: 1 }, { unique: true, name: 'id_1' });
    return { created: true, rebuilt: false };
  }

  if (idIndex.unique) {
    return { created: false, rebuilt: false };
  }

  await collection.dropIndex(idIndex.name);
  await collection.createIndex({ id: 1 }, { unique: true, name: 'id_1' });
  return { created: false, rebuilt: true };
}

async function main() {
  const client = new MongoClient(MONGO_URI, { ignoreUndefined: true });
  await client.connect();

  try {
    const db = DB_NAME ? client.db(DB_NAME) : client.db();
    const collection = db.collection(COLLECTION);

    const missingCount = await collection.countDocuments(isMissingIdFilter());
    console.log(`[events] Missing id docs: ${missingCount}`);

    let updated = 0;
    let skippedConflicts = 0;

    if (missingCount > 0) {
      const cursor = collection.find(isMissingIdFilter(), { projection: { _id: 1 } });

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (!doc || !doc._id) continue;

        const generatedId = String(doc._id);
        const conflict = await collection.findOne(
          {
            id: generatedId,
            _id: { $ne: doc._id },
          },
          { projection: { _id: 1 } },
        );

        if (conflict) {
          skippedConflicts += 1;
          continue;
        }

        const result = await collection.updateOne(
          { _id: doc._id, ...isMissingIdFilter() },
          { $set: { id: generatedId } },
        );
        updated += result.modifiedCount || 0;
      }
    }

    const indexResult = await ensureUniqueIdIndex(collection);
    const remainingMissing = await collection.countDocuments(isMissingIdFilter());

    console.log(`[events] Backfilled ids: ${updated}`);
    console.log(`[events] Skipped conflicts: ${skippedConflicts}`);
    console.log(`[events] Remaining missing ids: ${remainingMissing}`);
    console.log(
      `[events] id_1 index status: ${
        indexResult.created
          ? 'created unique'
          : indexResult.rebuilt
            ? 'rebuilt as unique'
            : 'already unique'
      }`,
    );
  } finally {
    await client.close();
  }
}

main()
  .then(() => {
    console.log('Event ID backfill completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Event ID backfill failed:', error);
    process.exit(1);
  });

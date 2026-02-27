const { MongoClient } = require('mongodb');

const uri =
  process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URL;

if (!uri) {
  console.error('Missing MongoDB URI (MONGO_URI / MONGODB_URI / DATABASE_URL / MONGO_URL)');
  process.exit(1);
}

const desiredPartialFilter = { inviteCode: { $type: 'string', $ne: '' } };

async function run() {
  const client = new MongoClient(uri, { ignoreUndefined: true });

  try {
    await client.connect();
    const db = client.db();
    const communities = db.collection('communities');

    const cleanup = await communities.updateMany(
      { inviteCode: null },
      { $unset: { inviteCode: '', inviteLink: '' } },
    );
    console.log(
      `Unset inviteCode/inviteLink on ${cleanup.modifiedCount} community docs that had inviteCode=null`,
    );

    const indexes = await communities.indexes();
    const inviteIndex = indexes.find(
      (index) =>
        index &&
        index.key &&
        Object.keys(index.key).length === 1 &&
        index.key.inviteCode === 1,
    );

    const partial = inviteIndex?.partialFilterExpression?.inviteCode || {};
    const hasDesiredIndex =
      Boolean(inviteIndex) &&
      inviteIndex.unique === true &&
      partial.$type === 'string' &&
      partial.$ne === '';

    if (inviteIndex && !hasDesiredIndex) {
      await communities.dropIndex(inviteIndex.name);
      console.log(`Dropped legacy invite index: ${inviteIndex.name}`);
    }

    if (!hasDesiredIndex) {
      await communities.createIndex(
        { inviteCode: 1 },
        {
          name: 'inviteCode_1',
          unique: true,
          partialFilterExpression: desiredPartialFilter,
        },
      );
      console.log('Created inviteCode_1 partial unique index');
    } else {
      console.log('inviteCode_1 index already matches desired partial unique definition');
    }

    const postIndexes = await communities.indexes();
    const appliedIndex = postIndexes.find((index) => index.name === 'inviteCode_1');
    console.log('inviteCode_1 definition:', JSON.stringify(appliedIndex, null, 2));
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Failed to repair community invite index:', error);
  process.exit(1);
});

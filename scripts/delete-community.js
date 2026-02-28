const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local-db'), override: true, quiet: true });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'mongo', 'chabaqa-local-mongo']);

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveDbName(mongoUri) {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  try {
    const url = new URL(mongoUri);
    const pathName = (url.pathname || '').replace(/^\/+/, '');
    if (!pathName) return 'chabaqa_local';
    return pathName.split('/')[0];
  } catch (error) {
    return 'chabaqa_local';
  }
}

function resolveHost(mongoUri) {
  try {
    return new URL(mongoUri).hostname || '<unknown>';
  } catch (error) {
    return '<unknown>';
  }
}

function pickTarget(args) {
  const positional = args.find((arg) => !arg.startsWith('--'));
  return positional ? String(positional).trim() : '';
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const args = process.argv.slice(2);
  const target = pickTarget(args);
  const dryRun = !args.includes('--execute');
  const allowRemoteWipe = parseBool(process.env.ALLOW_REMOTE_WIPE, false);

  if (!mongoUri) {
    throw new Error('Missing MONGO_URI env var');
  }

  if (!target) {
    throw new Error('Usage: node scripts/delete-community.js <slug-or-id> [--execute]');
  }

  const host = resolveHost(mongoUri);
  const dbName = resolveDbName(mongoUri);
  const isLocalHost = LOCAL_HOSTS.has(String(host).toLowerCase());

  if (!isLocalHost && !allowRemoteWipe) {
    throw new Error(
      `Refusing delete for non-local host "${host}". Set ALLOW_REMOTE_WIPE=true only if this is intentional.`,
    );
  }

  console.log(`[INFO] Target host: ${host}`);
  console.log(`[INFO] Target database: ${dbName}`);
  console.log(`[INFO] Target community: ${target}`);
  console.log(`[INFO] DRY_RUN=${dryRun ? 'true' : 'false'}`);

  const client = new MongoClient(mongoUri, { ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(dbName);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = new Set(collections.map((entry) => entry.name));
    const has = (name) => names.has(name);

    const communities = db.collection('communities');
    const targetLower = target.toLowerCase();
    const community = await communities.findOne(
      ObjectId.isValid(target)
        ? { $or: [{ _id: new ObjectId(target) }, { slug: targetLower }] }
        : { slug: targetLower },
      { projection: { _id: 1, slug: 1, name: 1 } },
    );

    if (!community) {
      console.log('[INFO] No matching community found. Nothing to delete.');
      return;
    }

    const communityId = String(community._id);
    const communitySlug = String(community.slug || '').trim();
    const communityStringRefs = Array.from(new Set([communityId, communitySlug].filter(Boolean)));
    const communityAnyRefs = [community._id, ...communityStringRefs];

    const findDocs = async (collectionName) => {
      if (!has(collectionName)) return [];
      return db
        .collection(collectionName)
        .find({ communityId: { $in: communityAnyRefs } }, { projection: { _id: 1, id: 1 } })
        .toArray();
    };

    const [courses, challenges, products, sessions, posts, events, resources, conversations] =
      await Promise.all([
        findDocs('cours'),
        findDocs('challenges'),
        findDocs('products'),
        findDocs('sessions'),
        findDocs('posts'),
        findDocs('events'),
        findDocs('resources'),
        findDocs('conversations'),
      ]);

    const toObjectIds = (docs) => docs.map((doc) => doc && doc._id).filter(Boolean);
    const toStringIds = (docs) =>
      docs.map((doc) => String((doc && (doc.id || doc._id)) || '').trim()).filter(Boolean);

    const courseObjectIds = toObjectIds(courses);
    const challengeObjectIds = toObjectIds(challenges);
    const productObjectIds = toObjectIds(products);
    const sessionObjectIds = toObjectIds(sessions);
    const postObjectIds = toObjectIds(posts);
    const eventObjectIds = toObjectIds(events);
    const resourceObjectIds = toObjectIds(resources);
    const conversationObjectIds = toObjectIds(conversations);

    const courseStringIds = toStringIds(courses);
    const challengeStringIds = toStringIds(challenges);
    const productStringIds = toStringIds(products);
    const sessionStringIds = toStringIds(sessions);
    const postStringIds = toStringIds(posts);
    const eventStringIds = toStringIds(events);
    const resourceStringIds = toStringIds(resources);

    const contentStringIds = Array.from(
      new Set([
        ...courseStringIds,
        ...challengeStringIds,
        ...productStringIds,
        ...sessionStringIds,
        ...postStringIds,
        ...eventStringIds,
        ...resourceStringIds,
        ...communityStringRefs,
      ]),
    );

    const deleteOps = [
      ['community_page_contents', { community: { $in: communityAnyRefs } }],
      ['posts', { communityId: { $in: communityAnyRefs } }],
      ['cours', { communityId: { $in: communityAnyRefs } }],
      ['challenges', { communityId: { $in: communityAnyRefs } }],
      ['products', { communityId: { $in: communityAnyRefs } }],
      ['sessions', { communityId: { $in: communityAnyRefs } }],
      ['events', { communityId: { $in: communityAnyRefs } }],
      ['resources', { communityId: { $in: communityAnyRefs } }],
      ['emailcampaigns', { communityId: { $in: communityAnyRefs } }],
      ['userloginactivities', { communityId: { $in: communityAnyRefs } }],
      ['userachievements', { communityId: { $in: communityAnyRefs } }],
      ['achievements', { communityId: { $in: communityAnyRefs } }],
      ['analyticsdailies', { communityId: { $in: communityAnyRefs } }],
      ['promocodes', { communityId: { $in: communityAnyRefs } }],
      ['orders', { communityId: { $in: communityAnyRefs } }],
      ['payouts', { communityId: { $in: communityAnyRefs } }],
      ['conversations', { communityId: { $in: communityAnyRefs } }],
    ];

    if (courseObjectIds.length > 0 || courseStringIds.length > 0) {
      deleteOps.push([
        'courseenrollments',
        { courseId: { $in: [...courseObjectIds, ...courseStringIds] } },
      ]);
    }

    if (challengeObjectIds.length > 0 || challengeStringIds.length > 0) {
      deleteOps.push([
        'challengesubmissions',
        { challengeId: { $in: [...challengeObjectIds, ...challengeStringIds] } },
      ]);
    }

    if (conversationObjectIds.length > 0) {
      deleteOps.push(['messages', { conversationId: { $in: conversationObjectIds } }]);
    }

    deleteOps.push([
      'feedbacks',
      {
        $or: [
          { relatedModel: 'Community', relatedTo: { $in: [...communityAnyRefs, ...communityStringRefs] } },
          { relatedModel: 'Cours', relatedTo: { $in: [...courseObjectIds, ...courseStringIds] } },
          { relatedModel: 'Challenge', relatedTo: { $in: [...challengeObjectIds, ...challengeStringIds] } },
          { relatedModel: 'Product', relatedTo: { $in: [...productObjectIds, ...productStringIds] } },
          { relatedModel: 'Session', relatedTo: { $in: [...sessionObjectIds, ...sessionStringIds] } },
          { relatedModel: 'Event', relatedTo: { $in: [...eventObjectIds, ...eventStringIds] } },
        ],
      },
    ]);

    const trackingFilter = {
      $or: [
        { contentType: { $in: ['community', 'COMMUNITY'] }, contentId: { $in: communityStringRefs } },
        { contentId: { $in: contentStringIds } },
      ],
    };
    deleteOps.push(['contentprogresses', trackingFilter]);
    deleteOps.push(['trackingactions', trackingFilter]);

    const usersPullFilter = {
      $or: [
        { createdCommunities: { $in: communityAnyRefs } },
        { joinedCommunities: { $in: communityAnyRefs } },
        { adminCommunities: { $in: communityAnyRefs } },
        { moderatorCommunities: { $in: communityAnyRefs } },
      ],
    };
    const usersPullUpdate = {
      $pull: {
        createdCommunities: { $in: communityAnyRefs },
        joinedCommunities: { $in: communityAnyRefs },
        adminCommunities: { $in: communityAnyRefs },
        moderatorCommunities: { $in: communityAnyRefs },
      },
    };

    console.log(
      `[INFO] Matched community: ${community.name || '<no-name>'} (${communityId}) slug="${communitySlug}"`,
    );

    const summary = [];

    for (const [collectionName, filter] of deleteOps) {
      if (!has(collectionName)) continue;

      if (dryRun) {
        const count = await db.collection(collectionName).countDocuments(filter);
        if (count > 0) summary.push([collectionName, count]);
        continue;
      }

      const result = await db.collection(collectionName).deleteMany(filter);
      if (result.deletedCount > 0) summary.push([collectionName, result.deletedCount]);
    }

    if (has('users')) {
      if (dryRun) {
        const count = await db.collection('users').countDocuments(usersPullFilter);
        if (count > 0) summary.push(['users(updateMany)', count]);
      } else {
        const result = await db.collection('users').updateMany(usersPullFilter, usersPullUpdate);
        if (result.modifiedCount > 0) summary.push(['users(updateMany)', result.modifiedCount]);
      }
    }

    if (dryRun) {
      const communityCount = await communities.countDocuments({ _id: community._id });
      summary.push(['communities(deleteOne)', communityCount]);
      console.log('[DRY_RUN=true] Planned operations:');
      for (const [name, count] of summary) {
        console.log(`  - ${name}: ${count}`);
      }
      return;
    }

    const communityDeleteResult = await communities.deleteOne({ _id: community._id });
    summary.push(['communities(deleteOne)', communityDeleteResult.deletedCount]);

    console.log('[DONE] Deletion summary:');
    for (const [name, count] of summary) {
      console.log(`  - ${name}: ${count}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[ERROR]', error);
  process.exit(1);
});

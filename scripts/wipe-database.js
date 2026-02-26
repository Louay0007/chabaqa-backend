const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local-db'), override: true, quiet: true });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'mongo']);

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseDryRun(args) {
  if (args.includes('--execute')) return false;
  if (args.includes('--dry-run=true')) return true;
  if (args.includes('--dry-run=false')) return false;
  return parseBool(process.env.DRY_RUN, true);
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

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const args = process.argv.slice(2);
  const dryRun = parseDryRun(args);
  const allowRemoteWipe = parseBool(process.env.ALLOW_REMOTE_WIPE, false);

  if (!mongoUri) {
    throw new Error('Missing MONGO_URI env var');
  }

  const host = resolveHost(mongoUri);
  const dbName = resolveDbName(mongoUri);
  const isLocalHost = LOCAL_HOSTS.has(String(host).toLowerCase());

  if (!isLocalHost && !allowRemoteWipe) {
    throw new Error(
      `Refusing wipe for non-local host "${host}". Set ALLOW_REMOTE_WIPE=true only if you explicitly intend to wipe a remote database.`,
    );
  }

  console.log(`[INFO] Target host: ${host}`);
  console.log(`[INFO] Target database: ${dbName}`);
  console.log(`[INFO] DRY_RUN=${dryRun ? 'true' : 'false'}`);

  const client = new MongoClient(mongoUri, { ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(dbName);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = collections.map((c) => c.name);

    console.log(`[INFO] Connected to DB: ${dbName}`);
    console.log(`[INFO] Collections: ${collectionNames.join(', ') || '<none>'}`);

    if (dryRun) {
      console.log('[DRY_RUN=true] No deletions executed.');
      return;
    }

    for (const name of collectionNames) {
      const res = await db.collection(name).deleteMany({});
      console.log(`[OK] Cleared ${name}: ${res.deletedCount}`);
    }

    console.log('[DONE] Database wipe complete.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});

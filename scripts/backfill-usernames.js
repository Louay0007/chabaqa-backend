#!/usr/bin/env node

const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local-db'), override: true, quiet: true });

const USERNAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchArg = args.find((arg) => arg.startsWith('--batch-size='));
  const parsedBatch = Number.parseInt((batchArg || '').split('=')[1] || '', 10);
  const batchSize = Number.isFinite(parsedBatch) && parsedBatch > 0 ? parsedBatch : 200;
  return { dryRun, batchSize };
}

function resolveDbName(uri) {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  try {
    const url = new URL(uri);
    const pathName = (url.pathname || '').replace(/^\/+/, '');
    if (!pathName) return 'chabaqa_local';
    return pathName.split('/')[0];
  } catch {
    return 'chabaqa_local';
  }
}

function slugifyFullNameToUsername(name) {
  const normalized = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  return normalized || 'user';
}

function isValidUsername(value) {
  return USERNAME_REGEX.test(String(value || ''));
}

async function main() {
  const { dryRun, batchSize } = parseArgs();
  const mongoUri = process.env.MONGO_URI;
  const userCollectionName = process.env.USER_COLLECTION || 'users';

  if (!mongoUri) {
    throw new Error('Missing MONGO_URI env var');
  }

  const dbName = resolveDbName(mongoUri);
  const client = new MongoClient(mongoUri, { ignoreUndefined: true });

  const stats = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    collisionResolved: 0,
    batchesWritten: 0,
  };

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection(userCollectionName);

    console.log(`[INFO] Connected to DB: ${dbName}`);
    console.log(`[INFO] Users collection: ${userCollectionName}`);
    console.log(`[INFO] Dry run: ${dryRun ? 'true' : 'false'}`);
    console.log(`[INFO] Batch size: ${batchSize}`);

    const reservedUsernames = new Set();
    const pendingOps = [];

    const cursor = users
      .find({}, { projection: { _id: 1, name: 1, username: 1, createdAt: 1 } })
      .sort({ createdAt: 1, _id: 1 });

    const flush = async () => {
      if (pendingOps.length === 0) return;
      if (dryRun) {
        pendingOps.length = 0;
        return;
      }

      const ops = pendingOps.splice(0, pendingOps.length);
      const result = await users.bulkWrite(ops, { ordered: false });
      stats.batchesWritten += 1;
      console.log(
        `[BATCH] matched=${result.matchedCount || 0} modified=${result.modifiedCount || 0}`,
      );
    };

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      if (!user) break;

      stats.scanned += 1;

      const rawUsername = String(user.username || '').trim();
      const usernameValid = isValidUsername(rawUsername);

      if (usernameValid && !reservedUsernames.has(rawUsername)) {
        reservedUsernames.add(rawUsername);
        stats.skipped += 1;
        continue;
      }

      const base = slugifyFullNameToUsername(user.name || rawUsername || 'user');
      let candidate = base;
      let suffix = 2;
      let hadCollision = false;

      while (reservedUsernames.has(candidate)) {
        hadCollision = true;
        candidate = `${base}-${suffix}`;
        suffix += 1;
      }

      if (hadCollision) {
        stats.collisionResolved += 1;
      }

      reservedUsernames.add(candidate);

      pendingOps.push({
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { username: candidate } },
        },
      });

      stats.updated += 1;

      if (pendingOps.length >= batchSize) {
        await flush();
      }
    }

    await flush();

    console.log('[DONE] Username backfill completed.');
    console.log(
      `[SUMMARY] scanned=${stats.scanned} updated=${stats.updated} skipped=${stats.skipped} collisionResolved=${stats.collisionResolved} batchesWritten=${stats.batchesWritten}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[ERROR] Username backfill failed:', error);
  process.exit(1);
});

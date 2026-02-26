#!/usr/bin/env node

const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local-db'), override: true, quiet: true });

function parseSampleLimit(value) {
  const parsed = Number.parseInt(String(value ?? '5'), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return parsed;
}

function resolveDbName(uri) {
  if (process.env.DB_NAME) return process.env.DB_NAME;

  try {
    const url = new URL(uri);
    const pathName = (url.pathname || '').replace(/^\/+/, '');
    if (!pathName) return 'chabaqa_local';
    return pathName.split('/')[0];
  } catch (error) {
    return 'chabaqa_local';
  }
}

function resolveHost(uri) {
  try {
    return new URL(uri).hostname || '<unknown>';
  } catch (error) {
    return '<unknown>';
  }
}

function sanitize(value, depth = 0) {
  if (value == null) return value;
  if (depth > 5) return '[MaxDepth]';

  if (typeof value === 'string') {
    return value.length > 280 ? `${value.slice(0, 280)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => sanitize(item, depth + 1));
    if (value.length > 20) {
      items.push(`[... ${value.length - 20} more item(s)]`);
    }
    return items;
  }

  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' && typeof value.toHexString === 'function') {
      return value.toHexString();
    }

    if (value._bsontype === 'Binary' && Buffer.isBuffer(value.buffer)) {
      return `[Binary ${value.buffer.length} bytes]`;
    }

    const output = {};
    const entries = Object.entries(value).slice(0, 50);
    for (const [key, nested] of entries) {
      output[key] = sanitize(nested, depth + 1);
    }
    const totalKeys = Object.keys(value).length;
    if (totalKeys > entries.length) {
      output.__truncatedKeys = totalKeys - entries.length;
    }
    return output;
  }

  return String(value);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing MONGO_URI env var');
  }

  const sampleLimit = parseSampleLimit(process.env.SAMPLE_LIMIT);
  const dbName = resolveDbName(mongoUri);
  const host = resolveHost(mongoUri);

  console.log(`[INFO] Target host: ${host}`);
  console.log(`[INFO] Target database: ${dbName}`);
  console.log(`[INFO] Sample limit: ${sampleLimit}`);

  const client = new MongoClient(mongoUri, { ignoreUndefined: true });

  try {
    await client.connect();
    const db = client.db(dbName);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    if (!collections.length) {
      console.log('[INFO] No collections found.');
      return;
    }

    console.log(`\n[INFO] Collections (${collections.length}):`);
    for (const { name } of collections) {
      const count = await db.collection(name).countDocuments();
      console.log(`\n=== ${name} ===`);
      console.log(`count: ${count}`);

      if (count === 0) {
        console.log('sample: <empty>');
        continue;
      }

      const sampleDocs = await db.collection(name).find({}).limit(sampleLimit).toArray();
      console.log('sample:');
      for (const doc of sampleDocs) {
        console.log(JSON.stringify(sanitize(doc), null, 2));
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('[ERROR]', error);
  process.exit(1);
});

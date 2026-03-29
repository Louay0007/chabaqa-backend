#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const UPLOAD_PATH = process.env.UPLOAD_PATH || 'uploads';
const MEDIA_PUBLIC_BASE_URL = (process.env.MEDIA_PUBLIC_BASE_URL || process.env.SERVER_URL || 'https://api.chabaqa.io').replace(/\/+$/, '');
const uploadsRoot = path.resolve(process.cwd(), UPLOAD_PATH);

function walkFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function detectType(storageKey) {
  const lower = storageKey.toLowerCase();
  if (lower.startsWith('video/') || /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/.test(lower)) return 'video';
  if (lower.startsWith('audio/') || /\.(mp3|wav|ogg|aac|flac)$/.test(lower)) return 'audio';
  if (lower.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(lower)) return 'image';
  return 'document';
}

function detectMime(storageKey) {
  const ext = path.extname(storageKey).toLowerCase();
  const mime = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
  };
  return mime[ext] || 'application/octet-stream';
}

function checksumSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main() {
  if (!MONGO_URI) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }

  if (!fs.existsSync(uploadsRoot)) {
    console.error(`Uploads root not found: ${uploadsRoot}`);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  const col = db.collection('mediaassets');

  const files = walkFiles(uploadsRoot);
  let created = 0;
  let skipped = 0;

  for (const filePath of files) {
    const rel = path.relative(uploadsRoot, filePath).split(path.sep).join('/');
    const exists = await col.findOne({ storageKey: rel }, { projection: { _id: 1 } });
    if (exists) {
      skipped += 1;
      continue;
    }

    const stat = fs.statSync(filePath);
    const checksum = await checksumSha256(filePath).catch(() => undefined);
    const filename = path.basename(filePath);
    const mediaType = detectType(rel);
    const mimeType = detectMime(rel);
    const url = `${MEDIA_PUBLIC_BASE_URL}/uploads/${rel}`;

    await col.insertOne({
      mediaType,
      purpose: 'generic',
      visibility: 'public',
      status: 'uploaded',
      filename,
      originalName: filename,
      storageKey: rel,
      url,
      mimeType,
      size: stat.size,
      checksum,
      metadata: { source: 'backfill-script' },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    created += 1;
  }

  console.log(`Backfill complete. Created=${created}, Skipped(existing)=${skipped}, TotalFiles=${files.length}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Backfill failed:', error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});


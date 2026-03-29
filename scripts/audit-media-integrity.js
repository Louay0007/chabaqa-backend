#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const UPLOAD_PATH = process.env.UPLOAD_PATH || 'uploads';
const UPLOADS_ROOT = path.resolve(process.cwd(), UPLOAD_PATH);
const REPORT_DIR = path.resolve(process.cwd(), 'scripts/reports');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function urlToStorageKey(value) {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith('/uploads/')) return raw.replace(/^\/uploads\//, '');
  if (raw.startsWith('uploads/')) return raw.replace(/^uploads\//, '');

  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/uploads\/(.+)/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function hasPhysicalFile(storageKey) {
  if (!storageKey) return false;
  return fs.existsSync(path.join(UPLOADS_ROOT, storageKey));
}

function addMissing(result, source, docId, fieldPath, url) {
  const storageKey = urlToStorageKey(url);
  if (!storageKey) return;
  if (hasPhysicalFile(storageKey)) return;
  result.missing.push({
    source,
    docId: String(docId),
    fieldPath,
    url,
    storageKey,
  });
}

async function auditCourses(db, result) {
  const col = db.collection('cours');
  const docs = await col.find({}, { projection: { sections: 1 } }).toArray();
  for (const doc of docs) {
    const sections = Array.isArray(doc.sections) ? doc.sections : [];
    sections.forEach((section, sIdx) => {
      const chapitres = Array.isArray(section?.chapitres) ? section.chapitres : [];
      chapitres.forEach((chap, cIdx) => {
        addMissing(result, 'cours', doc._id, `sections.${sIdx}.chapitres.${cIdx}.videoUrl`, chap?.videoUrl);
        const ressources = Array.isArray(chap?.ressources) ? chap.ressources : [];
        ressources.forEach((res, rIdx) => {
          addMissing(result, 'cours', doc._id, `sections.${sIdx}.chapitres.${cIdx}.ressources.${rIdx}.url`, res?.url);
        });
      });
    });
  }
  result.scanned.cours = docs.length;
}

async function auditChallenges(db, result) {
  const col = db.collection('challenges');
  const docs = await col.find({}, { projection: { resources: 1, tasks: 1 } }).toArray();
  for (const doc of docs) {
    const resources = Array.isArray(doc.resources) ? doc.resources : [];
    resources.forEach((res, idx) => {
      addMissing(result, 'challenges', doc._id, `resources.${idx}.url`, res?.url);
    });
    const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
    tasks.forEach((task, tIdx) => {
      const taskResources = Array.isArray(task?.resources) ? task.resources : [];
      taskResources.forEach((res, rIdx) => {
        addMissing(result, 'challenges', doc._id, `tasks.${tIdx}.resources.${rIdx}.url`, res?.url);
      });
    });
  }
  result.scanned.challenges = docs.length;
}

async function auditOrders(db, result) {
  const col = db.collection('orders');
  const docs = await col.find({}, { projection: { paymentProof: 1 } }).toArray();
  for (const doc of docs) {
    addMissing(result, 'orders', doc._id, 'paymentProof', doc.paymentProof);
  }
  result.scanned.orders = docs.length;
}

async function auditMessages(db, result) {
  const col = db.collection('messages');
  const docs = await col.find({}, { projection: { attachments: 1 } }).toArray();
  for (const doc of docs) {
    const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
    attachments.forEach((att, idx) => {
      addMissing(result, 'messages', doc._id, `attachments.${idx}.url`, att?.url);
    });
  }
  result.scanned.messages = docs.length;
}

async function auditTopupRequests(db, result) {
  const col = db.collection('topuprequests');
  const docs = await col.find({}, { projection: { paymentProof: 1 } }).toArray();
  for (const doc of docs) {
    addMissing(result, 'topuprequests', doc._id, 'paymentProof', doc.paymentProof);
  }
  result.scanned.topuprequests = docs.length;
}

async function main() {
  if (!MONGO_URI) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }

  ensureDir(REPORT_DIR);

  const startedAt = new Date();
  const result = {
    startedAt: startedAt.toISOString(),
    uploadsRoot: UPLOADS_ROOT,
    scanned: {},
    missing: [],
  };

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;

  await auditCourses(db, result);
  await auditChallenges(db, result);
  await auditOrders(db, result);
  await auditMessages(db, result);
  await auditTopupRequests(db, result);

  const endedAt = new Date();
  result.endedAt = endedAt.toISOString();
  result.durationMs = endedAt.getTime() - startedAt.getTime();
  result.summary = {
    scannedCollections: Object.keys(result.scanned).length,
    scannedDocuments: Object.values(result.scanned).reduce((acc, n) => acc + Number(n || 0), 0),
    missingReferences: result.missing.length,
  };

  const reportPath = path.join(REPORT_DIR, `media-integrity-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');

  console.log('Media integrity audit complete');
  console.log(`Report: ${reportPath}`);
  console.log(`Scanned docs: ${result.summary.scannedDocuments}`);
  console.log(`Missing refs: ${result.summary.missingReferences}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Media integrity audit failed:', error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});


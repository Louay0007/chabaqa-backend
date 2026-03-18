#!/usr/bin/env node
/**
 * backfill-video-storage-keys.js
 * 
 * Scans all courses and identifies chapters with local video URLs.
 * Logs the storage keys that would be needed for HLS conversion.
 * Optionally triggers HLS conversion for each discovered video.
 * 
 * This is a READ-ONLY audit script — the backend's transformerEnReponse()
 * dynamically computes videoStorageKey + hasProtectedVideo at runtime,
 * so no schema migration is needed. This script helps you:
 *   1. Audit which chapters have local videos vs YouTube/Vimeo
 *   2. Identify missing video files on disk
 *   3. Trigger batch HLS conversion
 * 
 * Usage:
 *   node scripts/backfill-video-storage-keys.js [--convert] [--dry-run]
 * 
 * Environment:
 *   MONGO_URI   - MongoDB connection string (required)
 *   UPLOAD_PATH - Relative uploads directory (default: "uploads")
 */

const { existsSync } = require('fs');
const { join, resolve } = require('path');
const { execSync } = require('child_process');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const UPLOAD_PATH = process.env.UPLOAD_PATH || 'uploads';
const uploadsRoot = resolve(process.cwd(), UPLOAD_PATH);

if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable is required');
  process.exit(1);
}

// ─── videoUrl → storageKey extraction (mirrors cours.service.ts) ─────────
function extractVideoStorageKey(videoUrl) {
  if (!videoUrl) return null;
  // Direct storage key format: "video/1234-uuid.mp4"
  if (/^video\//.test(videoUrl)) return videoUrl;
  // Relative path: "/uploads/video/1234-uuid.mp4"
  const relMatch = videoUrl.match(/\/?uploads\/(video\/[^\s?#]+)/i);
  if (relMatch) return relMatch[1];
  // Absolute URL: "https://api.chabaqa.io/uploads/video/1234-uuid.mp4"
  try {
    const url = new URL(videoUrl);
    const pathMatch = url.pathname.match(/\/?uploads\/(video\/[^\s?#]+)/i);
    if (pathMatch) return pathMatch[1];
  } catch { /* not a valid URL */ }
  return null;
}

function isExternalVideo(videoUrl) {
  if (!videoUrl) return false;
  return /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com/i.test(videoUrl);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const doConvert = args.includes('--convert');
  const dryRun = args.includes('--dry-run');

  console.log('📊 Chabaqa Video Storage Key Audit');
  console.log(`   MongoDB: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  console.log(`   Uploads: ${uploadsRoot}`);
  if (doConvert) console.log('   Mode: AUDIT + HLS CONVERSION');
  if (dryRun) console.log('   Mode: DRY RUN');
  console.log('');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const coursCollection = db.collection('cours');

  const courses = await coursCollection.find({}).toArray();
  console.log(`Found ${courses.length} courses\n`);

  const stats = {
    totalChapters: 0,
    localVideos: 0,
    externalVideos: 0,
    noVideo: 0,
    missingFiles: 0,
    storageKeys: [],
    missingList: [],
  };

  for (const course of courses) {
    const sections = course.sections || [];
    let courseHasVideo = false;

    for (const section of sections) {
      const chapitres = section.chapitres || [];

      for (const chapitre of chapitres) {
        stats.totalChapters++;
        const videoUrl = chapitre.videoUrl;

        if (!videoUrl) {
          stats.noVideo++;
          continue;
        }

        if (isExternalVideo(videoUrl)) {
          stats.externalVideos++;
          continue;
        }

        const storageKey = extractVideoStorageKey(videoUrl);
        if (!storageKey) {
          console.log(`  ⚠️  Cannot parse videoUrl: "${videoUrl}" (course: ${course.id}, chapter: ${chapitre.id})`);
          continue;
        }

        stats.localVideos++;
        courseHasVideo = true;

        const filePath = join(uploadsRoot, storageKey);
        const fileExists = existsSync(filePath);

        if (!fileExists) {
          stats.missingFiles++;
          stats.missingList.push({ courseId: course.id, chapterId: chapitre.id, storageKey });
          console.log(`  ❌ Missing: ${storageKey} (course: ${course.id}, chapter: ${chapitre.titre})`);
        } else {
          stats.storageKeys.push({ courseId: course.id, chapterId: chapitre.id, storageKey, filePath });
        }
      }
    }

    if (courseHasVideo) {
      console.log(`  📹 Course "${course.titre}" (${course.id}): has local video chapters`);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('📊 AUDIT SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`Total chapters:    ${stats.totalChapters}`);
  console.log(`Local videos:      ${stats.localVideos}`);
  console.log(`External videos:   ${stats.externalVideos}`);
  console.log(`No video:          ${stats.noVideo}`);
  console.log(`Missing files:     ${stats.missingFiles}`);
  console.log('');

  if (stats.missingList.length > 0) {
    console.log('⚠️  Missing video files:');
    for (const m of stats.missingList) {
      console.log(`   - ${m.storageKey} (course: ${m.courseId}, chapter: ${m.chapterId})`);
    }
    console.log('');
  }

  // ─── Trigger HLS conversion ─────────────────────────────────────────────
  if (doConvert && stats.storageKeys.length > 0) {
    console.log(`\n🔄 Converting ${stats.storageKeys.length} videos to HLS...\n`);

    const convertScript = join(process.cwd(), 'scripts', 'convert-to-hls.js');
    if (!existsSync(convertScript)) {
      console.error('❌ convert-to-hls.js not found. Run from chabaqa-backend/ root.');
      await mongoose.disconnect();
      process.exit(1);
    }

    let converted = 0, errors = 0;
    for (const entry of stats.storageKeys) {
      const fullPath = entry.filePath;
      console.log(`  [${converted + errors + 1}/${stats.storageKeys.length}] ${entry.storageKey}`);

      if (dryRun) {
        console.log('    (dry-run — skipped)');
        converted++;
        continue;
      }

      try {
        const output = execSync(`node "${convertScript}" --input "${fullPath}"`, {
          stdio: 'pipe',
          timeout: 600000,
          cwd: process.cwd(),
        });
        console.log(output.toString().trim().split('\n').map(l => `    ${l}`).join('\n'));
        converted++;
      } catch (error) {
        console.error(`    ❌ Failed: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n📊 Conversion: ${converted} ok, ${errors} errors`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

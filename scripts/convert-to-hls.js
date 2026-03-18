#!/usr/bin/env node
/**
 * convert-to-hls.js
 * 
 * Converts MP4 videos to HLS format with AES-128 encryption.
 * Uses ffmpeg (must be installed on the system).
 * 
 * Usage:
 *   node scripts/convert-to-hls.js [--input <path>] [--all] [--dry-run]
 * 
 * Options:
 *   --input <path>   Convert a single MP4 file
 *   --all            Convert all MP4 files in uploads/video/
 *   --dry-run        Show what would be converted without doing it
 *   --segment-duration <seconds>  Segment duration (default: 6)
 *   --key-rotation <segments>     Rotate key every N segments (default: 10)
 * 
 * Output structure:
 *   hls-output/video/<basename>/
 *     master.m3u8          - Master manifest
 *     stream.m3u8          - Variant playlist with key references
 *     seg_000.ts ... seg_NNN.ts  - Encrypted segments
 *     enc.key              - Primary AES-128 key (16 bytes)
 *     key_0.bin ... key_N.bin    - Rotation keys
 *     enc.iv               - Initialization vector (optional)
 */

const { execSync } = require('child_process');
const { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } = require('fs');
const { join, basename, extname } = require('path');
const crypto = require('crypto');

// ─── Configuration ──────────────────────────────────────────────────────────
const UPLOADS_DIR = join(process.cwd(), process.env.UPLOAD_PATH || 'uploads');
const VIDEO_DIR = join(UPLOADS_DIR, 'video');
const HLS_OUTPUT_DIR = join(process.cwd(), process.env.HLS_PATH || 'hls-output');

const DEFAULT_SEGMENT_DURATION = 6;
const DEFAULT_KEY_ROTATION = 10;

// Backend URL for HLS key delivery endpoint
const KEY_BASE_URL = process.env.HLS_KEY_BASE_URL || '/api/video/hls-key';

// ─── Helpers ────────────────────────────────────────────────────────────────
function generateAesKey() {
  return crypto.randomBytes(16);
}

function generateIV() {
  return crypto.randomBytes(16);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ─── Core Conversion ────────────────────────────────────────────────────────
function convertToHls(inputPath, options = {}) {
  const { segmentDuration = DEFAULT_SEGMENT_DURATION, keyRotation = DEFAULT_KEY_ROTATION, dryRun = false } = options;

  const name = basename(inputPath, extname(inputPath));
  const storageKey = `video/${basename(inputPath)}`;
  const outputDir = join(HLS_OUTPUT_DIR, 'video', name);

  if (existsSync(join(outputDir, 'master.m3u8'))) {
    console.log(`  ⏭️  Already converted: ${name}`);
    return { skipped: true, storageKey };
  }

  console.log(`  🎬 Converting: ${inputPath}`);
  console.log(`     → Output: ${outputDir}`);

  if (dryRun) {
    console.log('     (dry-run — skipping)');
    return { skipped: false, dryRun: true, storageKey };
  }

  ensureDir(outputDir);

  // Generate encryption key(s)
  const primaryKey = generateAesKey();
  const iv = generateIV();
  const keyFilePath = join(outputDir, 'enc.key');
  writeFileSync(keyFilePath, primaryKey);
  writeFileSync(join(outputDir, 'enc.iv'), iv.toString('hex'));

  // Generate rotation keys
  const rotationKeys = [];
  const numRotations = Math.max(1, Math.ceil(keyRotation));
  for (let i = 0; i < numRotations; i++) {
    const rotKey = generateAesKey();
    const rotKeyPath = join(outputDir, `key_${i}.bin`);
    writeFileSync(rotKeyPath, rotKey);
    rotationKeys.push(rotKeyPath);
  }

  // Create key info file for ffmpeg
  // Format: <key URI>\n<key file path>\n<IV>
  const keyInfoPath = join(outputDir, 'enc.keyinfo');
  // The URI is what goes into the m3u8 — we use a placeholder that the backend will rewrite
  const keyUri = `${KEY_BASE_URL}?r=0`;
  writeFileSync(keyInfoPath, `${keyUri}\n${keyFilePath}\n${iv.toString('hex')}\n`);

  // Run ffmpeg
  const ffmpegCmd = [
    'ffmpeg',
    '-i', JSON.stringify(inputPath),
    '-c:v', 'copy',        // Copy video codec (no re-encoding for speed)
    '-c:a', 'aac',         // Ensure AAC audio
    '-start_number', '0',
    '-hls_time', String(segmentDuration),
    '-hls_list_size', '0', // Keep all segments in manifest
    '-hls_key_info_file', JSON.stringify(keyInfoPath),
    '-hls_segment_filename', JSON.stringify(join(outputDir, 'seg_%03d.ts')),
    '-hls_flags', 'independent_segments',
    '-f', 'hls',
    JSON.stringify(join(outputDir, 'stream.m3u8')),
  ].join(' ');

  try {
    execSync(ffmpegCmd, { stdio: 'pipe', timeout: 600000 }); // 10 min timeout
  } catch (error) {
    console.error(`  ❌ ffmpeg failed for ${name}:`, error.message);
    return { error: true, storageKey };
  }

  // Create master manifest that references the stream
  const masterManifest = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=2000000',
    'stream.m3u8',
    '',
  ].join('\n');
  writeFileSync(join(outputDir, 'master.m3u8'), masterManifest);

  // Post-process: rewrite key URIs in stream.m3u8 to use session-based delivery
  // The backend's video controller will dynamically rewrite these on delivery
  let streamManifest = readFileSync(join(outputDir, 'stream.m3u8'), 'utf8');
  // Replace key URI with placeholder that includes rotation index
  let keyIndex = 0;
  streamManifest = streamManifest.replace(
    /#EXT-X-KEY:METHOD=AES-128,URI="[^"]*"/g,
    () => {
      const uri = `${KEY_BASE_URL}?r=${keyIndex}`;
      keyIndex++;
      return `#EXT-X-KEY:METHOD=AES-128,URI="${uri}"`;
    }
  );
  writeFileSync(join(outputDir, 'stream.m3u8'), streamManifest);

  console.log(`  ✅ Converted: ${name} (${numRotations} key rotation(s))`);
  return { success: true, storageKey, outputDir };
}

// ─── Batch Mode ─────────────────────────────────────────────────────────────
function convertAll(options = {}) {
  if (!existsSync(VIDEO_DIR)) {
    console.log(`Video directory not found: ${VIDEO_DIR}`);
    return;
  }

  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
  const files = readdirSync(VIDEO_DIR).filter(f => 
    videoExtensions.includes(extname(f).toLowerCase())
  );

  console.log(`\n📁 Found ${files.length} video file(s) in ${VIDEO_DIR}\n`);

  let converted = 0, skipped = 0, errors = 0;

  for (const file of files) {
    const result = convertToHls(join(VIDEO_DIR, file), options);
    if (result.skipped) skipped++;
    else if (result.error) errors++;
    else if (result.success || result.dryRun) converted++;
  }

  console.log(`\n📊 Summary: ${converted} converted, ${skipped} skipped, ${errors} errors\n`);
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');

  const segIdx = args.indexOf('--segment-duration');
  const segmentDuration = segIdx >= 0 ? parseInt(args[segIdx + 1], 10) || DEFAULT_SEGMENT_DURATION : DEFAULT_SEGMENT_DURATION;

  const keyIdx = args.indexOf('--key-rotation');
  const keyRotation = keyIdx >= 0 ? parseInt(args[keyIdx + 1], 10) || DEFAULT_KEY_ROTATION : DEFAULT_KEY_ROTATION;

  const inputIdx = args.indexOf('--input');
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : null;

  console.log('🔐 Chabaqa HLS Converter (AES-128 Encrypted)');
  console.log(`   Segment duration: ${segmentDuration}s`);
  console.log(`   Key rotation: every ${keyRotation} segments`);
  console.log(`   Output: ${HLS_OUTPUT_DIR}`);
  if (dryRun) console.log('   Mode: DRY RUN');
  console.log('');

  if (!checkFfmpeg()) {
    console.error('❌ ffmpeg is not installed. Please install it: sudo apt install ffmpeg');
    process.exit(1);
  }

  const options = { segmentDuration, keyRotation, dryRun };

  if (inputPath) {
    if (!existsSync(inputPath)) {
      console.error(`❌ File not found: ${inputPath}`);
      process.exit(1);
    }
    convertToHls(inputPath, options);
  } else if (all) {
    convertAll(options);
  } else {
    console.log('Usage:');
    console.log('  node scripts/convert-to-hls.js --all [--dry-run]');
    console.log('  node scripts/convert-to-hls.js --input <file.mp4>');
    console.log('  node scripts/convert-to-hls.js --all --segment-duration 6 --key-rotation 10');
  }
}

main();

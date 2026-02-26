#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..');
const baseEnvPath = path.join(rootDir, '.env');
const localEnvPath = path.join(rootDir, '.env.local-db');

if (fs.existsSync(baseEnvPath)) {
  dotenv.config({ path: baseEnvPath, quiet: true });
}

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true, quiet: true });
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error(
    '[ERROR] Missing command. Usage: node scripts/run-with-local-db-env.js <command> [args...]',
  );
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[ERROR] Failed to start command "${command}":`, error.message);
  process.exit(1);
});

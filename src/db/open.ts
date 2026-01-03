#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const dbPath = resolve(process.env.DATABASE_PATH || './data/changes.db');

if (!existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

function openWithApp(): boolean {
  const r = spawnSync('open', ['-a', 'TablePlus', dbPath], { stdio: 'ignore' });
  return r.status === 0;
}

function openWithUrl(): boolean {
  const url = `tableplus://?file=${encodeURI(dbPath)}`;
  const r = spawnSync('open', [url], { stdio: 'ignore' });
  return r.status === 0;
}

if (process.platform === 'darwin') {
  if (openWithApp() || openWithUrl()) {
    process.exit(0);
  }
}

console.error('Unable to open TablePlus automatically. Open this file manually:');
console.error(dbPath);
process.exit(2);

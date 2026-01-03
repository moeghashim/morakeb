import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const envExamplePath = path.join(cwd, '.env.example');
const envPath = path.join(cwd, '.env');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function ensureFile(pathname: string, label: string) {
  if (!existsSync(pathname)) fail(`${label} not found: ${pathname}`);
  const stat = statSync(pathname);
  if (!stat.isFile()) fail(`${label} is not a file: ${pathname}`);
}

function ensureEnvFile() {
  ensureFile(envExamplePath, '.env.example');
  if (!existsSync(envPath)) {
    copyFileSync(envExamplePath, envPath);
  }
}

function getEnvValue(contents: string, key: string): string | null {
  const lines = contents.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith(`${key}=`)) {
      const value = trimmed.substring(`${key}=`.length).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function ensureEncryptionKey() {
  const contents = readFileSync(envPath, 'utf8');
  const existing = getEnvValue(contents, 'ENCRYPTION_KEY');
  if (existing) return;
  const key = randomBytes(36).toString('base64');
  const next = contents.endsWith('\n') ? contents : `${contents}\n`;
  writeFileSync(envPath, `${next}ENCRYPTION_KEY=${key}\n`);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

ensureEnvFile();
ensureEncryptionKey();
run('bun', ['db:generate']);
run('bun', ['db:migrate']);
console.log('Local setup complete.');

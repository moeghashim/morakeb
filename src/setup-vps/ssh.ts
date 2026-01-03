import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

export type SshConfigEntry = {
  alias: string;
  host: string;
  user: string;
  identityFile: string;
  port?: number;
};

export type LocalSshKey = {
  name: string;
  privatePath: string;
};

function resolveHomeDir(): string {
  const override = process.env.CHANGES_SSH_HOME;
  if (override && override.trim()) return override.trim();
  return homedir();
}

export function defaultKeyPath(): string {
  return path.join(resolveHomeDir(), '.ssh', 'changes_vps');
}

export function listLocalSshKeys(): LocalSshKey[] {
  const dir = path.join(resolveHomeDir(), '.ssh');
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const keys: LocalSshKey[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.pub')) continue;
    const base = entry.slice(0, -4);
    if (!base) continue;
    const privatePath = path.join(dir, base);
    if (!existsSync(privatePath)) continue;
    keys.push({ name: base, privatePath });
  }
  return keys;
}

export function ensureLocalSshKey(keyPath: string, comment: string): { publicKey: string } {
  const pubPath = `${keyPath}.pub`;
  if (!existsSync(keyPath) || !existsSync(pubPath)) {
    const result = spawnSync('ssh-keygen', ['-t', 'ed25519', '-C', comment, '-f', keyPath, '-N', ''], {
      stdio: 'ignore',
    });
    if (result.status !== 0) {
      throw new Error('Failed to create SSH key');
    }
  }
  const publicKey = readFileSync(pubPath, 'utf8').trim();
  if (!publicKey) {
    throw new Error('SSH public key is empty');
  }
  return { publicKey };
}

export function upsertSshConfig(entry: SshConfigEntry): void {
  const configPath = path.join(resolveHomeDir(), '.ssh', 'config');
  const blockLines = buildBlock(entry);
  const block = blockLines.join('\n');
  let content = '';
  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf8');
  }
  const next = upsertHostBlock(content, entry.alias, block);
  writeFileSync(configPath, next, 'utf8');
}

function buildBlock(entry: SshConfigEntry): string[] {
  const lines = [
    `Host ${entry.alias}`,
    `  HostName ${entry.host}`,
    `  User ${entry.user}`,
    `  IdentityFile ${entry.identityFile}`,
    '  IdentitiesOnly yes',
  ];
  if (entry.port && entry.port !== 22) {
    lines.push(`  Port ${entry.port}`);
  }
  return lines;
}

function upsertHostBlock(content: string, alias: string, block: string): string {
  const lines = content.split('\n');
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.toLowerCase().startsWith('host ')) {
      const name = trimmed.substring(5).trim();
      if (name === alias) {
        start = i;
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].trim();
          if (next.toLowerCase().startsWith('host ')) {
            end = j;
            break;
          }
        }
        if (end === -1) end = lines.length;
        break;
      }
    }
  }
  if (start >= 0 && end >= 0) {
    const before = lines.slice(0, start).join('\n');
    const after = lines.slice(end).join('\n');
    const combined = [before, block, after].filter(Boolean).join('\n');
    return combined.endsWith('\n') ? combined : `${combined}\n`;
  }
  const combined = [content.trimEnd(), block].filter(Boolean).join('\n');
  return combined.endsWith('\n') ? combined : `${combined}\n`;
}

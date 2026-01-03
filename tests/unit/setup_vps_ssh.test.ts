import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  listLocalSshKeys,
  ensureLocalSshKey,
  upsertSshConfig,
  defaultKeyPath,
} from '../../src/setup-vps/ssh';

describe('setup-vps ssh helpers', () => {
  let homeDir = '';
  let originalHome = '';

  beforeEach(() => {
    originalHome = process.env.CHANGES_SSH_HOME || '';
    homeDir = mkdtempSync(path.join(tmpdir(), 'changes-ssh-'));
    process.env.CHANGES_SSH_HOME = homeDir;
    mkdirSync(path.join(homeDir, '.ssh'), { recursive: true });
  });

  afterEach(() => {
    process.env.CHANGES_SSH_HOME = originalHome;
    try { rmSync(homeDir, { recursive: true, force: true }); } catch {}
  });

  it('lists local ssh keys with private files', () => {
    const sshDir = path.join(homeDir, '.ssh');
    writeFileSync(path.join(sshDir, 'id_a'), 'private');
    writeFileSync(path.join(sshDir, 'id_a.pub'), 'ssh-ed25519 AAAA id_a');
    writeFileSync(path.join(sshDir, 'id_b.pub'), 'ssh-ed25519 BBBB id_b');

    const keys = listLocalSshKeys();
    expect(keys.length).toBe(1);
    expect(keys[0]?.name).toBe('id_a');
    expect(keys[0]?.privatePath).toBe(path.join(sshDir, 'id_a'));
  });

  it('returns existing public key', () => {
    const sshDir = path.join(homeDir, '.ssh');
    const keyPath = path.join(sshDir, 'changes_vps');
    writeFileSync(keyPath, 'private');
    writeFileSync(`${keyPath}.pub`, 'ssh-ed25519 TESTKEY');

    const { publicKey } = ensureLocalSshKey(keyPath, 'changes');
    expect(publicKey).toBe('ssh-ed25519 TESTKEY');
  });

  it('throws when public key is empty', () => {
    const sshDir = path.join(homeDir, '.ssh');
    const keyPath = path.join(sshDir, 'changes_vps');
    writeFileSync(keyPath, 'private');
    writeFileSync(`${keyPath}.pub`, '');

    let message = '';
    try {
      ensureLocalSshKey(keyPath, 'changes');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe('SSH public key is empty');
  });

  it('upserts ssh config blocks', () => {
    const sshDir = path.join(homeDir, '.ssh');
    const configPath = path.join(sshDir, 'config');
    const initial = [
      'Host changes',
      '  HostName 1.1.1.1',
      '  User root',
      '  IdentityFile /old/key',
      '  IdentitiesOnly yes',
      '',
      'Host other',
      '  HostName 2.2.2.2',
      '  User root',
      '  IdentityFile /other/key',
      '  IdentitiesOnly yes',
      '',
    ].join('\n');
    writeFileSync(configPath, initial);

    upsertSshConfig({
      alias: 'changes',
      host: '5.5.5.5',
      user: 'root',
      identityFile: defaultKeyPath(),
    });

    const next = readFileSync(configPath, 'utf8');
    const count = next.split('\n').filter((line) => line.trim().toLowerCase() === 'host changes').length;
    expect(count).toBe(1);
    expect(next.includes('HostName 5.5.5.5')).toBe(true);
    expect(next.includes('Host other')).toBe(true);
  });
});

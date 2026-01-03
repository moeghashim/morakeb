import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  runAsync,
  fileExists,
  writeFileIfChanged,
  homeDirFor,
  currentUser,
  ensureDir,
} from '../../src/setup/sys';

describe('setup sys helpers', () => {
  let tempDir = '';
  let originalUser = '';
  let originalSudo = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'changes-sys-'));
    originalUser = process.env.USER || '';
    originalSudo = process.env.SUDO_USER || '';
  });

  afterEach(() => {
    process.env.USER = originalUser;
    process.env.SUDO_USER = originalSudo;
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it('writes only when content changes', async () => {
    const target = path.join(tempDir, 'file.txt');
    const first = await writeFileIfChanged(target, 'one');
    const second = await writeFileIfChanged(target, 'one');
    const third = await writeFileIfChanged(target, 'two');

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(third.changed).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('two');
  });

  it('checks file existence', async () => {
    const target = path.join(tempDir, 'missing.txt');
    expect(await fileExists(target)).toBe(false);
    await writeFileIfChanged(target, 'ok');
    expect(await fileExists(target)).toBe(true);
  });

  it('creates directories', async () => {
    const dir = path.join(tempDir, 'nested', 'dir');
    await ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('resolves home dir for users', () => {
    expect(homeDirFor('root')).toBe('/root');
    expect(homeDirFor('someone')).toBe('/home/someone');
  });

  it('uses sudo user when available', () => {
    process.env.SUDO_USER = 'admin';
    process.env.USER = 'root';
    expect(currentUser()).toBe('admin');
  });

  it('runs a command and returns stdout', async () => {
    const result = await runAsync('printf "hello"');
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello');
  });

  it('aborts a running command', async () => {
    const controller = new AbortController();
    const promise = runAsync('sleep 1', undefined, { signal: controller.signal });
    const abortTimer = setTimeout(() => controller.abort(), 20);

    let name = '';
    try {
      await promise;
    } catch (err) {
      name = (err as Error).name;
    } finally {
      clearTimeout(abortTimer);
    }
    expect(name).toBe('AbortError');
  });
});

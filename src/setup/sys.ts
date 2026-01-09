import os from 'node:os';
import {execSync, spawnSync, spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';

export function isLinux(): boolean {
  return os.platform() === 'linux';
}

export function isDarwin(): boolean {
  return os.platform() === 'darwin';
}

export function isRoot(): boolean {
  return typeof process.getuid === 'function' ? process.getuid() === 0 : false;
}

export function hasCmd(cmd: string): boolean {
  const r = spawnSync('which', [cmd], {stdio: 'ignore'});
  return r.status === 0;
}

export function run(cmd: string, cwd?: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const out = execSync(cmd, {stdio: ['ignore', 'pipe', 'pipe'], cwd, env: process.env});
    return {ok: true, stdout: out.toString(), stderr: ''};
  } catch (e: any) {
    return {ok: false, stdout: e.stdout?.toString?.() ?? '', stderr: e.stderr?.toString?.() ?? String(e)};
  }
}

type RunAsyncOptions = {
  signal?: AbortSignal;
};

// Escape shell arguments to prevent command injection
export function shellEscape(arg: string): string {
  // If the argument contains only safe characters, return as-is
  if (/^[a-zA-Z0-9_./-]+$/.test(arg)) {
    return arg;
  }
  // Otherwise, wrap in single quotes and escape any single quotes within
  return `'${arg.replace(/'/g, "'\"'\"'")}'`;
}

export function runAsync(
  cmd: string,
  cwd?: string,
  options?: RunAsyncOptions,
): Promise<{ok: boolean; stdout: string; stderr: string; code: number}> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {cwd, env: process.env, shell: true});
    let stdout = '';
    let stderr = '';
    let aborted = false;
    child.stdout?.on('data', d => { stdout += d.toString(); });
    child.stderr?.on('data', d => { stderr += d.toString(); });
    const handleAbort = () => {
      if (aborted) return;
      aborted = true;
      child.kill('SIGTERM');
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        handleAbort();
      } else {
        options.signal.addEventListener('abort', handleAbort, {once: true});
      }
    }
    child.on('close', (code) => {
      if (options?.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
      if (aborted) {
        const err: Error & {code?: number} = new Error('Command aborted');
        err.name = 'AbortError';
        err.code = code ?? -1;
        reject(err);
        return;
      }
      resolve({
        ok: (code ?? 1) === 0,
        stdout,
        stderr,
        code: code ?? -1,
      });
    });
  });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf8');
}

export async function writeFileIfChanged(path: string, content: string): Promise<{changed: boolean}> {
  const exists = await fileExists(path);
  if (exists) {
    const current = await readFile(path);
    if (current === content) return {changed: false};
  }
  await fs.writeFile(path, content, 'utf8');
  return {changed: true};
}

export function homeDirFor(user?: string): string {
  if (!user || user === os.userInfo().username) return os.homedir();
  if (user === 'root') return '/root';
  return `/home/${user}`;
}

export function currentUser(): string {
  return process.env.SUDO_USER || process.env.USER || os.userInfo().username;
}

export function aptAvailable(): boolean {
  return isLinux() && hasCmd('apt');
}

export function systemctlAvailable(): boolean {
  return isLinux() && hasCmd('systemctl');
}

export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, {recursive: true});
}

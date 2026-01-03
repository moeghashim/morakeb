import path from 'node:path';
import {promises as fs} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Database} from 'bun:sqlite';
import {
  ensureDir,
  fileExists,
  hasCmd,
  isLinux,
  isRoot,
  run,
  systemctlAvailable,
  writeFileIfChanged,
} from './sys';
import {buildSystemdUnit} from './systemd';
import type {Mode, RunMode, Task, TaskResult} from './types';

type TaskBuilderParams = {
  mode: Mode;
  runMode: RunMode | null;
  appDir: string;
  home: string;
  user: string;
  onTaskNote: (key: string, value: string) => void;
};

export async function buildSetupTasks({
  mode,
  runMode,
  appDir,
  home,
  user,
  onTaskNote,
}: TaskBuilderParams): Promise<Task[]> {
  const tasks: Task[] = [];

  tasks.push({
    key: 'bun',
    title: 'Ensure Bun installed',
    mode: 'both',
    enabled: true,
    run: async () => {
      if (hasCmd('bun')) return 'ok';
      const r = run('curl -fsSL https://bun.sh/install | bash', home);
      return r.ok ? 'installed' : 'failed';
    },
  });

  tasks.push({
    key: 'droid',
    title: 'Ensure Droid installed',
    mode: 'both',
    enabled: true,
    run: async () => {
      const localBin = path.join(home, '.local/bin/droid');
      const exists = await fileExists(localBin);
      if (exists) return 'ok';

      const r = run('curl -fsSL https://app.factory.ai/cli | sh', home);
      const out = (r.stdout || '') + '\n' + (r.stderr || '');
      const nowExists = await fileExists(localBin);
      if (!nowExists) return 'failed';

      let note = '';
      if (out.includes('PATH already configured')) {
        note = 'Droid installed to ~/.local/bin and PATH already includes it. Run: droid';
      } else if (out.includes('PATH configuration required')) {
        note = 'Droid installed to ~/.local/bin. Add to PATH: echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.bashrc && source ~/.bashrc';
      } else if (out.includes('installed successfully')) {
        note = 'Droid installed to ~/.local/bin. If droid is not found, add ~/.local/bin to PATH.';
      }
      if (note) onTaskNote('droid', note);
      return 'installed';
    },
  });

  tasks.push({
    key: 'deps',
    title: 'Install system dependencies (curl, git, sqlite3)',
    mode: 'vps',
    enabled: true,
    run: async () => {
      if (!isLinux()) return 'skipped';
      if (!hasCmd('apt')) return 'skipped';
      const needCurl = !hasCmd('curl');
      const needGit = !hasCmd('git');
      const needSqlite = !hasCmd('sqlite3');
      if (!needCurl && !needGit && !needSqlite) return 'ok';
      const pkgs = [needCurl ? 'curl' : null, needGit ? 'git' : null, needSqlite ? 'sqlite3' : null]
        .filter(Boolean)
        .join(' ');
      const r1 = run('apt update', '/');
      const r2 = run(`apt install -y ${pkgs}`, '/');
      return r1.ok && r2.ok ? 'installed' : 'failed';
    },
  });

  tasks.push({
    key: 'bun-install',
    title: 'Install project dependencies (bun install)',
    mode: 'both',
    enabled: true,
    run: async () => {
      const r = run('bun install', appDir);
      return r.ok ? 'ok' : 'failed';
    },
  });

  tasks.push({
    key: 'data',
    title: 'Ensure data directory',
    mode: 'both',
    enabled: true,
    run: async () => {
      await ensureDir(path.join(appDir, 'data'));
      return 'ok';
    },
  });

  tasks.push({
    key: 'env',
    title: 'Ensure .env (copy from .env.example if missing)',
    mode: 'both',
    enabled: true,
    run: async () => {
      const envPath = path.join(appDir, '.env');
      if (await fileExists(envPath)) return 'ok';
      const src = path.join(appDir, '.env.example');
      if (!(await fileExists(src))) return 'skipped';
      await fs.copyFile(src, envPath);
      return 'installed';
    },
  });

  tasks.push({
    key: 'encryption-key',
    title: 'Ensure ENCRYPTION_KEY in .env',
    mode: 'both',
    enabled: true,
    run: async () => {
      const envPath = path.join(appDir, '.env');
      if (!(await fileExists(envPath))) return 'skipped';
      const content = await fs.readFile(envPath, 'utf8').catch(() => '');
      const hasKey = /^ENCRYPTION_KEY=.*/m.test(content);
      if (hasKey) return 'ok';
      const key = randomBytes(48).toString('base64');
      await fs.appendFile(envPath, `\nENCRYPTION_KEY=${key}\n`, 'utf8');
      return 'installed';
    },
  });

  tasks.push({
    key: 'migrate',
    title: 'Run database migrations',
    mode: 'both',
    enabled: true,
    run: async () => {
      const r = run('bun run src/db/migrate.ts', appDir);
      return r.ok ? 'ok' : 'failed';
    },
  });

  tasks.push({
    key: 'db-check',
    title: 'Verify database connectivity',
    mode: 'both',
    enabled: true,
    run: async () => {
      try {
        const dbPath = process.env.DATABASE_PATH || path.join(appDir, 'data/changes.db');
        const sqlite = new Database(dbPath);
        sqlite.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
        sqlite.close();
        return 'ok';
      } catch {
        return 'failed';
      }
    },
  });

  tasks.push({
    key: 'systemd',
    title: 'Create or update systemd service',
    mode: 'vps',
    enabled: true,
    run: async () => {
      if (!isLinux() || !systemctlAvailable() || !isRoot()) return 'skipped';
      const unitPath = '/etc/systemd/system/changes.service';
      const content = buildSystemdUnit(appDir, user, home);
      const {changed} = await writeFileIfChanged(unitPath, content);
      const r1 = run('systemctl daemon-reload');
      const r2 = run('systemctl enable changes');
      const r3 = run(changed ? 'systemctl restart changes' : 'systemctl restart changes');
      return r1.ok && r2.ok && r3.ok ? (changed ? 'updated' : 'ok') : 'failed';
    },
  });

  let filtered = tasks.filter((t) => t.mode === mode || t.mode === 'both');
  if (!(mode === 'vps' && runMode === 'background')) {
    filtered = filtered.filter((t) => t.key !== 'systemd');
  }
  return filtered;
}

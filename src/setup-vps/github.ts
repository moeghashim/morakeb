import { spawnSync } from 'node:child_process';
import { run } from '../setup/sys';

export type GitHubRepo = {
  owner: string;
  name: string;
};

export function detectGitHubRepo(): GitHubRepo | null {
  const remote = run('git remote get-url origin');
  if (!remote.ok) return null;
  const url = remote.stdout.trim();
  if (!url) return null;
  if (url.startsWith('git@github.com:')) {
    const part = url.replace('git@github.com:', '').replace(/\.git$/, '');
    const [owner, name] = part.split('/');
    if (owner && name) return { owner, name };
  }
  if (url.startsWith('https://github.com/')) {
    const part = url.replace('https://github.com/', '').replace(/\.git$/, '');
    const [owner, name] = part.split('/');
    if (owner && name) return { owner, name };
  }
  return null;
}

export function ghAvailable(): boolean {
  const check = spawnSync('gh', ['--version'], { stdio: 'ignore' });
  return check.status === 0;
}

export function ghAuthed(): boolean {
  const check = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  return check.status === 0;
}

export function setSecret(
  repo: GitHubRepo,
  name: string,
  value: string,
): { ok: boolean; error?: string } {
  const full = `${repo.owner}/${repo.name}`;
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', full, '--body', value], {
    stdio: 'ignore',
  });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: `Failed to set secret ${name}` };
}

export function setVariable(
  repo: GitHubRepo,
  name: string,
  value: string,
): { ok: boolean; error?: string } {
  const full = `${repo.owner}/${repo.name}`;
  const result = spawnSync('gh', ['variable', 'set', name, '--repo', full, '--body', value], {
    stdio: 'ignore',
  });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: `Failed to set variable ${name}` };
}

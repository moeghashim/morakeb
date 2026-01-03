import { spawnSync } from 'node:child_process';

export type DroidWarmupResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export function warmupDroidModel(model: string): DroidWarmupResult {
  const proc = spawnSync(
    'droid',
    ['exec', '-m', model, '-o', 'text', '-r', 'off', 'ping'],
    { encoding: 'utf8' }
  );
  const status = typeof proc.status === 'number' ? proc.status : (proc.error ? -1 : null);
  const stdout = (proc.stdout ?? '').toString();
  const stderr = (proc.stderr ?? '').toString();
  return {
    ok: status === 0,
    status,
    stdout,
    stderr,
    error: proc.error ?? undefined,
  };
}

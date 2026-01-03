#!/usr/bin/env bun

type Status = 'queued' | 'in_progress' | 'completed';
type Conclusion =
  | 'success' | 'failure' | 'cancelled' | 'timed_out' | 'neutral'
  | 'skipped' | 'action_required' | 'stale';
type GhEvent =
  | 'push' | 'pull_request' | 'workflow_dispatch' | 'schedule'
  | 'release' | 'workflow_run' | 'workflow_call' | string;

type Options = {
  repo?: string;
  workflow?: string;
  branch?: string;
  status?: Status;
  conclusion?: Conclusion;
  event?: GhEvent;
  olderThanMs?: number;
  since?: string;
  until?: string;
  limit?: number;
  pageSize?: number;
  keepLatest?: number;
  dryRun?: boolean;
  force?: boolean;
  ids?: number[];
};

type GhRun = {
  id: number;
  name?: string | null;
  display_title?: string | null;
  head_branch?: string | null;
  event?: string | null;
  status?: Status | null;
  conclusion?: Conclusion | null;
  created_at?: string;
  updated_at?: string;
  run_number?: number;
  url?: string;
  html_url?: string;
  workflow_id?: number;
};

type GhRunsResponse = {
  total_count: number;
  workflow_runs: GhRun[];
};

const HELP = `
Delete GitHub Actions workflow runs using gh api.

Flags:
  --repo owner/repo            Repository (defaults to current gh repo)
  --workflow <name|file|id>    Filter to a workflow (name contains, filename, or numeric id)
  --branch <branch>            Filter by head branch
  --event <event>              Filter by event (push, workflow_dispatch, schedule, ...)
  --status <queued|in_progress|completed>
  --conclusion <success|failure|cancelled|timed_out|neutral|skipped|action_required|stale>
  --older-than <dur>           Filter runs created before now - dur (e.g. 7d, 24h, 90m)
  --since <YYYY-MM-DD>         Keep runs created on/after this date (filter after fetch)
  --until <YYYY-MM-DD>         Keep runs created on/before this date (filter after fetch)
  --limit <n>                  Max runs to scan (default 1000)
  --page-size <n>              Per-page fetch size (default 100)
  --keep-latest <n>            Keep N newest runs per workflow id (deletes only older than the N newest)
  --ids <comma-separated>      Explicit run ids to delete (skips fetching)
  --dry-run                    Preview deletion, do not delete
  --force                      Skip confirmation prompt
  -h, --help                   Show this help
`;

function parseArgs(argv: string[]): Options | 'help' {
  const opts: Options = { pageSize: 100, limit: 1000, dryRun: false, force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': return 'help';
      case '--repo': opts.repo = next(); break;
      case '--workflow': opts.workflow = next(); break;
      case '--branch': opts.branch = next(); break;
  case '--event': opts.event = next() as GhEvent; break;
      case '--status': opts.status = next() as Status; break;
      case '--conclusion': opts.conclusion = next() as Conclusion; break;
      case '--older-than': opts.olderThanMs = parseDuration(next()); break;
      case '--since': opts.since = next(); break;
      case '--until': opts.until = next(); break;
      case '--limit': opts.limit = Number(next()); break;
      case '--page-size': opts.pageSize = Number(next()); break;
      case '--keep-latest': opts.keepLatest = Number(next()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--force': opts.force = true; break;
      case '--ids': {
        const raw = next();
        opts.ids = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
        break;
      }
      default:
        if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}\n\n${HELP}`);
        break;
    }
  }
  return opts;
}

function parseDuration(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d+)([smhdw])$/);
  if (!m) throw new Error(`Invalid duration: ${s}. Use e.g. 30m, 24h, 7d, 2w`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1000
    : unit === 'm' ? 60_000
    : unit === 'h' ? 3_600_000
    : unit === 'd' ? 86_400_000
    : unit === 'w' ? 7 * 86_400_000
    : 0;
  return n * mult;
}

async function run(cmd: string[], input?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  // Prefer Bun.spawn (Bun >= 1.0). Fallback to Bun.Command if present.
  const hasSpawn = typeof (Bun as any).spawn === 'function';
  if (hasSpawn) {
    const proc = Bun.spawn(cmd, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    if (input && proc.stdin) {
      await proc.stdin.write(input);
      proc.stdin.end();
    }
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, code };
  }
  const Cmd = (Bun as any).Command;
  if (typeof Cmd === 'function') {
    const p = new Cmd(cmd, { stdin: input ? 'pipe' : 'inherit', stdout: 'pipe', stderr: 'pipe' });
    const proc = p.spawn();
    if (input) await proc.stdin.write(input);
    const stdout = await proc.stdout.text();
    const stderr = await proc.stderr.text();
    const code = await proc.exited;
    return { stdout, stderr, code };
  }
  throw new Error('Neither Bun.spawn nor Bun.Command available in this runtime');
}

async function ensureGh(): Promise<void> {
  const { code } = await run(['gh', '--version']);
  if (code !== 0) throw new Error('gh CLI not found. Install GitHub CLI: https://cli.github.com/');
}

async function resolveRepo(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const r = await run(['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  if (r.code === 0) return r.stdout.trim();
  const g = await run(['git', 'config', '--get', 'remote.origin.url']);
  if (g.code === 0) {
    const url = g.stdout.trim();
    const m = url.match(/[:/]([^/:]+\/[^/\\.]+)(?:\.git)?$/);
    if (m) return m[1];
  }
  throw new Error('Unable to determine repo. Use --repo owner/repo');
}

function toISODateOnly(d: Date): string { return d.toISOString().slice(0, 10); }

function withinDateRange(createdAt?: string, since?: string, until?: string): boolean {
  if (!createdAt) return false;
  const d = new Date(createdAt);
  if (since && d < new Date(`${since}T00:00:00Z`)) return false;
  if (until && d > new Date(`${until}T23:59:59Z`)) return false;
  return true;
}

function olderThanThreshold(createdAt?: string, olderThanMs?: number): boolean {
  if (!olderThanMs) return true;
  if (!createdAt) return false;
  return (Date.now() - new Date(createdAt).getTime()) >= olderThanMs;
}

function matchesWorkflow(run: GhRun, wf: string): boolean {
  if (/^\d+$/.test(wf)) return String(run.workflow_id ?? '') === wf;
  const needle = wf.toLowerCase();
  const name = (run.name || '').toLowerCase();
  const url = (run.url || run.html_url || '').toLowerCase();
  return name.includes(needle) || url.includes(needle);
}

async function listRuns(repo: string, opts: Options): Promise<GhRun[]> {
  const runs: GhRun[] = [];
  const perPage = Math.max(1, Math.min(100, opts.pageSize ?? 100));
  const max = Math.max(1, Math.min(10_000, opts.limit ?? 1000));
  const queryParams: Record<string, string> = { per_page: String(perPage) };
  if (opts.status) queryParams.status = opts.status;
  if (opts.branch) queryParams.branch = opts.branch;
  if (opts.event) queryParams.event = String(opts.event);
  if (opts.olderThanMs) {
    const cutoff = new Date(Date.now() - opts.olderThanMs);
    queryParams.created = `<=${toISODateOnly(cutoff)}`;
  }
  const qp = (page: number) =>
    Object.entries({ ...queryParams, page: String(page) })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  for (let page = 1; runs.length < max; page++) {
    const url = `repos/${repo}/actions/runs?${qp(page)}`;
    const { stdout, code, stderr } = await run(['gh', 'api', url]);
    if (code !== 0) throw new Error(`gh api failed: ${stderr || stdout}`);
    const data: GhRunsResponse = JSON.parse(stdout);
    if (!data.workflow_runs?.length) break;
    runs.push(...data.workflow_runs);
    if (data.workflow_runs.length < perPage) break;
  }
  return runs.slice(0, max);
}

function applyFilters(runs: GhRun[], opts: Options): GhRun[] {
  return runs.filter(r => {
    if (opts.conclusion && (r.conclusion ?? '') !== opts.conclusion) return false;
    if (opts.workflow && !matchesWorkflow(r, opts.workflow)) return false;
    if (!olderThanThreshold(r.created_at, opts.olderThanMs)) return false;
    if (!withinDateRange(r.created_at, opts.since, opts.until)) return false;
    return true;
  });
}

function applyKeepLatest(runs: GhRun[], keep?: number): GhRun[] {
  if (!keep || keep <= 0) return runs;
  const byWf = new Map<number | undefined, GhRun[]>();
  for (const r of runs) {
    const arr = byWf.get(r.workflow_id) ?? [];
    arr.push(r);
    byWf.set(r.workflow_id, arr);
  }
  const deletions: GhRun[] = [];
  for (const [, arr] of byWf) {
    arr.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    deletions.push(...arr.slice(keep));
  }
  const delSet = new Set(deletions.map(d => d.id));
  return runs.filter(r => delSet.has(r.id));
}

function truncate(s: string, max = 60): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
function termColumns(): number {
  const c = (process.stdout as any)?.columns;
  return Number.isFinite(c) && c > 20 ? Number(c) : 80;
}

function fmtTitle(r: GhRun): string {
  const title = r.display_title || r.name || `workflow#${r.workflow_id ?? '?'}`;
  const width = termColumns();
  // leave a small margin to reduce wrapping on tight terminals
  const max = Math.max(20, width - 2);
  return truncate(String(title), max);
}

async function deleteRun(repo: string, id: number): Promise<void> {
  const { code, stderr, stdout } = await run(['gh', 'api', '-X', 'DELETE', `repos/${repo}/actions/runs/${id}`]);
  if (code !== 0) throw new Error(`Failed to delete run ${id}: ${stderr || stdout}`);
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed === 'help') { console.log(HELP); return; }
  const opts = parsed;

  await ensureGh();
  const repo = await resolveRepo(opts.repo);

  let targetRuns: GhRun[] = [];
  if (opts.ids && opts.ids.length > 0) {
    const found: GhRun[] = [];
    for (const id of opts.ids) {
      const { stdout, code, stderr } = await run(['gh', 'api', `repos/${repo}/actions/runs/${id}`]);
      if (code !== 0) throw new Error(`Failed to fetch run ${id}: ${stderr || stdout}`);
      found.push(JSON.parse(stdout) as GhRun);
    }
    targetRuns = found;
  } else {
    const runs = await listRuns(repo, opts);
    const filtered = applyFilters(runs, opts);
    targetRuns = applyKeepLatest(filtered, opts.keepLatest);
  }

  if (targetRuns.length === 0) { console.log('No matching runs found.'); return; }

  console.log(`Repository: ${repo}`);
  console.log(`Matching runs: ${targetRuns.length}`);
  console.log('');
  for (const r of targetRuns) console.log('- ' + fmtTitle(r));

  if (opts.dryRun) {
    console.log('\nDry run: no deletions performed. Re-run without --dry-run (and with --force to skip confirm).');
    return;
  }

  if (!opts.force) {
    const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('\nDelete these runs? Type "yes" to confirm: ')).trim().toLowerCase();
    rl.close();
    if (answer !== 'yes') { console.log('Aborted.'); return; }
  }

  let deleted = 0, failed = 0;
  for (const r of targetRuns) {
    try { await deleteRun(repo, r.id); console.log(`Deleted run ${r.id}`); deleted++; }
    catch (e) { console.error(String(e)); failed++; }
  }
  console.log(`\nDone. Deleted: ${deleted}  Failed: ${failed}`);
}

main().catch(err => { console.error(err instanceof Error ? err.stack || err.message : String(err)); process.exit(1); });

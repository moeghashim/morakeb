#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { runApp } from './App';
import { getHostDest } from '../setup/prefs';

type RemoteArgs = {
  remote: boolean;
  host?: string;
  dest?: string;
};

function parseArgs(): RemoteArgs {
  const args = process.argv.slice(2);
  const out: RemoteArgs = { remote: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--remote') { out.remote = true; continue; }
    if (a === '--host' && args[i + 1]) { out.host = args[++i]; continue; }
    if (a === '--dest' && args[i + 1]) { out.dest = args[++i]; continue; }
  }
  return out;
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

async function runRemote(host?: string, dest?: string) {
  const prefs = await getHostDest();
  const resolvedHost = host || prefs.host || process.env.DEPLOY_HOST || 'changes';
  const resolvedDest = dest || prefs.dest || process.env.DEPLOY_PATH || '/opt/changes';
  if (!resolvedHost) {
    console.error('Missing host. Use --host or run bun setup:vps first.');
    process.exit(1);
  }
  const safeDest = escapeSingleQuotes(resolvedDest);
  const cmd = `bash -lc 'cd ${safeDest} && if [ -x "$HOME/.bun/bin/bun" ]; then "$HOME/.bun/bin/bun" changes; elif command -v bun >/dev/null 2>&1; then bun changes; else echo "bun not found on remote host"; exit 127; fi'`;
  const result = spawnSync('ssh', ['-t', resolvedHost, cmd], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const parsed = parseArgs();
if (parsed.remote) {
  await runRemote(parsed.host, parsed.dest);
} else {
  runApp().then(() => process.exit(0));
}

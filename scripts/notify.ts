#!/usr/bin/env bun

import { buildDeployMessage, buildGithubEnv, sendTelegram, timestamp } from '@/lib/notify-basic';

type Kind = 'deploy';
type Status = 'start' | 'success' | 'failure';

const HELP = `
Send simple notifications (currently Telegram) for CI/deploy events.

Usage:
  bun scripts/notify.ts deploy <start|success|failure> [--message <text>] [--prefix <text>] [--dry-run]

Environment:
  TELEGRAM_BOT_TOKEN   Telegram bot token (from @BotFather)
  TELEGRAM_CHAT_ID     Telegram chat id (e.g. from @userinfobot)

Notes:
  - Reads environment variables (including from .env in Bun).
  - Designed for GitHub Actions but works locally.
  - Keep messages plain text; no emojis.
`;

type Options = {
  kind: Kind;
  status: Status;
  message?: string;
  prefix?: string;
  dryRun?: boolean;
};

function parseArgs(argv: string[]): Options | 'help' {
  if (argv.includes('-h') || argv.includes('--help')) return 'help';
  let kind: Kind | undefined;
  let status: Status | undefined;
  let message: string | undefined;
  let prefix: string | undefined;
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--message') { message = String(next() ?? ''); continue; }
    if (a === '--prefix') { prefix = String(next() ?? ''); continue; }
    if (a === '--dry-run') { dryRun = true; continue; }
    if (!kind) { kind = a as Kind; continue; }
    if (!status) { status = a as Status; continue; }
  }

  if (!kind || kind !== 'deploy') throw new Error('Missing or invalid kind. Supported: deploy');
  if (!status || !['start', 'success', 'failure'].includes(status)) throw new Error('Missing or invalid status. Use: start|success|failure');
  return { kind, status, message, prefix, dryRun };
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed === 'help') { console.log(HELP); return; }
  const { kind, status, message, prefix, dryRun } = parsed;

  const gh = buildGithubEnv(process.env as Record<string, string | undefined>);

  let text = '';
  if (kind === 'deploy') {
    text = buildDeployMessage(status, gh, { message, prefix });
  }

  const token = Bun.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = Bun.env.TELEGRAM_CHAT_ID || '';

  if (dryRun) {
    console.log(`[${timestamp()}] notify (dry-run)\n${text}`);
    return;
  }

  if (!token || !chatId) {
    console.error(`[${timestamp()}] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID`);
    process.exit(2);
  }

  const res = await sendTelegram({ token, chatId, text });
  if (!res.ok) {
    console.error(`[${timestamp()}] notify telegram failed: ${res.error}`);
    process.exit(1);
  }
  console.log(`[${timestamp()}] notify telegram: sent`);
}

if (import.meta.main) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${timestamp()}] notify error: ${msg}`);
    process.exit(1);
  });
}

export { buildDeployMessage };


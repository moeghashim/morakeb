#!/usr/bin/env bun
import { readFileSync, existsSync } from 'node:fs';
import { DB } from '../src/db/index.ts';
import { SummaryService } from '../src/lib/summary-service.ts';
import { AISDKSummarizer } from '../src/lib/summarizer-aisdk.ts';
import { DroidSummarizer } from '../src/lib/summarizer-droid.ts';

// Load .env file
function loadEnv() {
  const envPath = '.env';
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}

loadEnv();

const dbPath = process.env.DATABASE_PATH || './data/changes.db';
const db = new DB(dbPath);

try {
  db.ensureDefaultAIData();
} catch {}

const monitors = db.listMonitors(false);
const anthropicMonitor = monitors.find(m => 
  m.name.toLowerCase().includes('anthropic') || 
  m.url.includes('anthropic') ||
  m.url.includes('claude')
);

if (!anthropicMonitor) {
  console.error('Anthropic monitor not found');
  process.exit(1);
}

console.log('Fetching latest changelog...');
const changelogUrl = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const response = await fetch(changelogUrl);
const changelogContent = await response.text();

const versionMatch = changelogContent.match(/^## ([\d.]+)\s*\n([\s\S]*?)(?=^## |$)/m);
if (!versionMatch) {
  throw new Error('Could not find latest version');
}

const latestVersion = versionMatch[1];
const latestVersionContent = versionMatch[2].trim();

console.log(`Found latest version: ${latestVersion}\n`);

const diffMarkdown = `# Changes Detected

## ➕ Added

\`\`\`diff
+ ${latestVersionContent.split('\n').join('\n+ ')}
\`\`\`
`;

const summaryService = new SummaryService(db, {
  droid: new DroidSummarizer(),
  aisdk: new AISDKSummarizer(),
});

console.log('Generating AI summary in Arabic...\n');
const summaryResult = await summaryService.generateSummary(anthropicMonitor, diffMarkdown);

if (!summaryResult?.text) {
  console.error('Failed to generate summary');
  process.exit(1);
}

console.log('='.repeat(70));
console.log('GENERATED ARABIC SUMMARY:');
console.log('='.repeat(70));
console.log(summaryResult.text);
console.log('='.repeat(70));
console.log('\n✓ Summary generated successfully!');
console.log('\nTo send this to Telegram:');
console.log('1. Start a conversation with @TermsTrustBot on Telegram');
console.log('2. Send any message to the bot');
console.log('3. Get your chat ID by messaging @userinfobot');
console.log('4. Update TELEGRAM_CHAT_ID in .env with your chat ID');
console.log('5. Run: bun run scripts/test-telegram-send.ts\n');

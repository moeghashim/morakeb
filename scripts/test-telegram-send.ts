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

// Ensure AI providers are set up
try {
  db.ensureDefaultAIData();
} catch {}

// Get Telegram credentials from .env
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!botToken || !chatId) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

// Find Anthropic monitor
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

console.log(`Found monitor: ${anthropicMonitor.id} - ${anthropicMonitor.name}`);

// Fetch the latest changelog content directly
console.log('\nFetching latest changelog...');
const changelogUrl = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const response = await fetch(changelogUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch changelog: ${response.statusText}`);
}
const changelogContent = await response.text();

// Extract the latest version section - find first version header and capture until next version or end
const versionHeaderMatch = changelogContent.match(/^## ([\d.]+)\s*\n/m);
if (!versionHeaderMatch) {
  throw new Error('Could not find version header in changelog');
}

const latestVersion = versionHeaderMatch[1];
const afterHeader = changelogContent.substring(versionHeaderMatch.index! + versionHeaderMatch[0].length);
// Capture content until next version header or end of file
const nextVersionMatch = afterHeader.match(/^## [\d.]+\s*\n/m);
const latestVersionContent = nextVersionMatch 
  ? afterHeader.substring(0, nextVersionMatch.index).trim()
  : afterHeader.trim();

console.log(`Found latest version: ${latestVersion}`);
console.log(`Changelog content length: ${latestVersionContent.length} chars`);
const bulletPoints = latestVersionContent.split('\n').filter(line => line.trim().startsWith('-')).length;
console.log(`Number of bullet points: ${bulletPoints}\n`);

// Create a diff-like markdown for summary generation
// Format as a proper changelog section to help the AI understand all items should be included
const diffMarkdown = `# Changes Detected

## ➕ Added

## ${latestVersion}

${latestVersionContent}
`;

// Generate summary
const summaryService = new SummaryService(db, {
  droid: new DroidSummarizer(),
  aisdk: new AISDKSummarizer(),
});

console.log('Generating AI summary in Arabic...');
const summaryResult = await summaryService.generateSummary(anthropicMonitor, diffMarkdown);

if (!summaryResult?.text) {
  console.error('Failed to generate summary');
  process.exit(1);
}

console.log('Summary generated successfully\n');

// Format summary for Telegram (HTML)
function formatForTelegram(summary: string, version: string): string {
  const lines = summary.split('\n');
  const out: string[] = [];
  
  // Add fun header with company and version (no date)
  // Wrap version number in LTR markers to keep it left-to-right in RTL text
  const companyName = 'Anthropic';
  const ltrVersion = `\u202A${version}\u202C`;
  const header = `${companyName} تطلق الإصدار ${ltrVersion}`;
  out.push(`<b>${escapeHtml(header)}</b>`);
  out.push('');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    
    // Bold headings
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      const text = trimmed.slice(2, -2);
      // Enhance headings
      let enhancedText = text;
      if (text === 'الميزات' || (text.includes('الميزات') && !text.includes('الجديدة'))) {
        enhancedText = text.replace('الميزات', 'الميزات الجديدة');
      } else if (text === 'الإصلاحات' || text.includes('الإصلاحات')) {
        enhancedText = text.replace('الإصلاحات', 'التحسينات والإصلاحات');
      }
      out.push(`<b>${escapeHtml(enhancedText)}</b>`);
      continue;
    }
    
    // Bullet points
    if (trimmed.startsWith('- ')) {
      out.push(`- ${escapeHtml(trimmed.slice(2))}`);
      continue;
    }
    
    out.push(escapeHtml(trimmed));
  }
  
  // Add link
  out.push('');
  out.push(`<a href="${escapeHtml(changelogUrl)}">${escapeHtml(changelogUrl)}</a>`);
  
  return out.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const telegramMessage = formatForTelegram(summaryResult.text, latestVersion);

// Send to Telegram
console.log('Sending summary to Telegram...');
const telegramResponse = await fetch(
  `https://api.telegram.org/bot${botToken}/sendMessage`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: telegramMessage,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  }
);

const result = await telegramResponse.json();

if (result.ok) {
  console.log('✓ Successfully sent summary to Telegram!');
  console.log(`\nFull summary:\n${summaryResult.text}\n`);
  console.log(`\nFeatures count: ${summaryResult.structured?.features?.length || 0}`);
  console.log(`Fixes count: ${summaryResult.structured?.fixes?.length || 0}\n`);
} else {
  console.error('✗ Failed to send to Telegram');
  console.error('Error:', JSON.stringify(result, null, 2));
  process.exit(1);
}

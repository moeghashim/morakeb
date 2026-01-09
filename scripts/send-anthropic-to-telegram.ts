import { DB } from '../src/db/index.ts';
import { MonitorService } from '../src/lib/monitor-service.ts';
import { Fetcher } from '../src/lib/fetcher.ts';
import { MarkdownConverter } from '../src/lib/markdown.ts';
import { Differ } from '../src/lib/differ.ts';
import { NotificationService } from '../src/lib/notifier.ts';
import { SummaryService } from '../src/lib/summary-service.ts';
import { AISDKSummarizer } from '../src/lib/summarizer-aisdk.ts';
import { DroidSummarizer } from '../src/lib/summarizer-droid.ts';

const dbPath = process.env.DATABASE_PATH || './data/changes.db';
const db = new DB(dbPath);

// Ensure AI providers are set up
try {
  db.ensureDefaultAIData();
} catch {}

// Find Anthropic monitor
const monitors = db.listMonitors(false);
const anthropicMonitor = monitors.find(m => 
  m.name.toLowerCase().includes('anthropic') || 
  m.url.includes('anthropic') ||
  m.url.includes('claude')
);

if (!anthropicMonitor) {
  console.error('Anthropic monitor not found. Available monitors:');
  monitors.forEach(m => console.error(`  - ${m.id}: ${m.name} (${m.url})`));
  process.exit(1);
}

console.log(`Found monitor: ${anthropicMonitor.id} - ${anthropicMonitor.name}`);

// Find Telegram channel
const channels = db.listNotificationChannels(false);
const telegramChannel = channels.find(c => c.type === 'telegram' && c.active);

if (!telegramChannel) {
  console.error('No active Telegram channel found');
  process.exit(1);
}

console.log(`Found Telegram channel: ${telegramChannel.id} - ${telegramChannel.name}`);

// Link monitor to Telegram channel if not already linked
const existingChannels = db.getMonitorChannels(anthropicMonitor.id, false);
const alreadyLinked = existingChannels.some(c => c.id === telegramChannel.id);

if (!alreadyLinked) {
  const linked = db.linkChannelToMonitor(anthropicMonitor.id, telegramChannel.id);
  if (linked) {
    console.log('Linked monitor to Telegram channel');
  } else {
    console.log('Monitor already linked to Telegram channel (or link failed)');
  }
} else {
  console.log('Monitor already linked to Telegram channel');
}

// Build services
const fetcher = new Fetcher();
const markdownConverter = new MarkdownConverter();
const differ = new Differ();
const notificationService = new NotificationService(db);
const summaryService = new SummaryService(db, {
  droid: new DroidSummarizer(),
  aisdk: new AISDKSummarizer(),
});
const monitorService = new MonitorService(
  db,
  fetcher,
  markdownConverter,
  differ,
  notificationService,
  summaryService,
);

// Update monitor URL to use raw GitHub URL if needed
const rawUrl = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
if (anthropicMonitor.url !== rawUrl) {
  console.log(`Updating monitor URL to raw GitHub format...`);
  db.updateMonitor(anthropicMonitor.id, { url: rawUrl });
  anthropicMonitor.url = rawUrl;
}

// Fetch the latest changelog content directly
console.log('\nFetching latest changelog...');
const changelogUrl = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const response = await fetch(changelogUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch changelog: ${response.statusText}`);
}
const changelogContent = await response.text();

// Extract the latest version section (2.1.0)
const versionMatch = changelogContent.match(/^## ([\d.]+)\s*\n([\s\S]*?)(?=^## |$)/m);
if (!versionMatch) {
  throw new Error('Could not find latest version in changelog');
}

const latestVersion = versionMatch[1];
const latestVersionContent = versionMatch[2].trim();

console.log(`Found latest version: ${latestVersion}`);

// Create a diff-like markdown for summary generation
const diffMarkdown = `# Changes Detected

## ➕ Added

\`\`\`diff
+ ${latestVersionContent.split('\n').join('\n+ ')}
\`\`\`
`;

// Generate summary from the latest version
console.log('Generating AI summary...');
const summaryResult = await summaryService.generateSummary(anthropicMonitor, diffMarkdown);

if (!summaryResult?.text) {
  console.error('Failed to generate summary. Checking AI settings...');
  const aiEnabled = db.getSetting('ai_summaries_enabled');
  const aiProvider = db.getSetting('ai_provider');
  console.error(`AI summaries enabled: ${aiEnabled}`);
  console.error(`AI provider: ${aiProvider}`);
  
  if (aiEnabled !== 'true') {
    console.error('AI summaries are not enabled. Please enable them in settings.');
  }
  
  // Create a simple text summary as fallback
  const simpleSummary = `**Anthropic Claude Code ${latestVersion} تم إصداره**\n\n${latestVersionContent.split('\n').slice(0, 20).join('\n')}`;
  console.log('Using simple text summary as fallback...');
  
  const tempChange = {
    id: 0,
    monitorId: anthropicMonitor.id,
    createdAt: new Date().toISOString(),
    aiSummary: simpleSummary,
    aiSummaryMeta: null,
    summary: null,
    diffMd: diffMarkdown,
    diffType: 'added' as const,
    releaseVersion: latestVersion,
    beforeSnapshotId: null,
    afterSnapshotId: null,
  } as any;
  
  const linkedChannels = db.getMonitorChannels(anthropicMonitor.id, true);
  if (linkedChannels.length > 0) {
    console.log('Sending simple summary to Telegram...');
    const sendResults = await notificationService.sendNotifications(
      tempChange,
      anthropicMonitor,
      linkedChannels,
      changelogUrl,
      { allowRepeat: true }
    );
    
    const successCount = sendResults.filter(r => r.ok).length;
    if (successCount > 0) {
      console.log(`✓ Sent summary to ${successCount} channel(s)`);
      process.exit(0);
    }
  }
  
  process.exit(1);
}

console.log('Summary generated successfully');

// Get Telegram channel
const linkedChannels = db.getMonitorChannels(anthropicMonitor.id, true);
if (linkedChannels.length === 0) {
  console.error('No Telegram channels linked to monitor');
  process.exit(1);
}

// Create a temporary change object for sending
const tempChange = {
  id: 0,
  monitorId: anthropicMonitor.id,
  createdAt: new Date().toISOString(),
  aiSummary: summaryResult.text,
  aiSummaryMeta: summaryResult.structured ? JSON.stringify(summaryResult.structured) : null,
  summary: null,
  diffMd: diffMarkdown,
  diffType: 'added' as const,
  releaseVersion: latestVersion,
  beforeSnapshotId: null,
  afterSnapshotId: null,
} as any;

// Send to Telegram
console.log('Sending summary to Telegram...');
const sendResults = await notificationService.sendNotifications(
  tempChange,
  anthropicMonitor,
  linkedChannels,
  changelogUrl,
  { allowRepeat: true }
);

const successCount = sendResults.filter(r => r.ok).length;
if (successCount > 0) {
  console.log(`✓ Sent summary to ${successCount} channel(s)`);
  console.log(`\nSummary sent:\n${summaryResult.text}`);
} else {
  console.error('✗ Failed to send notifications');
  sendResults.forEach(r => {
    if (!r.ok) {
      console.error(`  Error: ${r.error}`);
    }
  });
  
  // Show the generated summary anyway
  console.log('\n--- Generated Summary (Arabic) ---');
  console.log(summaryResult.text);
  console.log('--- End Summary ---\n');
  
  console.error('\nNote: Telegram configuration issue detected.');
  console.error('Please check your Telegram channel configuration:');
  console.error('  - Bot token is correct');
  console.error('  - Chat ID is correct');
  console.error('  - Bot has access to the chat');
  
  process.exit(1);
}

process.exit(0);

if (result.hasChange) {
  console.log(`✓ Change detected: ${result.message}`);
  
  // Get the latest change and ensure it has a summary
  const latestChanges = db.listChangesByMonitor(anthropicMonitor.id, 1);
  if (latestChanges.length > 0) {
    const latestChange = latestChanges[0];
    const linkedChannels = db.getMonitorChannels(anthropicMonitor.id, true);
    
    // Regenerate summary if missing or send existing one
    if (!latestChange.aiSummary && latestChange.diffMd) {
      console.log('Generating AI summary...');
      const summaryResult = await summaryService.generateSummary(anthropicMonitor, latestChange.diffMd);
      
      if (summaryResult?.text) {
        const updated = db.updateChangeAISummary(
          latestChange.id, 
          summaryResult.text, 
          summaryResult.structured ? JSON.stringify(summaryResult.structured) : null
        );
        
        if (updated && linkedChannels.length > 0) {
          console.log('Sending summary to Telegram...');
          const sendResults = await notificationService.sendNotifications(
            updated,
            anthropicMonitor,
            linkedChannels,
            undefined,
            { allowRepeat: true }
          );
          
          const successCount = sendResults.filter(r => r.ok).length;
          if (successCount > 0) {
            console.log(`✓ Sent summary to ${successCount} channel(s)`);
          } else {
            console.error('✗ Failed to send notifications');
            sendResults.forEach(r => {
              if (!r.ok) {
                console.error(`  Error: ${r.error}`);
              }
            });
          }
        }
      }
    } else if (latestChange.aiSummary && linkedChannels.length > 0) {
      console.log('Sending existing summary to Telegram...');
      const sendResults = await notificationService.sendNotifications(
        latestChange,
        anthropicMonitor,
        linkedChannels,
        undefined,
        { allowRepeat: true }
      );
      
      const successCount = sendResults.filter(r => r.ok).length;
      if (successCount > 0) {
        console.log(`✓ Sent summary to ${successCount} channel(s)`);
      } else {
        console.error('✗ Failed to send notifications');
        sendResults.forEach(r => {
          if (!r.ok) {
            console.error(`  Error: ${r.error}`);
          }
        });
      }
    }
  } else {
    console.log('Summary should be sent automatically via notifications');
  }
} else {
  console.log(`ℹ ${result.message}`);
  
  // If this was the first snapshot, check again to get actual changes
  if (result.message.includes('first snapshot')) {
    console.log('\nFirst snapshot created. Checking again for changes...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Brief delay
    result = await monitorService.checkMonitor(anthropicMonitor);
    
    if (result.hasChange) {
      console.log(`✓ Change detected: ${result.message}`);
      console.log('Summary should be sent automatically via notifications');
    }
  }
  
  // If still no change, check if there's a latest change we can send
  if (!result.hasChange) {
    const latestChanges = db.listChangesByMonitor(anthropicMonitor.id, 1);
    if (latestChanges.length > 0) {
      const latestChange = latestChanges[0];
      const linkedChannels = db.getMonitorChannels(anthropicMonitor.id, true);
      
      if (linkedChannels.length > 0 && latestChange.aiSummary) {
        console.log('\nSending latest change summary to Telegram...');
        const sendResults = await notificationService.sendNotifications(
          latestChange,
          anthropicMonitor,
          linkedChannels,
          undefined,
          { allowRepeat: true }
        );
        
        const successCount = sendResults.filter(r => r.ok).length;
        if (successCount > 0) {
          console.log(`✓ Sent summary to ${successCount} channel(s)`);
        } else {
          console.error('✗ Failed to send notifications');
          sendResults.forEach(r => {
            if (!r.ok) {
              console.error(`  Error: ${r.error}`);
            }
          });
        }
      } else if (linkedChannels.length > 0 && !latestChange.aiSummary) {
        console.log('\nLatest change has no AI summary. Regenerating...');
        const diffSource = latestChange.diffMd ?? '';
        const summaryResult = await summaryService.generateSummary(anthropicMonitor, diffSource);
        
        if (summaryResult?.text) {
          // Update the change with the new summary
          const updated = db.updateChangeAISummary(latestChange.id, summaryResult.text, summaryResult.structured ? JSON.stringify(summaryResult.structured) : null);
          
          if (updated) {
            console.log('Regenerated summary. Sending to Telegram...');
            const sendResults = await notificationService.sendNotifications(
              updated,
              anthropicMonitor,
              linkedChannels,
              undefined,
              { allowRepeat: true }
            );
            
            const successCount = sendResults.filter(r => r.ok).length;
            if (successCount > 0) {
              console.log(`✓ Sent summary to ${successCount} channel(s)`);
            } else {
              console.error('✗ Failed to send notifications');
            }
          }
        }
      } else {
        console.log('No summary available or no channels linked');
      }
    } else {
      console.log('No changes found yet. The monitor will check periodically.');
    }
  }
}

process.exit(0);

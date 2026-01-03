#!/usr/bin/env bun
// Quick script to backfill a few Amp blog posts as snapshots + changes,
// queue a weekly digest, and send it via the first active Telegram channel.
import { DB, type Monitor, type Change } from '../src/db';
import { ampcodeNewsRssPlugin } from '../src/lib/plugins/ampcode-news-rss';
import { NotificationService } from '../src/lib/notifier';
import { processDigestJob } from '../src/jobs/worker';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/changes.db';
const AMP_URL = 'https://ampcode.com/news.rss';

const ts = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

async function main() {
  const db = new DB(DATABASE_PATH);

  // 0) Purge any existing Amp data completely (monitors, snapshots, changes, events)
  const sqlite = db.getRawDB();
  const ampMonitors = db.listMonitors(false).filter((m) => /ampcode\.com\/news\.rss$/i.test(m.url) || /\bamp\b/i.test(m.name));
  for (const m of ampMonitors) {
    try {
      sqlite.prepare('DELETE FROM job_events WHERE monitor_id = ?').run(m.id as any);
    } catch {}
    try {
      sqlite.prepare('DELETE FROM settings WHERE key LIKE ?').run(`monitor:${m.id}:%`);
    } catch {}
    try {
      // Cascades will remove snapshots, changes, notification events, digest items, and links
      db.deleteMonitor(m.id);
      console.log(`[${ts()}] purged monitor ${m.id} (${m.name})`);
    } catch (e) {
      console.warn(`[${ts()}] purge failed for monitor ${m.id}:`, e);
    }
  }

  // 1) Ensure monitor exists
  let monitor: Monitor | undefined = db.listMonitors().find((m) => m.url === AMP_URL);
  if (!monitor) {
    monitor = db.createMonitor({ name: 'Amp News', url: AMP_URL, intervalMinutes: 60, type: 'xml', selector: null, includeLink: true, active: true, lastCheckedAt: null, createdAt: new Date().toISOString() } as any);
    console.log(`[${ts()}] created monitor: ${monitor.id}`);
  }

  // 2) Find an active Telegram channel (or any active channel) and link with weekly_digest
  const allChannels = db.listNotificationChannels(true);
  if (!allChannels || allChannels.length === 0) {
    console.error('No active notification channels found. Create one in the TUI first.');
    process.exit(1);
  }
  const channel = allChannels.find((c) => c.type === 'telegram') || allChannels[0];
  // Link (ignore if already linked)
  try { db.linkChannelToMonitor(monitor.id, channel.id); } catch {}
  db.updateMonitorChannelOptions(monitor.id, channel.id, { deliveryMode: 'weekly_digest', includeLink: true });
  console.log(`[${ts()}] using channel: ${channel.name} (${channel.type})`);

  // 3) Fetch the feed and parse slices
  const res = await fetch(AMP_URL, { headers: { 'User-Agent': 'changes/dev backfill' } });
  if (!res.ok) {
    console.error(`Failed to fetch feed: HTTP ${res.status}`);
    process.exit(1);
  }
  const xml = await res.text();
  const t = ampcodeNewsRssPlugin.transform({ content: xml }, monitor);
  if (!('releases' in t) || !t.releases || t.releases.length === 0) {
    console.error('No items parsed from feed.');
    process.exit(1);
  }

  // 4) Backfill the last N posts as changes (no AI)
  const N = Math.min(3, t.releases.length);
  const slices = t.releases.slice(0, N).reverse(); // oldest → newest for stable chaining
  const createdChanges: Change[] = [];

  for (const slice of slices) {
    // If a change already exists for this version, reuse it
    const existingChange = db.listChangesByMonitor(monitor.id, 200).find((c) => c.releaseVersion === slice.version);
    if (existingChange) {
      createdChanges.push(existingChange);
      continue;
    }

    // Ensure we have a snapshot for this version; create if missing
    let snapshot = db.getSnapshotByVersion(monitor.id, slice.version);
    if (!snapshot) {
      const title = (slice as any).title || slice.version;
      const markdown = `## ${title}\n\n${slice.markdown}`.trim();
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(markdown);
      const contentHash = hasher.digest('hex');
      snapshot = db.createSnapshot({
        monitorId: monitor.id,
        contentHash,
        contentMd: markdown,
        releaseVersion: slice.version,
      });
    }

    // Build deterministic summary text (heading + description + link)
    const aiSummary = ampcodeNewsRssPlugin.formatAISummary!({ monitor, slice, aiText: null, options: undefined }) || '';

    const change = db.createChange({
      monitorId: monitor.id,
      beforeSnapshotId: null,
      afterSnapshotId: snapshot.id,
      summary: null,
      aiSummary,
      diffMd: null,
      diffType: 'addition',
      releaseVersion: slice.version,
      aiSummaryMeta: null,
    });
    createdChanges.push(change);
  }

  // 5) Queue a digest for 90 seconds from now
  const digestAt = new Date(Date.now() + 90_000).toISOString();
  const digestKey = new Date().toISOString().slice(0, 10);
  for (const change of createdChanges) {
    db.addChannelDigestItem({ monitorId: monitor.id, channelId: channel.id as any, changeId: change.id, digestAt, digestKey });
  }
  console.log(`[${ts()}] queued ${createdChanges.length} changes for digest at ${digestAt}`);

  // 6) Send the digest now (for testing) instead of waiting for scheduler
  const notificationService = new NotificationService(db);
  const result = await processDigestJob(db, { monitorId: monitor.id as any, channelId: channel.id as any, digestAt }, notificationService);
  console.log(`[${ts()}] digest result:`, result);

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

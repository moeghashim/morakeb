import { describe, it, expect, beforeEach } from 'bun:test';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DB } from '../../src/db';
import { NotificationService } from '../../src/lib/notifier';
import type { Notifier } from '../../src/lib/notification/types';
import { processDigestJob, type DigestPayload } from '../../src/jobs/worker';

describe('weekly digest processing', () => {
  let db: DB;

  beforeEach(() => {
    db = new DB(':memory:');
    migrate((db as unknown as { db: any }).db, { migrationsFolder: './drizzle' });
  });

  it('sends a bundled digest and records events', async () => {
    const monitor = db.createMonitor({
      name: 'Example Monitor',
      url: 'https://example.com',
      intervalMinutes: 60,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const channel = db.createNotificationChannel({
      name: 'Digest Telegram',
      type: 'telegram',
      config: { botToken: 'tok', chatId: '123' },
      active: true,
    });
    db.linkChannelToMonitor(monitor.id, channel.id);
    db.updateMonitorChannelOptions(monitor.id, channel.id, { deliveryMode: 'weekly_digest' });

    const before = db.createSnapshot({
      monitorId: monitor.id,
      contentHash: 'hash-before',
      contentMd: '# v1.0',
    });
    const after = db.createSnapshot({
      monitorId: monitor.id,
      contentHash: 'hash-after',
      contentMd: '# v1.1',
      releaseVersion: 'v1.1.0',
    });

    const summaryMeta = {
      status: 'ok',
      title: 'Example v1.1.0 released',
      features: ['Add weekly digest support'],
      fixes: [],
      shouldNotify: true,
      importance: 'medium',
    };

    const change = db.createChange({
      monitorId: monitor.id,
      beforeSnapshotId: before.id,
      afterSnapshotId: after.id,
      summary: 'Digest summary',
      aiSummary: '**Example v1.1.0 released**\n**Features**\n- Add weekly digest support',
      aiSummaryMeta: JSON.stringify(summaryMeta),
      diffMd: '* diff *',
      diffType: 'addition',
      releaseVersion: 'v1.1.0',
    });

    const digestAt = new Date(Date.now() - 60_000).toISOString();
    const digestKey = digestAt.slice(0, 10);
    db.addChannelDigestItem({
      monitorId: monitor.id,
      channelId: channel.id,
      changeId: change.id,
      digestAt,
      digestKey,
    });

    const sent: Array<{ summary: string }> = [];
    const fakeNotifier: Notifier<any> = {
      async send(changePayload) {
        sent.push({ summary: changePayload.aiSummary ?? '' });
        return true;
      },
    };
    const notificationService = new NotificationService(db, {
      overrides: { telegram: fakeNotifier },
      logger: { error: () => {}, info: () => {} },
    });

    const payload: DigestPayload = { monitorId: monitor.id, channelId: channel.id, digestAt };
    const result = await processDigestJob(db, payload, notificationService);

    expect(result.status).toBe('sent');
    if (result.status === 'sent') {
      expect(result.items).toBe(1);
      expect(result.summary).toContain('Add weekly digest support');
    }
    expect(sent.length).toBe(1);
    expect(sent[0]?.summary).toContain('Add weekly digest support');

    const events = db.listNotificationEventsForChange(change.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.status).toBe('sent');

    const channels = db.getMonitorChannels(monitor.id, true);
    expect(channels[0]?.lastDigestAt).toBe(digestAt);

    const sqlite = (db as unknown as { sqlite: any }).sqlite;
    const rows = sqlite
      .prepare('select sent_at from channel_digest_items where channel_id = ?')
      .all(channel.id) as Array<{ sent_at: string | null }>;
    expect(rows[0]?.sent_at).not.toBeNull();
  });

  it('marks items as skipped when the monitor is inactive', async () => {
    const monitor = db.createMonitor({
      name: 'Inactive Monitor',
      url: 'https://example.com/inactive',
      intervalMinutes: 60,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const channel = db.createNotificationChannel({
      name: 'Digest Telegram',
      type: 'telegram',
      config: { botToken: 'tok', chatId: '999' },
      active: true,
    });
    db.linkChannelToMonitor(monitor.id, channel.id);
    db.updateMonitorChannelOptions(monitor.id, channel.id, { deliveryMode: 'weekly_digest' });

    const baseSnapshot = db.createSnapshot({
      monitorId: monitor.id,
      contentHash: 'hash',
      contentMd: 'content',
    });

    const change = db.createChange({
      monitorId: monitor.id,
      beforeSnapshotId: baseSnapshot.id,
      afterSnapshotId: baseSnapshot.id,
      summary: 'noop',
      aiSummary: null,
      aiSummaryMeta: null,
      diffMd: null,
      diffType: 'addition',
      releaseVersion: null,
    });

    const digestAt = new Date(Date.now() - 60_000).toISOString();
    const digestKey = digestAt.slice(0, 10);
    db.addChannelDigestItem({
      monitorId: monitor.id,
      channelId: channel.id,
      changeId: change.id,
      digestAt,
      digestKey,
    });

    // deactivate monitor before processing
    db.updateMonitor(monitor.id, { active: false });

    const notificationService = new NotificationService(db, {
      overrides: { telegram: { send: async () => true } as Notifier<any> },
    });

    const payload: DigestPayload = { monitorId: monitor.id, channelId: channel.id, digestAt };
    const outcome = await processDigestJob(db, payload, notificationService);

    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'sent') {
      expect(outcome.reason).toContain('monitor');
    }

    const sqlite = (db as unknown as { sqlite: any }).sqlite;
    const rows = sqlite
      .prepare('select sent_at from channel_digest_items where channel_id = ?')
      .all(channel.id) as Array<{ sent_at: string | null }>;
    expect(rows[0]?.sent_at).not.toBeNull();
  });
});

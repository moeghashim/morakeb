import { describe, it, expect } from 'bun:test';
import { DB } from '../../src/db';
import { NotificationService } from '../../src/lib/notifier';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

describe('NotificationService notification_events logging', () => {
  it('records notification outcomes in notification_events', async () => {
    const db = new DB(':memory:');
    migrate((db as any).db, { migrationsFolder: './drizzle' });
    const monitor = db.createMonitor({
      name: 'Example',
      url: 'https://example.com',
      intervalMinutes: 5,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const before = db.createSnapshot({ monitorId: monitor.id, contentHash: 'before', contentMd: 'before content' });
    const after = db.createSnapshot({ monitorId: monitor.id, contentHash: 'after', contentMd: 'after content' });
    const change = db.createChange({
      monitorId: monitor.id,
      releaseVersion: null,
      beforeSnapshotId: before.id,
      afterSnapshotId: after.id,
      summary: 'example',
      aiSummary: 'AI summary',
      aiSummaryMeta: null,
      diffMd: 'diff',
      diffType: 'addition',
    });

    const channel = db.createNotificationChannel({
      name: 'Telegram Test',
      type: 'telegram',
      config: { botToken: 'token', chatId: '123' },
      active: true,
    });
    db.linkChannelToMonitor(monitor.id, channel.id);

    const svc = new NotificationService(db, { overrides: { telegram: { send: async () => true } as any } });

    const results = await svc.sendNotifications(change, monitor, db.getMonitorChannels(monitor.id, true));
    expect(results[0]?.ok).toBe(true);

    const events = db.listNotificationEventsForChange(change.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].status).toBe('sent');

    db.close();
  });
});

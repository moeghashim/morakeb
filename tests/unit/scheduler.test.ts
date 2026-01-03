import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DB } from '../../src/db';
import { Scheduler } from '../../src/scheduler';
import { cleanupSqliteFiles } from '../helpers/cleanup';

type DrizzleDb = ReturnType<typeof drizzle>;

type QueueCall = { type: string; payload: unknown };

const TMP_DB = './tmp/test-scheduler.db';

describe('Scheduler', () => {
  let db: DB;

  beforeAll(() => {
    db = new DB(TMP_DB);
    const internal = db as unknown as { db: DrizzleDb };
    migrate(internal.db, { migrationsFolder: './drizzle' });
  });

  afterAll(() => {
    try { db.close(); } catch {}
    try { cleanupSqliteFiles(TMP_DB); } catch {}
  });

  it('enqueues due monitors and digest jobs', async () => {
    const calls: QueueCall[] = [];
    const queue = {
      add: (type: string, payload: unknown) => {
        calls.push({ type, payload });
        return { id: calls.length };
      },
    };

    const scheduler = new Scheduler(db, 60000, queue as unknown as import('../../src/jobs/queue').JobsQueue);

    const due = db.createMonitor({
      name: 'Due',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });
    const notDue = db.createMonitor({
      name: 'NotDue',
      url: 'https://example.com',
      intervalMinutes: 60,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });
    db.updateMonitorLastChecked(notDue.id, new Date().toISOString());

    const snapA = db.createSnapshot({ monitorId: due.id, contentHash: 'h1', contentMd: 'a', releaseVersion: null });
    const snapB = db.createSnapshot({ monitorId: due.id, contentHash: 'h2', contentMd: 'b', releaseVersion: null });
    const change = db.createChange({
      monitorId: due.id,
      beforeSnapshotId: snapA.id,
      afterSnapshotId: snapB.id,
      summary: 's',
      diffMd: 'd',
      diffType: 'modification',
      releaseVersion: null,
      aiSummary: null,
      aiSummaryMeta: null,
    });
    const channel = db.createNotificationChannel({ name: 'tg', type: 'telegram', config: { botToken: 't', chatId: '1' }, active: true });
    const digestAt = new Date(Date.now() - 60_000).toISOString();
    db.addChannelDigestItem({
      monitorId: due.id,
      channelId: channel.id,
      changeId: change.id,
      digestAt,
      digestKey: digestAt.slice(0, 10),
    });

    await scheduler.checkNow();

    const monitorCalls = calls.filter((c) => c.type === 'monitor.check');
    const digestCalls = calls.filter((c) => c.type === 'notification.digest');
    expect(monitorCalls.length).toBe(1);
    expect(digestCalls.length).toBe(1);
  });
});

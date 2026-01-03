import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DB } from '../../src/db';
import { MonitorService } from '../../src/lib/monitor-service';
import type { CheckResult } from '../../src/lib/fetcher';
import type { Monitor, Change } from '../../src/db/schema';
import { cleanupSqliteFiles } from '../helpers/cleanup';

const makeDbPath = () => `./tmp/test-monitor-service-${Date.now()}-${Math.floor(Math.random() * 10000)}.db`;

type DrizzleDb = ReturnType<typeof drizzle>;

type SummaryResult = { text: string | null; structured: null };

type NotificationCall = { change: Change; monitor: Monitor };

class FakeFetcher {
  constructor(private result: CheckResult) {}
  async check(): Promise<CheckResult> {
    return this.result;
  }
}

class FakeMarkdownConverter {
  convert(html: string): string {
    return html;
  }
  convertWithSelector(html: string): string {
    return html;
  }
}

class FakeDiffer {
  generateDiff(): { diffType: 'modification'; summary: string; diffMarkdown: string; changes: Array<{ type: 'added'; content: string }> } {
    return {
      diffType: 'modification',
      summary: 'Summary',
      diffMarkdown: 'Diff',
      changes: [{ type: 'added', content: 'Line' }],
    };
  }
}

class FakeSummaryService {
  async generateSummary(): Promise<SummaryResult> {
    return { text: 'AI summary', structured: null };
  }
}

class FakeNotificationService {
  calls: NotificationCall[] = [];
  async sendNotifications(change: Change, monitor: Monitor): Promise<Array<{ ok: boolean }>> {
    this.calls.push({ change, monitor });
    return [{ ok: true }];
  }
}

function hashContent(content: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(content);
  return hasher.digest('hex');
}

describe('MonitorService paths', () => {
  let db: DB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeDbPath();
    db = new DB(dbPath);
    const internal = db as unknown as { db: DrizzleDb };
    migrate(internal.db, { migrationsFolder: './drizzle' });
  });

  afterEach(() => {
    try { db.close(); } catch {}
    try { cleanupSqliteFiles(dbPath); } catch {}
  });

  it('skips when content hash has not changed', async () => {
    const monitor = db.createMonitor({
      name: 'M',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const content = 'same content';
    db.createSnapshot({
      monitorId: monitor.id,
      contentHash: hashContent(content),
      contentMd: content,
      releaseVersion: null,
    });

    const fetcher = new FakeFetcher({ success: true, content, statusCode: 200, contentType: 'text/plain' });
    const svc = new MonitorService(
      db,
      fetcher as unknown as import('../../src/lib/fetcher').Fetcher,
      new FakeMarkdownConverter() as unknown as import('../../src/lib/markdown').MarkdownConverter,
      new FakeDiffer() as unknown as import('../../src/lib/differ').Differ,
      new FakeNotificationService() as unknown as import('../../src/lib/notifier').NotificationService,
      new FakeSummaryService() as unknown as import('../../src/lib/summary-service').SummaryService,
    );

    const res = await svc.checkMonitor(monitor);
    expect(res.hasChange).toBeFalse();
    expect(db.listSnapshots(monitor.id, 50).length).toBe(1);
  });

  it('creates change and sends notifications', async () => {
    const monitor = db.createMonitor({
      name: 'M',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });
    const channel = db.createNotificationChannel({ name: 'tg', type: 'telegram', config: { botToken: 't', chatId: '1' }, active: true });
    db.linkChannelToMonitor(monitor.id, channel.id);

    const oldContent = 'old';
    db.createSnapshot({
      monitorId: monitor.id,
      contentHash: hashContent(oldContent),
      contentMd: oldContent,
      releaseVersion: null,
    });

    const fetcher = new FakeFetcher({ success: true, content: 'new', statusCode: 200, contentType: 'text/plain' });
    const notifier = new FakeNotificationService();
    db.setSetting('ai_summaries_enabled', 'true');

    const svc = new MonitorService(
      db,
      fetcher as unknown as import('../../src/lib/fetcher').Fetcher,
      new FakeMarkdownConverter() as unknown as import('../../src/lib/markdown').MarkdownConverter,
      new FakeDiffer() as unknown as import('../../src/lib/differ').Differ,
      notifier as unknown as import('../../src/lib/notifier').NotificationService,
      new FakeSummaryService() as unknown as import('../../src/lib/summary-service').SummaryService,
    );

    const res = await svc.checkMonitor(monitor);
    expect(res.hasChange).toBeTrue();
    expect(db.listChangesByMonitor(monitor.id, 50).length).toBe(1);
    expect(notifier.calls.length).toBe(1);
  });

  it('skips when plugin returns skip', async () => {
    const monitor = db.createMonitor({
      name: 'Codex',
      url: 'https://github.com/openai/codex/releases.atom',
      intervalMinutes: 1,
      type: 'xml',
      selector: null,
      includeLink: true,
      active: true,
    });
    db.setSetting(`monitor:${monitor.id}:plugin`, JSON.stringify({ id: 'codex-cli-atom', options: { ignorePreReleases: true, requireNotes: true } }));

    const fetcher = new FakeFetcher({ success: true, content: '<feed></feed>', statusCode: 200, contentType: 'text/xml' });
    const svc = new MonitorService(
      db,
      fetcher as unknown as import('../../src/lib/fetcher').Fetcher,
      new FakeMarkdownConverter() as unknown as import('../../src/lib/markdown').MarkdownConverter,
      new FakeDiffer() as unknown as import('../../src/lib/differ').Differ,
      new FakeNotificationService() as unknown as import('../../src/lib/notifier').NotificationService,
      new FakeSummaryService() as unknown as import('../../src/lib/summary-service').SummaryService,
    );

    const res = await svc.checkMonitor(monitor);
    expect(res.hasChange).toBeFalse();
    expect(db.listSnapshots(monitor.id, 50).length).toBe(0);
  });

  it('creates first snapshot without a change', async () => {
    const monitor = db.createMonitor({
      name: 'First',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const fetcher = new FakeFetcher({ success: true, content: 'first', statusCode: 200, contentType: 'text/plain' });
    const svc = new MonitorService(
      db,
      fetcher as unknown as import('../../src/lib/fetcher').Fetcher,
      new FakeMarkdownConverter() as unknown as import('../../src/lib/markdown').MarkdownConverter,
      new FakeDiffer() as unknown as import('../../src/lib/differ').Differ,
      new FakeNotificationService() as unknown as import('../../src/lib/notifier').NotificationService,
      new FakeSummaryService() as unknown as import('../../src/lib/summary-service').SummaryService,
    );

    const res = await svc.checkMonitor(monitor);
    expect(res.hasChange).toBeFalse();
    expect(db.listSnapshots(monitor.id, 50).length).toBe(1);
    expect(db.listChangesByMonitor(monitor.id, 50).length).toBe(0);
  });

  it('queues weekly digest items for weekly channels', async () => {
    const monitor = db.createMonitor({
      name: 'Weekly',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const channel = db.createNotificationChannel({
      name: 'Weekly TG',
      type: 'telegram',
      config: { botToken: 't', chatId: '1' },
      active: true,
    });
    db.linkChannelToMonitor(monitor.id, channel.id);
    db.updateMonitorChannelOptions(monitor.id, channel.id, { deliveryMode: 'weekly_digest' });

    const oldContent = 'old';
    db.createSnapshot({
      monitorId: monitor.id,
      contentHash: hashContent(oldContent),
      contentMd: oldContent,
      releaseVersion: null,
    });

    const fetcher = new FakeFetcher({ success: true, content: 'new', statusCode: 200, contentType: 'text/plain' });
    const notifier = new FakeNotificationService();

    const svc = new MonitorService(
      db,
      fetcher as unknown as import('../../src/lib/fetcher').Fetcher,
      new FakeMarkdownConverter() as unknown as import('../../src/lib/markdown').MarkdownConverter,
      new FakeDiffer() as unknown as import('../../src/lib/differ').Differ,
      notifier as unknown as import('../../src/lib/notifier').NotificationService,
      new FakeSummaryService() as unknown as import('../../src/lib/summary-service').SummaryService,
    );

    const res = await svc.checkMonitor(monitor);
    expect(res.hasChange).toBeTrue();
    expect(notifier.calls.length).toBe(0);

    const sqlite = (db as unknown as { sqlite: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<{ id: number }> } } }).sqlite;
    const rows = sqlite
      .prepare('select id from channel_digest_items where monitor_id = ?')
      .all(monitor.id);
    expect(rows.length).toBeGreaterThan(0);
  });
});

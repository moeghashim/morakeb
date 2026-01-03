import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DB } from '../../src/db';
import { MonitorService } from '../../src/lib/monitor-service';
import type { CheckResult } from '../../src/lib/fetcher';
import type { Change, Monitor } from '../../src/db/schema';
import { cleanupSqliteFiles } from '../helpers/cleanup';

const makeDbPath = () => `./tmp/test-monitor-releases-${Date.now()}-${Math.floor(Math.random() * 10000)}.db`;

type DrizzleDb = ReturnType<typeof drizzle>;

type NotificationCall = { change: Change; monitor: Monitor };

type SummaryResult = { text: string | null; structured: null };

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

function sampleRss(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>Factory CLI v1.2.0</title>
        <description><![CDATA[<ul><li>Added A</li></ul>]]></description>
      </item>
      <item>
        <title>Factory CLI v1.1.0</title>
        <description><![CDATA[<ul><li>Added B</li></ul>]]></description>
      </item>
      <item>
        <title>Factory CLI v1.0.0</title>
        <description><![CDATA[<ul><li>Added C</li></ul>]]></description>
      </item>
    </channel>
  </rss>`;
}

describe('MonitorService release paths', () => {
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

  it('aggregates notifications for multiple new releases', async () => {
    const monitor = db.createMonitor({
      name: 'Factory CLI',
      url: 'https://docs.factory.ai/changelog/cli-updates/rss.xml',
      intervalMinutes: 60,
      type: 'xml',
      selector: null,
      includeLink: true,
      active: true,
    });

    db.setSetting(`monitor:${monitor.id}:plugin`, JSON.stringify({ id: 'factory-cli-rss', options: {} }));

    const existing = db.createSnapshot({
      monitorId: monitor.id,
      contentHash: 'hash-old',
      contentMd: '# v1.0.0',
      releaseVersion: 'v1.0.0',
    });

    const channel = db.createNotificationChannel({
      name: 'tg',
      type: 'telegram',
      config: { botToken: 't', chatId: '1' },
      active: true,
    });
    db.linkChannelToMonitor(monitor.id, channel.id);

    const fetcher = new FakeFetcher({ success: true, content: sampleRss(), statusCode: 200, contentType: 'text/xml' });
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

    const changes = db.listChangesByMonitor(monitor.id, 50);
    expect(changes.length).toBe(2);

    // aggregated notification should be sent once
    expect(notifier.calls.length).toBe(1);

    const v12 = db.getSnapshotByVersion(monitor.id, 'v1.2.0');
    expect(v12).toBeTruthy();
    expect(existing).toBeTruthy();
  });
});

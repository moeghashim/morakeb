import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { DB } from '../../src/db';
import { cleanupSqliteFiles } from '../helpers/cleanup';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const TMP_DB = './tmp/test-channels.db';

describe('DB notification channels', () => {
  let db: DB;
  beforeAll(() => {
    db = new DB(TMP_DB);
    // run migrations so tables exist
    // @ts-ignore accessing private for test bootstrap
    migrate((db as any).db, { migrationsFolder: './drizzle' });
  });
  afterAll(() => {
    try { (db as any)?.close?.(); } catch {}
    try { cleanupSqliteFiles(TMP_DB); } catch {}
  });

  it('creates, lists, and retrieves typed configs', () => {
    const ch1 = db.createNotificationChannel({ name: 'tg', type: 'telegram', config: { botToken: 't', chatId: '1' }, active: true });

    expect(ch1.id).toBeDefined();
    const all = db.listNotificationChannels();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const monitor = db.createMonitor({ name: 'm', url: 'https://e.com', intervalMinutes: 1, type: 'webpage', selector: null, includeLink: true, active: true });
    db.linkChannelToMonitor(monitor.id, ch1.id);

    const typed = db.getMonitorChannels(monitor.id, true);
    expect(typed.find(c => c.type === 'telegram')?.config).toBeTruthy();
  });
});

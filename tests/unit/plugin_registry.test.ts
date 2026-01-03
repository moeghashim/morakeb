import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DB } from '../../src/db';
import { resolvePlugin } from '../../src/lib/plugins/registry';
import { cleanupSqliteFiles } from '../helpers/cleanup';

type DrizzleDb = ReturnType<typeof drizzle>;

const TMP_DB = './tmp/test-plugin-registry.db';

describe('plugin registry', () => {
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

  it('uses explicit plugin setting', () => {
    const monitor = db.createMonitor({
      name: 'Factory',
      url: 'https://docs.factory.ai/changelog/cli-updates/rss.xml',
      intervalMinutes: 60,
      type: 'xml',
      selector: null,
      includeLink: true,
      active: true,
    });

    db.setSetting(`monitor:${monitor.id}:plugin`, JSON.stringify({ id: 'factory-cli-rss', options: {} }));
    const resolved = resolvePlugin(monitor, db);
    expect(resolved.plugin?.id).toBe('factory-cli-rss');
  });

  it('auto-detects when examples are enabled', () => {
    const monitor = db.createMonitor({
      name: 'Factory',
      url: 'https://docs.factory.ai/changelog/cli-updates/rss.xml',
      intervalMinutes: 60,
      type: 'xml',
      selector: null,
      includeLink: true,
      active: true,
    });

    db.setSetting('example_plugins_enabled', 'true');
    const resolved = resolvePlugin(monitor, db);
    expect(resolved.plugin?.id).toBe('factory-cli-rss');
  });
});

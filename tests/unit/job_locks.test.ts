import { describe, it, expect, afterAll } from 'bun:test';
import { cleanupSqliteFiles } from '../helpers/cleanup';
import { DB } from '../../src/db';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '../../src/db/schema';
import { randomUUID } from 'node:crypto';

describe('job_locks table', () => {
  let path = '';
  afterAll(() => { try { if (path) cleanupSqliteFiles(path); } catch {} });

  it('acquires, prevents duplicates, and releases locks', () => {
    path = `./tmp/test-${randomUUID()}.db`;
    const sqlite = new Database(path);
    const dz = drizzle(sqlite, { schema });
    migrate(dz, { migrationsFolder: './drizzle' });
    sqlite.close();

    const db = new DB(path);
    const ok1 = db.acquireJobLock('monitor.check', '1', 100);
    expect(ok1).toBe(true);
    const ok2 = db.acquireJobLock('monitor.check', '1', 101);
    expect(ok2).toBe(false);
    db.releaseJobLock('monitor.check', '1');
    const ok3 = db.acquireJobLock('monitor.check', '1', 102);
    expect(ok3).toBe(true);
    db.releaseJobLock('monitor.check', '1');
    db.close();
  });
});


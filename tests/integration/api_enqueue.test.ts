import { describe, it, expect, afterAll } from 'bun:test';
import { cleanupSqliteFiles } from '../helpers/cleanup';
import { DB } from '../../src/db';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '../../src/db/schema';
import { randomUUID } from 'node:crypto';
import { createQueue } from '../../src/jobs/queue';
import { Scheduler } from '../../src/scheduler';
import { createApiServer } from '../../src/api';

describe('API enqueue monitor.check', () => {
  let path = '';
  afterAll(() => { try { if (path) cleanupSqliteFiles(path); } catch {} });

  it('returns 202 and a job id', async () => {
    path = `./tmp/test-${randomUUID()}.db`;
    const sqlite = new Database(path);
    const dz = drizzle(sqlite, { schema });
    migrate(dz, { migrationsFolder: './drizzle' });
    sqlite.close();

    const db = new DB(path);
    const queue = createQueue(db);
    const scheduler = new Scheduler(db, 60_000, queue);
    const app = createApiServer(db, scheduler, queue);

    const monitor = db.createMonitor({
      name: 'Test',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'markdown',
      active: true,
    });

    const res = await app.request(`/api/monitors/${monitor.id}/check`, { method: 'POST' });
    expect(res.status).toBe(202);
    function isEnqueueResp(x: unknown): x is { accepted: boolean; jobId: number } {
      return !!x && typeof x === 'object' && 'accepted' in x && 'jobId' in x &&
        typeof (x as any).accepted === 'boolean' && typeof (x as any).jobId === 'number';
    }
    const bodyUnknown = await res.json();
    if (!isEnqueueResp(bodyUnknown)) {
      throw new Error('Unexpected response shape');
    }
    expect(bodyUnknown.accepted).toBe(true);
    expect(typeof bodyUnknown.jobId).toBe('number');

    queue.close();
    db.close();
  });
});

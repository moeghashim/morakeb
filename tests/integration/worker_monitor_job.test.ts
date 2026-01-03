import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { randomUUID } from 'node:crypto';
import * as schema from '../../src/db/schema';
import { DB } from '../../src/db';
import { createQueue } from '../../src/jobs/queue';
import { startWorkers } from '../../src/jobs/worker';
import { cleanupSqliteFiles } from '../helpers/cleanup';
import type { JobsQueue } from '../../src/jobs/queue';

async function waitForJobEvent(db: DB, jobId: number): Promise<{ status: string; message: string | null }>{
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const events = db.listJobEvents({ jobId, limit: 5 });
    const done = events.find((e) => e.status === 'done' || e.status === 'failed');
    if (done) return { status: done.status, message: done.message };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for job event');
}

describe('worker monitor.check', () => {
  let path = '';
  let db: DB;
  let queue: JobsQueue;
  let stopWorkers: (() => Promise<void>) | null = null;
  let originalFetch: typeof fetch;

  beforeAll(() => {
    path = `./tmp/test-${randomUUID()}.db`;
    const sqlite = new Database(path);
    const dz = drizzle(sqlite, { schema });
    migrate(dz, { migrationsFolder: './drizzle' });
    sqlite.close();

    db = new DB(path);
    queue = createQueue(db);

    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } });
    }) as unknown as typeof fetch;

    const { stop } = startWorkers(db, queue, 1);
    stopWorkers = stop;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (stopWorkers) await stopWorkers();
    queue.close();
    db.close();
    cleanupSqliteFiles(path);
  });

  it('processes a monitor.check job', async () => {
    const monitor = db.createMonitor({
      name: 'Test Monitor',
      url: 'https://example.com/one',
      intervalMinutes: 1,
      type: 'markdown',
      active: true,
      includeLink: true,
      selector: null,
      lastCheckedAt: null,
    });

    const { id: jobId } = queue.add('monitor.check', { monitorId: monitor.id });
    const event = await waitForJobEvent(db, jobId);

    expect(event.status).toBe('done');
    expect(event.message).toBe('no change');

    const updated = db.getMonitor(monitor.id);
    expect(updated?.lastCheckedAt).toBeTruthy();
  });

  it('skips inactive monitors', async () => {
    const monitor = db.createMonitor({
      name: 'Inactive',
      url: 'https://example.net/two',
      intervalMinutes: 1,
      type: 'markdown',
      active: false,
      includeLink: true,
      selector: null,
      lastCheckedAt: null,
    });

    const { id: jobId } = queue.add('monitor.check', { monitorId: monitor.id });
    const event = await waitForJobEvent(db, jobId);

    expect(event.status).toBe('done');
    expect(event.message).toBe('monitor missing or inactive');
  });
});

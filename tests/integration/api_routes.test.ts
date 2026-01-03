import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createApiServer } from '../../src/api';
import { DB } from '../../src/db';
import { cleanupSqliteFiles } from '../helpers/cleanup';
import type { JobsQueue } from '../../src/jobs/queue';
import type { Scheduler } from '../../src/scheduler';

type DrizzleDb = ReturnType<typeof drizzle>;

type QueueCall = { type: string; payload: unknown };

const TMP_DB = './tmp/test-api.db';

describe('API routes', () => {
  let db: DB;
  let queueCalls: QueueCall[];
  let checkAllCalled = false;

  beforeAll(() => {
    db = new DB(TMP_DB);
    const internal = db as unknown as { db: DrizzleDb };
    migrate(internal.db, { migrationsFolder: './drizzle' });
    queueCalls = [];
  });

  afterAll(() => {
    try { db.close(); } catch {}
    try { cleanupSqliteFiles(TMP_DB); } catch {}
  });

  function buildApp() {
    const queue = {
      add: (type: string, payload: unknown) => {
        queueCalls.push({ type, payload });
        return { id: queueCalls.length };
      },
    } as unknown as JobsQueue;

    const scheduler = {
      checkNow: async () => { checkAllCalled = true; },
    } as unknown as Scheduler;

    return createApiServer(db, scheduler, queue);
  }

  it('creates, updates, and deletes monitors', async () => {
    const app = buildApp();

    const createRes = await app.request('/api/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        url: 'https://example.com',
        intervalMinutes: 5,
        type: 'webpage',
        active: true,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { monitor: { id: number } };

    const updateRes = await app.request(`/api/monitors/${created.monitor.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    expect(updateRes.status).toBe(200);

    const deleteRes = await app.request(`/api/monitors/${created.monitor.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
  });

  it('rejects non-http URLs', async () => {
    const app = buildApp();
    const res = await app.request('/api/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad',
        url: 'file:///etc/passwd',
        intervalMinutes: 5,
        type: 'webpage',
        active: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('manages channels and monitor links', async () => {
    const app = buildApp();

    const monitorRes = await app.request('/api/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'M',
        url: 'https://example.com',
        intervalMinutes: 5,
        type: 'webpage',
        active: true,
      }),
    });
    const monitor = (await monitorRes.json()) as { monitor: { id: number } };

    const channelRes = await app.request('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TG',
        type: 'telegram',
        config: { botToken: 't', chatId: '1' },
        active: true,
      }),
    });
    expect(channelRes.status).toBe(201);
    const channel = (await channelRes.json()) as { channel: { id: number } };

    const linkRes = await app.request(`/api/monitors/${monitor.monitor.id}/channels/${channel.channel.id}`, { method: 'POST' });
    expect(linkRes.status).toBe(200);

    const listRes = await app.request(`/api/monitors/${monitor.monitor.id}/channels`);
    const listed = (await listRes.json()) as { channels: Array<{ config?: unknown }> };
    expect(listed.channels[0]?.config).toBeUndefined();

    const unlinkRes = await app.request(`/api/monitors/${monitor.monitor.id}/channels/${channel.channel.id}`, { method: 'DELETE' });
    expect(unlinkRes.status).toBe(200);
  });

  it('enqueues monitor checks and check-all', async () => {
    const app = buildApp();

    const monitorRes = await app.request('/api/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'M2',
        url: 'https://example.com',
        intervalMinutes: 5,
        type: 'webpage',
        active: true,
      }),
    });
    const monitor = (await monitorRes.json()) as { monitor: { id: number } };

    queueCalls = [];
    const checkRes = await app.request(`/api/monitors/${monitor.monitor.id}/check`, { method: 'POST' });
    expect(checkRes.status).toBe(202);
    expect(queueCalls[0]?.type).toBe('monitor.check');

    checkAllCalled = false;
    const checkAllRes = await app.request('/api/check-all', { method: 'POST' });
    expect(checkAllRes.status).toBe(200);
    expect(checkAllCalled).toBeTrue();
  });

  it('handles telegram webhook auth', async () => {
    const app = buildApp();
    const prev = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret';

    const noHeader = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(noHeader.status).toBe(401);

    const badHeader = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong' },
      body: JSON.stringify({}),
    });
    expect(badHeader.status).toBe(401);

    const okHeader = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'secret' },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 1, type: 'group' } } }),
    });
    expect(okHeader.status).toBe(200);

    if (prev === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = prev;
  });

  it('returns health', async () => {
    const app = buildApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('handles webhook secret missing and invalid JSON', async () => {
    const app = buildApp();
    const prev = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const missingSecret = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingSecret.status).toBe(400);

    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret';
    const invalidJson = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'secret' },
      body: 'not-json',
    });
    expect(invalidJson.status).toBe(400);

    if (prev === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = prev;
  });

  it('lists changes and job events', async () => {
    const app = buildApp();
    const monitor = db.createMonitor({
      name: 'History',
      url: 'https://example.com',
      intervalMinutes: 5,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });
    const before = db.createSnapshot({
      monitorId: monitor.id,
      contentHash: 'hash-before',
      contentMd: 'before',
      releaseVersion: null,
    });
    const after = db.createSnapshot({
      monitorId: monitor.id,
      contentHash: 'hash-after',
      contentMd: 'after',
      releaseVersion: null,
    });
    const change = db.createChange({
      monitorId: monitor.id,
      beforeSnapshotId: before.id,
      afterSnapshotId: after.id,
      summary: 'Summary',
      aiSummary: null,
      diffMd: 'diff',
      diffType: 'modification',
      releaseVersion: null,
      aiSummaryMeta: null,
    });
    db.recordJobEvent({ jobId: 1, type: 'monitor.check', status: 'done', monitorId: monitor.id, message: 'ok', error: undefined });

    const listChanges = await app.request('/api/changes');
    expect(listChanges.status).toBe(200);
    const changesBody = (await listChanges.json()) as { changes: Array<{ id: number }> };
    expect(changesBody.changes.length).toBeGreaterThan(0);

    const singleChange = await app.request(`/api/changes/${change.id}`);
    expect(singleChange.status).toBe(200);

    const monitorChanges = await app.request(`/api/monitors/${monitor.id}/changes`);
    expect(monitorChanges.status).toBe(200);

    const events = await app.request(`/api/job-events?monitorId=${monitor.id}&status=done`);
    expect(events.status).toBe(200);
    const eventsBody = (await events.json()) as { events: Array<{ status: string }> };
    expect(eventsBody.events[0]?.status).toBe('done');
  });

  it('updates and retrieves a channel', async () => {
    const app = buildApp();
    const channelRes = await app.request('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TG',
        type: 'telegram',
        config: { botToken: 't', chatId: '1' },
        active: true,
      }),
    });
    const channel = (await channelRes.json()) as { channel: { id: number } };

    const updateRes = await app.request(`/api/channels/${channel.channel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TG2', config: { botToken: 't2', chatId: '2' } }),
    });
    expect(updateRes.status).toBe(200);

    const getRes = await app.request(`/api/channels/${channel.channel.id}`);
    expect(getRes.status).toBe(200);
  });
});

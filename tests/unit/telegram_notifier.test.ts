import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TelegramNotifier } from '../../src/lib/notification/telegram';
import type { Change, Monitor, NotificationChannel } from '../../src/db/schema';

const baseMonitor: Monitor = {
  id: 1,
  name: 'Monitor',
  url: 'https://example.com',
  intervalMinutes: 1,
  type: 'webpage',
  selector: null,
  includeLink: true,
  active: true,
  createdAt: new Date().toISOString(),
  lastCheckedAt: null,
};

const baseChange: Change = {
  id: 1,
  monitorId: 1,
  beforeSnapshotId: null,
  afterSnapshotId: 2,
  summary: 'Summary',
  aiSummary: null,
  diffMd: 'diff',
  diffType: 'modification',
  releaseVersion: null,
  aiSummaryMeta: null,
  createdAt: new Date().toISOString(),
};

const channel: NotificationChannel & { config: { botToken: string; chatId: string } } = {
  id: 1,
  name: 'TG',
  type: 'telegram',
  active: true,
  encryptedConfig: 'x',
  createdAt: new Date().toISOString(),
  config: { botToken: 't', chatId: '1' },
};

type FetchFn = typeof fetch;

describe('TelegramNotifier', () => {
  let originalFetch: FetchFn;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends AI summary format', async () => {
    let bodyText = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodyText = String(init?.body || '');
      return new Response('ok', { status: 200 });
    }) as unknown as FetchFn;

    const notifier = new TelegramNotifier();
    const ok = await notifier.send({ ...baseChange, aiSummary: '**Title**\n- Item' }, baseMonitor, channel, 'https://example.com');
    const payload = JSON.parse(bodyText) as { text: string };

    expect(ok).toBeTrue();
    expect(payload.text).toContain('<b>');
    expect(payload.text).toContain('https://example.com');
  });

  it('sends diff format when no AI summary', async () => {
    let bodyText = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodyText = String(init?.body || '');
      return new Response('ok', { status: 200 });
    }) as unknown as FetchFn;

    const notifier = new TelegramNotifier();
    const ok = await notifier.send(baseChange, baseMonitor, channel, 'https://example.com');
    const payload = JSON.parse(bodyText) as { text: string };

    expect(ok).toBeTrue();
    expect(payload.text).toContain('<pre>');
  });

  it('returns false on API failure', async () => {
    globalThis.fetch = (async () => new Response('bad', { status: 400 })) as unknown as FetchFn;

    const notifier = new TelegramNotifier();
    const ok = await notifier.send(baseChange, baseMonitor, channel, 'https://example.com');
    expect(ok).toBeFalse();
  });
});

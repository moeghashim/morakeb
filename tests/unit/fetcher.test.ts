import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Fetcher } from '../../src/lib/fetcher';
import type { Monitor } from '../../src/db/schema';

type FetchFn = typeof fetch;

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: 'Test',
    url: 'https://example.com',
    intervalMinutes: 1,
    type: 'webpage',
    selector: null,
    includeLink: true,
    active: true,
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    ...overrides,
  };
}

describe('Fetcher', () => {
  let originalFetch: FetchFn;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects responses larger than 5 MB', async () => {
    const encoder = new TextEncoder();
    const chunk = encoder.encode('a'.repeat(1024 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 6) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        sent += 1;
      },
    });
    globalThis.fetch = (async () => new Response(stream, { headers: { 'content-type': 'text/plain' } })) as unknown as FetchFn;

    const res = await new Fetcher().check(baseMonitor());
    expect(res.success).toBeFalse();
    expect(res.error || '').toContain('5 MB');
  });

  it('returns error on invalid JSON', async () => {
    globalThis.fetch = (async () => new Response('not-json', { headers: { 'content-type': 'application/json' } })) as unknown as FetchFn;

    const res = await new Fetcher().check(baseMonitor({ type: 'api' }));
    expect(res.success).toBeFalse();
    expect(res.error || '').toContain('Invalid JSON');
  });

  it('pretty prints XML', async () => {
    const xml = '<root><child>1</child></root>';
    globalThis.fetch = (async () => new Response(xml, { headers: { 'content-type': 'text/xml' } })) as unknown as FetchFn;

    const res = await new Fetcher().check(baseMonitor({ type: 'xml' }));
    expect(res.success).toBeTrue();
    expect(res.content || '').toContain('\n');
  });

  it('retries on 500 and succeeds', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response('fail', { status: 500, statusText: 'Server Error' });
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    }) as unknown as FetchFn;

    const res = await new Fetcher().check(baseMonitor());
    expect(calls).toBe(2);
    expect(res.success).toBeTrue();
    expect(res.content).toBe('ok');
  });

  it('retries on 429 and succeeds', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response('limit', { status: 429, headers: { 'Retry-After': '0' } });
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    }) as unknown as FetchFn;

    const res = await new Fetcher().check(baseMonitor());
    expect(calls).toBe(2);
    expect(res.success).toBeTrue();
  });
});

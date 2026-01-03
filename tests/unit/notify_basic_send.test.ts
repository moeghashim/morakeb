import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { sendTelegram } from '../../src/lib/notify-basic';

type FetchFn = typeof fetch;

describe('notify-basic sendTelegram', () => {
  let originalFetch: FetchFn;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns ok on success', async () => {
    globalThis.fetch = (async () => new Response('ok', { status: 200 })) as unknown as FetchFn;
    const res = await sendTelegram({ token: 't', chatId: '1', text: 'hello' });
    expect(res.ok).toBeTrue();
  });

  it('returns error on bad response', async () => {
    globalThis.fetch = (async () => new Response('bad', { status: 400 })) as unknown as FetchFn;
    const res = await sendTelegram({ token: 't', chatId: '1', text: 'hello' });
    expect(res.ok).toBeFalse();
  });
});

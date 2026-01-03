import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { verifyProviderWithAISDK } from '../../src/lib/ai/verify-aisdk';
import type { DB } from '../../src/db';

describe('verifyProviderWithAISDK diagnostics on failure', () => {
  const originalFetch = globalThis.fetch;
  beforeAll(() => {
    // Force any underlying network call to fail immediately to avoid real HTTP
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => { throw Object.assign(new Error('simulated failure'), { name: 'TimeoutError' }); };
  });
  afterAll(() => {
    // restore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = originalFetch;
  });

  it('fails cleanly on network error and does not hit network', async () => {
    const db: Pick<DB, 'getAIProviderDecrypted'> = {
      getAIProviderDecrypted: () => ({ id: 'openai', name: 'OpenAI', verified: false, apiKey: 'sek' } as any),
    };
    const res = await verifyProviderWithAISDK(db as DB, 'openai', 'gpt-5-mini-2025-08-07');
    expect(res.ok).toBeFalse();
  });
});

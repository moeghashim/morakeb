import { describe, it, expect } from 'bun:test';
import { SummaryService } from '../../src/lib/summary-service';
import type { Summarizer, SummarizeInput, SummarizeOutput } from '../../src/lib/summarizer';
import type { Monitor } from '../../src/db/schema';
import type { DB as DBType } from '../../src/db';

class StubSummarizer implements Summarizer {
  constructor(private name: 'droid' | 'direct', private calls: string[], private result: SummarizeOutput | null) {}
  async summarize(_input: SummarizeInput): Promise<SummarizeOutput | null> {
    this.calls.push(this.name);
    return this.result;
  }
}

type DBStub = { getSetting: (k: string) => string | undefined; setSetting: (k: string, v: string) => void; setAIProviderVerified?: (p: string, v: boolean) => void };

describe('SummaryService strategy order', () => {
  it('when provider is non-droid and AISDK fails, keeps summaries enabled but un-verifies key (no fallback)', async () => {
    const settings: Record<string, string> = {
      ai_summaries_enabled: 'true',
      ai_provider: 'anthropic',
    };
    let verifiedFlag: boolean | undefined;
    const db = ({
      getSetting: (k: string) => settings[k],
      setSetting: (k: string, v: string) => { settings[k] = v; },
      getAIProviderDecrypted: () => undefined,
      setAIProviderVerified: (_p: string, v: boolean) => { verifiedFlag = v; },
    } as DBStub) as unknown as DBType;
    const calls: string[] = [];
    const svc = new SummaryService(db, {
      // direct returns null (no API key), droid not called
      aisdk: new StubSummarizer('direct', calls, null),
      droid: new StubSummarizer('droid', calls, { text: 'ok', structured: null }),
    });
    const monitor = { id: 'm', name: 'm', url: 'https://example.com', intervalMinutes: 1, type: 'webpage', selector: null, includeLink: true, active: true, createdAt: new Date().toISOString(), lastCheckedAt: null } as unknown as Monitor;
    const out = await svc.generateSummary(monitor, 'diff');
    expect(out).toBeNull();
    expect(calls).toEqual([]); // No API key, so summarizer not called
    expect(settings['ai_summaries_enabled']).toBe('true'); // Stays enabled!
    expect(verifiedFlag).toBeUndefined(); // Not called when no API key
  });

  it('when provider is droid and droid fails, keeps summaries enabled (no fallback)', async () => {
    const settings: Record<string, string> = {
      ai_summaries_enabled: 'true',
      ai_provider: 'droid',
    };
    const db = ({ getSetting: (k: string) => settings[k], setSetting: (k: string, v: string) => { settings[k] = v; }, getAIProviderDecrypted: () => undefined } as DBStub) as unknown as DBType;
    const calls: string[] = [];
    const svc = new SummaryService(db, {
      droid: new StubSummarizer('droid', calls, null),
      aisdk: new StubSummarizer('direct', calls, { text: 'ok', structured: null }),
    });
    const monitor = { id: 'm2', name: 'm2', url: 'https://example.com', intervalMinutes: 1, type: 'webpage', selector: null, includeLink: true, active: true, createdAt: new Date().toISOString(), lastCheckedAt: null } as unknown as Monitor;
    const out = await svc.generateSummary(monitor, 'diff');
    expect(out).toBeNull();
    expect(calls).toEqual(['droid']);
    expect(settings['ai_summaries_enabled']).toBe('true'); // Stays enabled!
  });
});

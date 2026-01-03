import { describe, it, expect, beforeEach } from 'bun:test';
import type { DB as DBType } from '../../src/db';
import { SummaryService } from '../../src/lib/summary-service';
import type { Summarizer, SummarizeInput, SummarizeOutput } from '../../src/lib/summarizer';
import type { Monitor } from '../../src/db/schema';

class CaptureSummarizer implements Summarizer {
  public calls: SummarizeInput[] = [];
  constructor(private toReturn: SummarizeOutput | null) {}
  async summarize(input: SummarizeInput): Promise<SummarizeOutput | null> {
    this.calls.push(input);
    return this.toReturn;
  }
}

type DBStub = Pick<DBType, 'getSetting' | 'getAIProviderDecrypted'>;

const monitor: Monitor = {
  id: 1, name: 'm', url: 'https://example.com', intervalMinutes: 1,
  type: 'webpage', selector: null, includeLink: true, active: true,
  createdAt: new Date().toISOString(), lastCheckedAt: null,
};

describe('SummaryService provider selection + model prefixing', () => {
  beforeEach(() => {
    delete (process.env as Record<string,string|undefined>)['ANTHROPIC_API_KEY'];
    delete (process.env as Record<string,string|undefined>)['OPENAI_API_KEY'];
    delete (process.env as Record<string,string|undefined>)['GOOGLE_GENERATIVE_AI_API_KEY'];
  });

  it('passes model without provider prefix for AISDK; on failure returns null (no fallback)', async () => {
    const settings: Record<string, string> = {
      ai_summaries_enabled: 'true',
      ai_provider: 'anthropic',
      ai_model: 'claude-haiku-4-5',
    };
    const db = ({
      getSetting: (k: string) => settings[k],
      setSetting: (k: string, v: string) => { settings[k] = v; },
      getAIProviderDecrypted: () => ({ id: 'anthropic', name: 'Anthropic', verified: true, apiKey: 'sek' }),
      setAIProviderVerified: () => {},
    } as unknown) as DBType;
    const aisdk = new CaptureSummarizer(null);
    const droid = new CaptureSummarizer({ text: 'OK', structured: null });
    const svc = new SummaryService(db, { droid, aisdk });
    const out = await svc.generateSummary(monitor, 'diff');
    expect(out).toBeNull();
    expect(aisdk.calls[0].model).toBe('claude-haiku-4-5');
    // no fallback
    expect(droid.calls.length).toBe(0);
  });

  it('ignores colon-prefixed model for droid and passes undefined', async () => {
    const settings: Record<string, string> = {
      ai_summaries_enabled: 'true',
      ai_provider: 'droid',
      ai_model: 'anthropic:claude-haiku-4-5',
    };
    const db = ({ getSetting: (k: string) => settings[k], getAIProviderDecrypted: () => undefined } as unknown) as DBType;
    const droid = new CaptureSummarizer({ text: 'OK', structured: null });
    const aisdk = new CaptureSummarizer(null);
    const svc = new SummaryService(db, { droid, aisdk });
    await svc.generateSummary(monitor, 'diff');
    expect(droid.calls[0].model).toBeUndefined();
  });
});

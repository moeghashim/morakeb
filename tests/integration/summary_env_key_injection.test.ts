import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SummaryService } from '../../src/lib/summary-service';
import type { DB as DBType } from '../../src/db';
import type { Summarizer, SummarizeInput, SummarizeOutput } from '../../src/lib/summarizer';
import type { Monitor } from '../../src/db/schema';

class CaptureKeySummarizer implements Summarizer {
  public apiKey?: string;
  async summarize(input: SummarizeInput): Promise<SummarizeOutput | null> {
    this.apiKey = input.apiKey;
    return { text: 'ok', structured: null };
  }
}

const monitor: Monitor = {
  id: 1, name: 'm', url: 'https://example.com', intervalMinutes: 1,
  type: 'webpage', selector: null, includeLink: true, active: true,
  createdAt: new Date().toISOString(), lastCheckedAt: null,
};

describe('SummaryService env key injection for AISDK', () => {
  beforeEach(() => { delete (process.env as Record<string,string|undefined>)['ANTHROPIC_API_KEY']; });
  afterEach(() => { delete (process.env as Record<string,string|undefined>)['ANTHROPIC_API_KEY']; });

  it('sets ANTHROPIC_API_KEY from DB before AISDK summarize()', async () => {
    const settings: Record<string, string> = {
      ai_summaries_enabled: 'true',
      ai_provider: 'anthropic',
      ai_model: 'claude-haiku-4-5',
    };
    const db = ({
      getSetting: (k: string) => settings[k],
      getAIProviderDecrypted: () => ({ id: 'anthropic', name: 'Anthropic', verified: true, apiKey: 'sek-from-db' }),
    } as unknown) as DBType;
    const aisdk = new CaptureKeySummarizer();
    const droid: Summarizer = { summarize: async () => null };
    const svc = new SummaryService(db, { droid, aisdk });
    const out = await svc.generateSummary(monitor, 'diff');
    expect(out).toEqual({ text: 'ok', structured: null });
    expect(aisdk.apiKey).toBe('sek-from-db');
  });
});

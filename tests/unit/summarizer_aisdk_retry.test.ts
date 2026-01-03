import { describe, it, expect } from 'bun:test';
import { AISDKSummarizer } from '../../src/lib/summarizer-aisdk';

const dummyProviderLoader = async () =>
  ((_: string) => ({} as unknown)) as (model: string) => unknown;

describe('AISDKSummarizer retries on schema mismatch', () => {
  it('retries once when schema mismatch occurs', async () => {
    const prompts: string[] = [];
    let attempts = 0;
    const generator = async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt);
      if (attempts === 0) {
        attempts++;
        throw new Error('No object generated: response did not match schema.');
      }
      return {
        object: {
          status: 'ok',
          title: 'Weekly digest',
          features: ['Change one'],
          fixes: [],
          should_notify: true,
        },
      };
    };

    const summarizer = new AISDKSummarizer('openai:gpt-5-mini-2025-08-07', {
      generator: generator as any,
      providerLoader: dummyProviderLoader as any,
    });

    const result = await summarizer.summarize({
      monitorName: 'Test Monitor',
      url: 'https://example.com',
      diffMarkdown: 'diff',
      extraInstructions: undefined,
      model: 'openai:gpt-5-mini-2025-08-07',
    });

    expect(result?.structured?.features?.[0]).toBe('Change one');
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain('Reminder: Output MUST be valid JSON');
  });

  it('bails immediately on non-schema errors', async () => {
    const prompts: string[] = [];
    const generator = async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt);
      throw new Error('Timeout after 2 minutes');
    };

    const summarizer = new AISDKSummarizer('openai:gpt-5-mini-2025-08-07', {
      generator: generator as any,
      providerLoader: dummyProviderLoader as any,
    });

    const result = await summarizer.summarize({
      monitorName: 'Test Monitor',
      url: 'https://example.com',
      diffMarkdown: 'diff',
      extraInstructions: undefined,
      model: 'openai:gpt-5-mini-2025-08-07',
    });

    expect(result).toBeNull();
    expect(prompts.length).toBe(1);
  });
});

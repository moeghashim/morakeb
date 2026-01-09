import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import { buildChangeSummaryPrompt, type ChangeSummaryPromptInput } from './prompts';
import type { Summarizer, SummarizeInput, SummarizeOutput } from './summarizer';
import {
  enforceNotificationPolicy,
  formatSummaryMarkdown,
  normalizeStructuredSummary,
} from './summary-format';

export type ProviderName = 'anthropic' | 'openai' | 'google';

export function resolveProviderAndModel(raw: string | undefined): { provider: ProviderName; model: string } {
  const fallback: { provider: ProviderName; model: string } = {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
  };
  if (!raw || !raw.trim()) return fallback;

  const s = raw.trim();
  if (s.includes(':')) {
    const [p, m] = s.split(':', 2);
    const provider = (p as ProviderName);
    if (provider === 'anthropic' || provider === 'openai' || provider === 'google') {
      return { provider, model: m };
    }
  }

  const lower = s.toLowerCase();
  if (lower.includes('claude')) return { provider: 'anthropic', model: s };
  if (lower.includes('gpt') || lower.startsWith('o')) return { provider: 'openai', model: s };
  if (lower.includes('gemini')) return { provider: 'google', model: s };

  return fallback;
}

async function loadProvider(provider: ProviderName): Promise<(model: string) => LanguageModel> {
  if (provider === 'anthropic') {
    const mod: { anthropic: (model: string) => LanguageModel } = await import('@ai-sdk/anthropic');
    return mod.anthropic;
  }
  if (provider === 'openai') {
    const mod: { openai: (model: string) => LanguageModel } = await import('@ai-sdk/openai');
    return mod.openai;
  }
  const mod: { google: (model: string) => LanguageModel } = await import('@ai-sdk/google');
  return mod.google;
}

async function loadProviderWithApiKey(provider: ProviderName, apiKey?: string): Promise<(model: string) => LanguageModel> {
  if (!apiKey) return loadProvider(provider);
  if (provider === 'anthropic') {
    const mod: { createAnthropic: (o: { apiKey: string }) => (model: string) => LanguageModel } = await import('@ai-sdk/anthropic');
    const inst = mod.createAnthropic({ apiKey });
    return (m: string) => inst(m);
  }
  if (provider === 'openai') {
    const mod: { createOpenAI: (o: { apiKey: string }) => (model: string) => LanguageModel } = await import('@ai-sdk/openai');
    const inst = mod.createOpenAI({ apiKey });
    return (m: string) => inst(m);
  }
  const mod: { createGoogleGenerativeAI: (o: { apiKey: string }) => (model: string) => LanguageModel } = await import('@ai-sdk/google');
  const inst = mod.createGoogleGenerativeAI({ apiKey });
  return (m: string) => inst(m);
}

type GenerateObjectFn = typeof generateObject;
type ProviderLoaderFn = typeof loadProviderWithApiKey;

export class AISDKSummarizer implements Summarizer {
  private generator: GenerateObjectFn;
  private providerLoader: ProviderLoaderFn;

  constructor(
    private defaultModel: string = 'anthropic:claude-haiku-4-5',
    deps: {
      generator?: GenerateObjectFn;
      providerLoader?: ProviderLoaderFn;
    } = {}
  ) {
    this.generator = deps.generator ?? generateObject;
    this.providerLoader = deps.providerLoader ?? loadProviderWithApiKey;
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput | null> {
    const { provider, model } = resolveProviderAndModel(input.model ?? this.defaultModel);
    const getModel = await this.providerLoader(provider, input.apiKey);
    const basePrompt = buildChangeSummaryPrompt(input as ChangeSummaryPromptInput);
    const schema = z.object({
      status: z.enum(['ok', 'no_changes']),
      title: z.string().min(1).max(200).optional(),
      features: z.array(z.string().min(1).max(300)).optional(),
      fixes: z.array(z.string().min(1).max(300)).optional(),
      should_notify: z.boolean(),
      skip_reason: z.string().max(200).optional(),
      importance: z.enum(['high', 'medium', 'low']).optional(),
    });

    const reminderSuffix = '\n\nReminder: Output MUST be valid JSON that matches the schema exactly. Do not add extra commentary.';
    const maxAttempts = 2;
    let lastSchemaError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const prompt = attempt === 0 ? basePrompt : `${basePrompt}${reminderSuffix}`;

      try {
        // Add 2 minute timeout (Google API can be slow)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout after 2 minutes')), 120000);
        });

        // Build generator options - use type assertion to avoid TypeScript deep instantiation error
        const baseOptions = {
          model: getModel(model),
          prompt,
          schema,
        };
        
        const generatorOptions = provider === 'google'
          ? {
              ...baseOptions,
              providerOptions: {
                google: {
                  structuredOutputs: false,
                },
              },
            } as Parameters<typeof this.generator>[0]
          : baseOptions as Parameters<typeof this.generator>[0];

        const generatePromise = this.generator(generatorOptions);

        const { object } = await Promise.race([generatePromise, timeoutPromise]);

        if (!object) {
          throw new Error('No object generated: response did not match schema.');
        }
        const structuredRaw = normalizeStructuredSummary(object);
        if (!structuredRaw) {
          throw new Error('Structured summary normalization failed.');
        }

        const structured = enforceNotificationPolicy(structuredRaw);
        if (structured.status === 'no_changes') {
          return {
            text: null,
            structured,
          };
        }
        const text = formatSummaryMarkdown(structured);
        return {
          text: text ? text.slice(0, 2000) : null,
          structured,
        };
      } catch (error) {
        const e = error as Error;
        const message = e?.message || String(e);
        const schemaMismatch = /did not match schema/i.test(message) || /No object generated/i.test(message);

        if (!schemaMismatch) {
          console.error(`[AISDKSummarizer] Error for ${provider}/${model}: ${message}`);
          return null;
        }

        lastSchemaError = e;

        if (attempt === maxAttempts - 1) {
          console.error(`[AISDKSummarizer] Error for ${provider}/${model}: ${message}`);
          return null;
        }

        console.warn(`[AISDKSummarizer] Schema mismatch for ${provider}/${model}; retrying once`);
      }
    }

    if (lastSchemaError) {
      console.error(`[AISDKSummarizer] Error for ${provider}/${model}: ${lastSchemaError.message}`);
    }
    return null;
  }
}

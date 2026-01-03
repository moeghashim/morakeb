import { describe, it, expect } from 'bun:test';
import { generateText } from 'ai';

// Providers
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

type Provider = 'anthropic' | 'openai' | 'google';

const LIVE = process.env.LIVE === '1';

const DIRECT_MODELS: Array<{ id: string; provider: Provider; model: string; env: string }> = [
  // Anthropic (Claude)
  { id: 'anthropic:claude-haiku-4-5', provider: 'anthropic', model: 'claude-haiku-4-5', env: 'ANTHROPIC_API_KEY' },
  { id: 'anthropic:claude-sonnet-4-5-20250929', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', env: 'ANTHROPIC_API_KEY' },
  // OpenAI
  { id: 'openai:gpt-5-mini-2025-08-07', provider: 'openai', model: 'gpt-5-mini-2025-08-07', env: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5-2025-08-07', provider: 'openai', model: 'gpt-5-2025-08-07', env: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5-nano-2025-08-07', provider: 'openai', model: 'gpt-5-nano-2025-08-07', env: 'OPENAI_API_KEY' },
  // Google
  { id: 'google:gemini-2.5-flash-lite', provider: 'google', model: 'gemini-2.5-flash-lite', env: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  { id: 'google:gemini-2.5-flash', provider: 'google', model: 'gemini-2.5-flash', env: 'GOOGLE_GENERATIVE_AI_API_KEY' },
];

if (!LIVE) {
  describe.skip('AISDK ping live tests (set LIVE=1 to enable)', () => {});
} else {
  describe('AISDK ping live', () => {
    for (const c of DIRECT_MODELS) {
      const envSet = !!process.env[c.env];
      const title = envSet
        ? `[${c.id}] responds with "pong"`
        : `[${c.id}] skipped (missing ${c.env})`;

      it(title, async () => {
        if (!envSet) return;
        const model = (
          c.provider === 'anthropic' ? anthropic(c.model) :
          c.provider === 'openai' ? openai(c.model) :
          google(c.model)
        );
        const { text } = await generateText({
          model,
          prompt: 'Reply with exactly: pong',
        });
        expect(text.trim().toLowerCase()).toBe('pong');
      }, 30000);
    }
  });
}


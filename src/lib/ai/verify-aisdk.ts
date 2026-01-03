import type { DB } from '@/db';
import type { CloudProvider } from './config';
import { generateText, type LanguageModel } from 'ai';

type ProviderFactory = (o: { apiKey: string }) => (model: string) => LanguageModel;

async function getFactory(p: CloudProvider): Promise<ProviderFactory> {
  if (p === 'anthropic') return (await import('@ai-sdk/anthropic')).createAnthropic;
  if (p === 'openai') return (await import('@ai-sdk/openai')).createOpenAI;
  if (p === 'google') return (await import('@ai-sdk/google')).createGoogleGenerativeAI;
  // Future providers (e.g., xai) can be added here with one line.
  throw new Error(`Unknown provider: ${p}`);
}

export async function verifyProviderWithAISDK(db: DB, provider: CloudProvider, modelId: string): Promise<{ ok: boolean; error?: string }> {
  const key = (db.getAIProviderDecrypted(provider)?.apiKey || '').trim();
  if (!key) return { ok: false, error: 'Missing API key' };
  try {
    const create = await getFactory(provider);
    const model = create({ apiKey: key })(modelId);
    await generateText({ model, prompt: 'ping' });
    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.message || e);
    return { ok: false, error: msg };
  }
}

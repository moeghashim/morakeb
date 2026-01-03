import type { DB } from '@/db';

export type CloudProvider = 'anthropic' | 'openai' | 'google';
export type ProviderId = 'droid' | CloudProvider;

export function defaultModelForProvider(db: DB, p: ProviderId): string {
  try {
    const models = db.listAIModels(p).filter(m => m.active);
    const def = models.find(m => m.isDefault);
    return (def ?? models[0])?.id || '';
  } catch {
    if (p === 'droid') return 'claude-opus-4-5-20251101';
    if (p === 'anthropic') return 'claude-haiku-4-5';
    if (p === 'openai') return 'gpt-5-mini-2025-08-07';
    return 'gemini-2.5-flash-lite';
  }
}

import type { DB } from '@/db';
import type { Monitor } from '@/db';
import type { SummarizeOutput, Summarizer } from './summarizer';
import { resolvePlugin } from './plugins/registry';
import type { StructuredSummary } from './summary-format';
import { enforceNotificationPolicy } from './summary-format';

export type SummaryResult = {
  text: string | null;
  structured: StructuredSummary | null;
};

export class SummaryService {
  constructor(
    private db: DB,
    private opts: { droid: Summarizer; aisdk: Summarizer }
  ) {}

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async generateSummary(monitor: Monitor, diffMarkdown: string, aiExtra?: string | null): Promise<SummaryResult | null> {
    const enabled = (this.db.getSetting('ai_summaries_enabled') || '').toLowerCase() === 'true';
    if (!enabled) return null;

    // Resolve provider selection (app setting or inferred from model)
    let provider = (this.db.getSetting('ai_provider') || '').toLowerCase();
    const modelRaw = this.db.getSetting('ai_model') || undefined;
    if (!provider) {
      const legacy = (this.db.getSetting('ai_strategy') || '').toLowerCase();
      if (legacy === 'droid') provider = 'droid';
      else if (legacy === 'direct' || legacy === 'aisdk') {
        const m = (modelRaw || '').toLowerCase();
        provider = m.startsWith('openai:') ? 'openai' : m.startsWith('google:') ? 'google' : 'anthropic';
      } else {
        const m = (modelRaw || '').toLowerCase();
        provider = m.startsWith('openai:') ? 'openai' : m.startsWith('google:') ? 'google' : (m ? 'anthropic' : 'droid');
      }
    }

    // Append plugin-provided prompt hints if any
    const { plugin, options } = resolvePlugin(monitor, this.db);
    const pluginExtra = plugin?.promptExtra?.({ monitor, options });
    const extraInstructions = [pluginExtra, aiExtra].filter((s) => !!s && String(s).trim().length > 0).join('\n\n') || undefined;
    const linkOverride = plugin?.linkForPrompt?.({ monitor, options });

    const baseInput = {
      monitorName: monitor.name,
      url: linkOverride || monitor.url,
      diffMarkdown,
      extraInstructions,
    } as const;

    const handleSummarizerOutput = (output: SummarizeOutput | null): SummaryResult | null => {
      if (!output) return null;
      let { text, structured } = output;

      if (structured) {
        structured = enforceNotificationPolicy(structured);
        if (structured.status === 'no_changes') {
          return {
            text: null,
            structured: { ...structured, shouldNotify: false, skipReason: structured.skipReason ?? 'لا توجد تغييرات مهمة' },
          };
        }
        return { text, structured };
      }

      if (text && /^\s*no changes\s*$/i.test(text)) {
        return {
          text: null,
          structured: {
            status: 'no_changes',
            title: undefined,
            features: [],
            fixes: [],
            shouldNotify: false,
            skipReason: 'لا توجد تغييرات مهمة',
            importance: undefined,
          },
        };
      }

      return { text, structured: null };
    };

    try {
      if (provider === 'droid') {
        const modelForDroid = modelRaw && modelRaw.includes(':') ? undefined : modelRaw;
        const droidInput = { ...baseInput, model: modelForDroid };
        const t = await this.opts.droid.summarize(droidInput);
        const handled = handleSummarizerOutput(t);
        if (handled) return handled;
        console.error(`[${this.timestamp()}] ai: droid provider failed`);
        return null;
      }
      // AISDK provider path: use decrypted API key
      const provRec = this.db.getAIProviderDecrypted(provider);
      if (!provRec?.apiKey) {
        console.error(`[${this.timestamp()}] ai: no api key for provider '${provider}'`);
        return null;
      }
      // Don't prefix model - AI SDK providers expect just the model name
      const directInput = { ...baseInput, model: modelRaw, apiKey: provRec?.apiKey };
      const t = await this.opts.aisdk.summarize(directInput);
      const handled = handleSummarizerOutput(t);
      if (handled) return handled;
      console.error(`[${this.timestamp()}] ai: provider '${provider}' failed to generate summary`);
      try { (this.db as any).setAIProviderVerified?.(provider, false); } catch {}
      return null;
    } catch (error: unknown) {
      const e = error as Error;
      console.error(`[${this.timestamp()}] ai: summary error: ${e?.message || String(e)}`);
      if (provider !== 'droid') { 
        try { (this.db as any).setAIProviderVerified?.(provider, false); } catch {} 
      }
      return null;
    }
  }
}

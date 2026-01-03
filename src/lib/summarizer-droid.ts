import { spawnSync } from 'node:child_process';
import { buildChangeSummaryPrompt, type ChangeSummaryPromptInput } from './prompts';
import type { Summarizer, SummarizeInput, SummarizeOutput } from './summarizer';
import { warmupDroidModel } from './ai/droid';
import {
  enforceNotificationPolicy,
  formatSummaryMarkdown,
  normalizeStructuredSummary,
} from './summary-format';

const MAX_SUMMARY_LENGTH = 2000;

const buildNoChanges = (reason: string): SummarizeOutput => ({
  text: null,
  structured: {
    status: 'no_changes',
    title: undefined,
    features: [],
    fixes: [],
    shouldNotify: false,
    skipReason: reason,
    importance: undefined,
  },
});

export class DroidSummarizer implements Summarizer {
  constructor(private defaultModel: string = 'claude-haiku-4-5-20251001') {}

  async summarize(input: SummarizeInput): Promise<SummarizeOutput | null> {
    const model = input.model || this.defaultModel;
    try {
      const warmup = warmupDroidModel(model);
      if (!warmup.ok) {
        const msg = warmup.stderr.trim() || warmup.stdout.trim() || (warmup.status !== null ? `exit ${warmup.status}` : warmup.error?.message || 'warm-up failed');
        console.error(`[DroidSummarizer] Warm-up failed for model '${model}': ${msg}`);
        return null;
      }
      const prompt = buildChangeSummaryPrompt(input as ChangeSummaryPromptInput);
      const proc = spawnSync(
        'droid',
        ['exec', '-m', model, '-r', 'off'],
        { input: prompt, encoding: 'utf8' }
      );
      if (proc.status === 0 && proc.stdout) {
        const raw = String(proc.stdout).trim();
        // Try to parse JSON per prompt contract
        try {
          const parsed = JSON.parse(raw);
          const structuredRaw = normalizeStructuredSummary(parsed);
          if (!structuredRaw) {
            if (/^\s*No changes\s*$/i.test(raw)) {
              return buildNoChanges('model reported no changes');
            }
            return raw ? { text: raw.slice(0, MAX_SUMMARY_LENGTH), structured: null } : null;
          }
          const structured = enforceNotificationPolicy(structuredRaw);
          if (structured.status === 'no_changes') {
            return buildNoChanges(structured.skipReason ?? 'no changes');
          }
          const text = formatSummaryMarkdown(structured);
          return {
            text: text ? text.slice(0, MAX_SUMMARY_LENGTH) : null,
            structured,
          };
        } catch {
          if (/^\s*No changes\s*$/i.test(raw)) {
            return buildNoChanges('model reported no changes');
          }
          return raw ? { text: raw.slice(0, MAX_SUMMARY_LENGTH), structured: null } : null;
        }
      }
    } catch {
      // ignore failures and return null
    }
    return null;
  }
}

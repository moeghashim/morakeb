import type { ChangeSummaryPromptInput } from './prompts';
import type { StructuredSummary } from './summary-format';

export type SummarizeInput = ChangeSummaryPromptInput & {
  model?: string;
  apiKey?: string;
};

export type SummarizeOutput = {
  text: string | null;
  structured: StructuredSummary | null;
};

export interface Summarizer {
  summarize(input: SummarizeInput): Promise<SummarizeOutput | null>;
}

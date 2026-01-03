import type { Monitor, Change } from '@/db';
import type { StructuredSummary } from '../summary-format';

export type PluginRelease = {
  version: string;
  markdown: string;
  // Optional additional context for AI summarization only (not persisted in snapshots/markdown)
  aiExtra?: string;
  // Optional canonical link for this slice (e.g., blog post URL)
  link?: string;
  // Optional plain title for the slice (e.g., blog post title)
  title?: string;
};

export type PluginTransformResult =
  | { contentMd: string; releases?: PluginRelease[] }
  | { releases: PluginRelease[] }
  | { skip: true; reason?: string };

export interface MonitorPlugin {
  id: string;
  match(m: Monitor): boolean;
  transform(raw: { content: string; contentType?: string }, m: Monitor, options?: unknown): PluginTransformResult;
  promptExtra?(ctx: { monitor: Monitor; options?: unknown }): string | undefined;
  shouldNotify?(change: Change, m: Monitor, options?: unknown): boolean; // default true
  linkForPrompt?(ctx: { monitor: Monitor; options?: unknown }): string | undefined;
  // Optional: allow plugins to customize how AI text is formatted for release slices
  formatAISummary?(ctx: { monitor: Monitor; slice: PluginRelease; aiText: string | null; options?: unknown }): string | null | undefined;
  // Optional: per-slice display URL for notifications (e.g., specific blog post)
  linkForSlice?(ctx: { monitor: Monitor; slice: PluginRelease; options?: unknown }): string | undefined;
  // Optional: allow plugin to disable AI summaries for its release slices
  useAISummary?(ctx: { monitor: Monitor; slice: PluginRelease; options?: unknown }): boolean;
  // Optional: format a weekly digest for this monitor
  formatDigest?(ctx: {
    monitor: Monitor;
    items: Array<{ change: Change; meta: StructuredSummary | null }>;
    timeframe?: { start: string; end: string } | null;
    options?: unknown;
  }): string | null | undefined;
}

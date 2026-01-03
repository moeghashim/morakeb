import type { Change } from '@/db';

export type StructuredImportance = 'high' | 'medium' | 'low';

export type StructuredSummary = {
  status: 'ok' | 'no_changes';
  title?: string;
  features: string[];
  fixes: string[];
  shouldNotify: boolean;
  skipReason?: string;
  importance?: StructuredImportance;
};

const IMPORTANCE_VALUES: StructuredImportance[] = ['high', 'medium', 'low'];

const normalizeImportance = (value: unknown): StructuredImportance | undefined => {
  if (!value || typeof value !== 'string') return undefined;
  const lowered = value.trim().toLowerCase();
  return IMPORTANCE_VALUES.find((v) => v === lowered);
};

const coerceBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
  }
  return fallback;
};

const trimList = (value: unknown, limit: number): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, 300));
    if (out.length >= limit) break;
  }
  return out;
};

/**
 * Normalize a raw JSON object returned by the summarizer into a structured summary.
 */
export function normalizeStructuredSummary(raw: unknown): StructuredSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawStatus = obj.status;
  if (rawStatus !== 'ok' && rawStatus !== 'no_changes') return null;

  const rawTitle = typeof obj.title === 'string' ? obj.title.trim() : undefined;
  const features = trimList(obj.features ?? (obj as any).feature_items, 12);
  const fixes = trimList(obj.fixes ?? (obj as any).fix_items, 8);

  const shouldNotify = coerceBool(
    obj.should_notify ?? (obj as any).shouldNotify,
    rawStatus === 'ok'
  );

  const skipReason =
    typeof (obj.skip_reason ?? (obj as any).skipReason) === 'string'
      ? String(obj.skip_reason ?? (obj as any).skipReason).trim().slice(0, 200)
      : undefined;

  const importance =
    normalizeImportance(obj.importance ?? (obj as any).importance_level ?? (obj as any).signal) ?? undefined;

  return {
    status: rawStatus,
    title: rawTitle,
    features,
    fixes,
    shouldNotify,
    skipReason,
    importance,
  };
}

/**
 * Apply in-app policy decisions to the structured summary. Ensures we suppress
 * low-signal bugfix-only summaries.
 */
export function enforceNotificationPolicy(summary: StructuredSummary): StructuredSummary {
  if (summary.status !== 'ok') {
    return { ...summary, shouldNotify: false, skipReason: summary.skipReason ?? 'no material changes' };
  }

  const featuresCount = summary.features.length;
  const fixesCount = summary.fixes.length;

  if (featuresCount === 0 && fixesCount === 0) {
    return {
      ...summary,
      shouldNotify: false,
      skipReason: summary.skipReason ?? 'no actionable changes detected',
    };
  }

  if (featuresCount === 0 && fixesCount > 0 && fixesCount <= 2) {
    const reason = fixesCount === 1 ? 'single bug fix only' : 'two bug fixes only';
    return {
      ...summary,
      shouldNotify: false,
      skipReason: summary.skipReason ?? reason,
    };
  }

  return summary;
}

export function formatSummaryMarkdown(summary: StructuredSummary): string | null {
  if (summary.status !== 'ok') return null;
  const lines: string[] = [];
  const title = (summary.title || '').trim();
  if (title) {
    lines.push(`**${title.slice(0, 200)}**`);
  }

  if (summary.features.length > 0) {
    lines.push('**Features**');
    for (const feature of summary.features) {
      lines.push(`- ${feature}`);
    }
  }

  if (summary.fixes.length > 0) {
    lines.push('**Fixes**');
    for (const fix of summary.fixes.slice(0, 5)) {
      lines.push(`- ${fix}`);
    }
  }

  if (lines.length === 0) return null;
  return lines.join('\n').slice(0, 2000);
}

export function parseChangeMeta(change: Change): StructuredSummary | null {
  if (!('aiSummaryMeta' in change)) return null;
  const metaRaw = (change as unknown as { aiSummaryMeta?: string | null }).aiSummaryMeta;
  if (!metaRaw) return null;
  try {
    const parsed = JSON.parse(metaRaw);
    return normalizeStructuredSummary(parsed);
  } catch {
    return null;
  }
}

export type AggregatedSummaryOptions = {
  timeframe?: { start: string; end: string };
  headingOverride?: string;
};

export type AggregatedSummary = {
  title: string;
  markdown: string;
  versions: string[];
};

const MAX_FEATURE_BULLETS = 18;
const MAX_FIX_BULLETS = 12;
const MAX_HIGHLIGHTS = 12;

const fallbackSummaryText = (change: Change): string | null => {
  const summary = ((change as unknown as { aiSummary?: string | null }).aiSummary ?? change.summary ?? '').trim();
  if (summary) return summary.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? null;
  return null;
};

export function buildAggregatedSummary(
  monitorName: string,
  items: Array<{ change: Change; meta: StructuredSummary | null }>,
  options: AggregatedSummaryOptions = {}
): AggregatedSummary | null {
  if (!items || items.length === 0) return null;
  const versionsOrdered = items
    .map((item) => (item.change.releaseVersion ? String(item.change.releaseVersion) : null))
    .filter((v): v is string => !!v);
  const versions = Array.from(new Set(versionsOrdered));

  const firstVersion = versions[0] ?? null;
  const lastVersion = versions[versions.length - 1] ?? firstVersion;

  let title = options.headingOverride;
  if (!title) {
    if (firstVersion && lastVersion && firstVersion !== lastVersion) {
      title = `${monitorName}: changes from ${firstVersion} to ${lastVersion}`;
    } else if (lastVersion) {
      title = `${monitorName} ${lastVersion} released`;
    } else {
      title = `${monitorName}: latest updates`;
    }
  }

  const featureBullets: string[] = [];
  const fixBullets: string[] = [];
  const highlightBullets: string[] = [];

  for (const { change, meta } of items) {
    if (meta && meta.status === 'ok') {
      for (const feature of meta.features.slice(0, MAX_FEATURE_BULLETS - featureBullets.length)) {
        featureBullets.push(feature);
      }
      for (const fix of meta.fixes.slice(0, MAX_FIX_BULLETS - fixBullets.length)) {
        fixBullets.push(fix);
      }
      if (meta.features.length === 0 && meta.fixes.length === 0) {
        const fallback = fallbackSummaryText(change);
        if (fallback && highlightBullets.length < MAX_HIGHLIGHTS) {
          highlightBullets.push(fallback);
        }
      }
    } else {
      const fallback = fallbackSummaryText(change);
      if (fallback && highlightBullets.length < MAX_HIGHLIGHTS) {
        highlightBullets.push(fallback);
      }
    }
  }

  const lines: string[] = [`**${title}**`];

  if (options.timeframe) {
    lines.push(`Period: ${options.timeframe.start} → ${options.timeframe.end}`);
  }

  if (featureBullets.length > 0) {
    lines.push('**Features**');
    for (const bullet of featureBullets.slice(0, MAX_FEATURE_BULLETS)) {
      lines.push(`- ${bullet}`);
    }
  }

  if (fixBullets.length > 0) {
    lines.push('**Fixes**');
    for (const bullet of fixBullets.slice(0, MAX_FIX_BULLETS)) {
      lines.push(`- ${bullet}`);
    }
  }

  if (highlightBullets.length > 0 && featureBullets.length === 0 && fixBullets.length === 0) {
    lines.push('**Highlights**');
    for (const bullet of highlightBullets.slice(0, MAX_HIGHLIGHTS)) {
      lines.push(`- ${bullet}`);
    }
  }

  const markdown = lines.join('\n').slice(0, 4000);
  return {
    title,
    markdown,
    versions,
  };
}

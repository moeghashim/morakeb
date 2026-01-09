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
  const features = trimList(obj.features ?? (obj as any).feature_items, 50);
  const fixes = trimList(obj.fixes ?? (obj as any).fix_items, 50);

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
    return { ...summary, shouldNotify: false, skipReason: summary.skipReason ?? 'لا توجد تغييرات مهمة' };
  }

  const featuresCount = summary.features.length;
  const fixesCount = summary.fixes.length;

  if (featuresCount === 0 && fixesCount === 0) {
    return {
      ...summary,
      shouldNotify: false,
      skipReason: summary.skipReason ?? 'لم يتم اكتشاف تغييرات قابلة للتنفيذ',
    };
  }

  if (featuresCount === 0 && fixesCount > 0 && fixesCount <= 2) {
    const reason = fixesCount === 1 ? 'إصلاح خطأ واحد فقط' : 'إصلاحان فقط';
    return {
      ...summary,
      shouldNotify: false,
      skipReason: summary.skipReason ?? reason,
    };
  }

  return summary;
}

export function formatSummaryMarkdown(
  summary: StructuredSummary,
  options?: { version?: string | null; date?: string | null; companyName?: string }
): string | null {
  if (summary.status !== 'ok') return null;
  const lines: string[] = [];
  
  // Build header with company and version (no date)
  const companyName = options?.companyName || 'Anthropic';
  const version = options?.version;
  
  let header = '';
  if (version) {
    // Wrap version number in LTR markers to keep it left-to-right in RTL text
    const ltrVersion = `\u202A${version}\u202C`;
    header = `${companyName} تطلق الإصدار ${ltrVersion}`;
  } else {
    header = `${companyName}`;
  }
  lines.push(`**${header}**`);
  lines.push('');
  
  const title = (summary.title || '').trim();
  if (title && !title.includes(companyName)) {
    lines.push(`**${title.slice(0, 200)}**`);
    lines.push('');
  }

  if (summary.features.length > 0) {
    lines.push('**الميزات الجديدة**');
    for (const feature of summary.features) {
      lines.push(`- ${feature}`);
    }
    lines.push('');
  }

  if (summary.fixes.length > 0) {
    lines.push('**التحسينات والإصلاحات**');
    for (const fix of summary.fixes) {
      lines.push(`- ${fix}`);
    }
    lines.push('');
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

const MAX_FEATURE_BULLETS = 50;
const MAX_FIX_BULLETS = 50;
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
      title = `${monitorName}: التغييرات من ${firstVersion} إلى ${lastVersion}`;
    } else if (lastVersion) {
      title = `${monitorName} ${lastVersion} تم إصداره`;
    } else {
      title = `${monitorName}: آخر التحديثات`;
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
    lines.push(`الفترة: ${options.timeframe.start} → ${options.timeframe.end}`);
  }

  if (featureBullets.length > 0) {
    lines.push('**الميزات**');
    for (const bullet of featureBullets.slice(0, MAX_FEATURE_BULLETS)) {
      lines.push(`- ${bullet}`);
    }
  }

  if (fixBullets.length > 0) {
    lines.push('**الإصلاحات**');
    for (const bullet of fixBullets.slice(0, MAX_FIX_BULLETS)) {
      lines.push(`- ${bullet}`);
    }
  }

  if (highlightBullets.length > 0 && featureBullets.length === 0 && fixBullets.length === 0) {
    lines.push('**أبرز التغييرات**');
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

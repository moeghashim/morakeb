import type { Monitor } from '@/db';
import { MarkdownConverter } from '../markdown';
import type { MonitorPlugin, PluginTransformResult, PluginRelease } from './types';
import { decodeEntities } from './utils';

function isPreRelease(title: string): boolean {
  return /\b(alpha|beta|rc)\b/i.test(title) || /-(alpha|beta|rc)/i.test(title);
}


export const codexCliAtomPlugin: MonitorPlugin = {
  id: 'codex-cli-atom',
  match(m: Monitor): boolean {
    // Specifically target Codex CLI releases feed for clarity
    return m.type === 'xml' && /github\.com\/openai\/codex\/releases\.atom$/i.test(m.url);
  },
  transform(raw: { content: string; contentType?: string }, _m: Monitor, options?: unknown): PluginTransformResult {
    const opts = (options as { ignorePreReleases?: boolean; requireNotes?: boolean } | undefined) || {};
    const ignorePre = opts.ignorePreReleases ?? true;
    const requireNotes = opts.requireNotes ?? true;

    const xml = raw.content || '';
    // naive split by entries to keep implementation light
    const entries = xml.split('<entry>').slice(1).map((e) => '<entry>' + e);
    const md = new MarkdownConverter();

    // Collect eligible stable entries (feed is newest-first)
    const sections: Array<{ version: string; notes: string; aiExtra?: string }> = [];
    for (const entry of entries) {
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      if (!title) continue;
      if (ignorePre && isPreRelease(title)) continue;

      const contentHtml = (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || '';
      const decodedHtml = decodeEntities(contentHtml);

      const highlightsHtml = extractHighlightsHtml(decodedHtml);
      if (!highlightsHtml) {
        continue;
      }

      const mdNotesRaw = md.convert(highlightsHtml).trim();
      if (mdNotesRaw.length === 0) {
        continue;
      }

      const mdNotesLines = mdNotesRaw
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);

      const normalizedLines = mdNotesLines
        .map((line) => normalizeBulletLine(line))
        .filter((line): line is string => line !== null);

      const hasChecklist = normalizedLines.some((line) => {
        const trimmed = line.trimStart();
        return trimmed.startsWith('- ');
      });
      if (!hasChecklist) {
        continue;
      }

      const mdNotes = normalizedLines.join('\n').trim();
      if (mdNotes.length === 0) {
        continue;
      }

      // Optionally extract merged PRs section when present under any heading level
      // Accept headings like:
      //   <h2>Full list of merged PRs:</h2>
      //   <h3>Merged PRs</h3>
      const mergedPRsMatch = decodedHtml.match(/<h[1-6][^>]*>\s*(?:Full\s+list\s+of\s+)?Merged\s*PRs:?\s*<\/h[1-6]>([\s\S]*?)(?:<h[1-6][^>]*>|$)/i);
      let mergedPRsMd: string | null = null;
      if (mergedPRsMatch) {
        const listHtml = mergedPRsMatch[1] || '';
        const mdMergedRaw = md.convert(listHtml).trim();
        const mdMergedLines = mdMergedRaw
          .split('\n')
          .map((line) => normalizeBulletLine(line))
          .filter((line): line is string => line !== null);
        if (mdMergedLines.length > 0) {
          mergedPRsMd = mdMergedLines.join('\n');
        }
      }

      const ver = (title.match(/v?\d+\.\d+\.\d+(?:[-+.][^\s]+)?/) || [])[0] || title.trim();

      if (requireNotes && mdNotes.trim().length === 0) {
        continue; // skip entries without notes when notes required
      }
      const aiExtra = mergedPRsMd ? `Merged PRs:\n${mergedPRsMd}` : undefined;
      sections.push({ version: ver, notes: mdNotes, aiExtra });
    }

    if (sections.length === 0) {
      return { skip: true, reason: 'no stable releases found' };
    }

    const releases: PluginRelease[] = sections.map((sec) => {
      const lines: string[] = [];
      if (sec.notes.trim().length > 0) {
        lines.push(sec.notes);
      }
      const markdown = lines.join('\n').trim();
      return {
        version: sec.version.startsWith('v') ? sec.version : `v${sec.version}`,
        markdown: markdown.length > 0 ? markdown : '- No highlights provided.',
        aiExtra: sec.aiExtra,
      };
    });

    if (releases.length === 0) {
      return { skip: true, reason: 'no stable releases found' };
    }

    return { releases };
  },
  linkForPrompt({ monitor }) {
    // Replace releases.atom with releases for a human-friendly page
    if (/releases\.atom$/i.test(monitor.url)) {
      return monitor.url.replace(/releases\.atom$/i, 'releases');
    }
    return undefined;
  },
};

const highlightKeywords = [
  /highlights?/i,
  /what['’]s\s+changed/i,
  /what\s+changed/i,
  /release\s+highlights?/i,
  /release\s+notes?/i,
];
const labelKeywordPattern = highlightKeywords.map((re) => `(?:${re.source})`).join('|');

function extractHighlightsHtml(decodedHtml: string): string | null {
  const labelRegex = new RegExp(
    `<(h[1-6]|p|strong|b)[^>]*>[\\s\\S]{0,200}?${labelKeywordPattern}[\\s\\S]*?<\\/\\1>`,
    'i'
  );
  const labelMatch = decodedHtml.match(labelRegex);
  if (labelMatch && typeof labelMatch.index === 'number') {
    const afterLabel = decodedHtml.slice(labelMatch.index + labelMatch[0].length);
    const nextHeadingIndex = afterLabel.search(/<h[1-6][^>]*>/i);
    const scope = nextHeadingIndex >= 0 ? afterLabel.slice(0, nextHeadingIndex) : afterLabel;
    const listMatch = scope.match(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/i);
    if (listMatch) {
      return listMatch[0];
    }
    const nestedListMatch = scope.match(/<(div|section|article|p)[^>]*>[\s\S]*?<(ul|ol)[^>]*>[\s\S]*?<\/\2>[\s\S]*?<\/\1>/i);
    if (nestedListMatch && nestedListMatch[0]) {
      const listWithin = nestedListMatch[0].match(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/i);
      if (listWithin) {
        return listWithin[0];
      }
    }
  }

  const fallbackList = decodedHtml.match(/<ul[^>]*>[\s\S]*?<\/ul>/i);
  if (fallbackList) {
    return fallbackList[0];
  }
  return null;
}

function normalizeBulletLine(line: string): string | null {
  if (line.trim().length === 0) {
    return null;
  }

  const indentMatch = line.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const trimmed = line.trimStart();

  const bulletMatch = trimmed.match(/^([-*+])\s+(.*)$/);
  if (bulletMatch) {
    const content = bulletMatch[2].trim();
    if (content.length === 0) {
      return null;
    }
    return `${indent}- ${content}`;
  }

  const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
  if (orderedMatch) {
    const content = orderedMatch[2].trim();
    if (content.length === 0) {
      return null;
    }
    return `${indent}- ${content}`;
  }

  if (trimmed.startsWith('- ')) {
    const content = trimmed.slice(2).trim();
    if (content.length === 0) {
      return null;
    }
    return `${indent}- ${content}`;
  }

  return null;
}

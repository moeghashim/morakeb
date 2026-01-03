import type { Monitor } from '@/db';
import { MarkdownConverter } from '../markdown';
import type { MonitorPlugin, PluginRelease, PluginTransformResult } from './types';
import { decodeEntities } from './utils';

function isFactoryCliRss(url: string): boolean {
  try {
    const u = new URL(url);
    return /docs\.factory\.ai$/i.test(u.hostname) && /\/changelog\/cli-updates\/rss\.xml$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function extractVersionFromText(text: string): string | null {
  const backtick = text.match(/`\s*(v?\d[\d.\-]*)\s*`/);
  if (backtick?.[1]) {
    const v = backtick[1].trim();
    return v.startsWith('v') ? v : `v${v}`;
  }
  const m = text.match(/\b(v?\d+\.\d+(?:\.\d+)?(?:[-+.][^\s`<]+)?)\b/);
  if (!m) return null;
  const raw = m[1];
  return raw.startsWith('v') ? raw : `v${raw}`;
}

export const factoryCliRssPlugin: MonitorPlugin = {
  id: 'factory-cli-rss',
  match(m: Monitor): boolean {
    return typeof m.url === 'string' && isFactoryCliRss(m.url);
  },
  transform(raw: { content: string; contentType?: string }, _m: Monitor): PluginTransformResult {
    const xml = raw.content || '';
    const items = xml.split('<item>').slice(1).map((e) => '<item>' + e);
    if (items.length === 0) return { skip: true, reason: 'no items' };

    const md = new MarkdownConverter();
    const releases: PluginRelease[] = [];

    for (const item of items) {
      const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
      const desc = (item.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
      const contentEncoded = (item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i) || [])[1] || '';
      const htmlRaw = contentEncoded || desc || '';
      const html = decodeEntities(htmlRaw);
      const notesRaw = md.convert(html).trim();
      const lines = notesRaw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('- ') || s.startsWith('* ')) ? s.replace(/^\*\s/, '- ') : `- ${s}`);
      const markdown = lines.join('\n');

      const version = extractVersionFromText(title + '\n' + markdown);
      if (!version) continue;

      releases.push({ version, markdown: markdown.length > 0 ? markdown : '- Release published' });
    }

    if (releases.length === 0) return { skip: true, reason: 'no releases parsed' };
    return { releases };
  },
  linkForPrompt({ monitor }) {
    try {
      const u = new URL(monitor.url);
      if (u.pathname.endsWith('/rss.xml')) {
        u.pathname = u.pathname.replace(/\/rss\.xml$/i, '');
        return u.toString();
      }
      return monitor.url;
    } catch {
      return monitor.url.replace(/\/rss\.xml($|(?=[?#]))/i, '');
    }
  },
};

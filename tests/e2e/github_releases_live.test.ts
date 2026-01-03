import { describe, it, expect } from 'bun:test';
import { codexCliAtomPlugin } from '../../src/lib/plugins/codex-cli-atom';
import type { Monitor } from '../../src/db/schema';

const LIVE = process.env.LIVE === '1';
if (!LIVE) {
  describe.skip('live feed tests (set LIVE=1 to enable)', () => {});
} else {
  const monitor = {
    id: 'test',
    name: 'codex cli',
    url: 'https://github.com/openai/codex/releases.atom',
    intervalMinutes: 60,
    type: 'xml',
    selector: null,
    includeLink: true,
    active: true,
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
  } as unknown as Monitor;

  describe('GitHub releases feed (live)', () => {
    it('produces non-empty markdown with at least one bullet for latest stable', async () => {
      const res = await fetch(monitor.url, { headers: { 'User-Agent': 'Changes-LiveTest' } });
      expect(res.ok).toBeTrue();
      const xml = await res.text();
      const t = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
      expect('releases' in t && Array.isArray(t.releases)).toBeTrue();
      if (!('releases' in t) || !t.releases) throw new Error('unexpected shape');
      expect(t.releases.length).toBeGreaterThan(0);
      expect(/^\-\s/m.test(t.releases[0].markdown)).toBeTrue();
    });

    it('skips when notes removed for 0.47.0', async () => {
      const res = await fetch(monitor.url);
      const xml = await res.text();
      const stripped = removeNotesForVersion(xml, '0.47.0');
      const t = codexCliAtomPlugin.transform({ content: stripped }, monitor, { ignorePreReleases: true, requireNotes: true });
      if ('releases' in t && t.releases) {
        expect(t.releases.some(r => r.version === 'v0.47.0')).toBeFalse();
      } else {
        expect('skip' in t).toBeTrue();
      }
    });
  });
}

function removeNotesForVersion(xml: string, version: string): string {
  const re = /<entry>[\s\S]*?<\/entry>/g;
  return xml.replace(re, (e) => {
    if (new RegExp(`<title>\s*${version}\s*<\/title>`).test(e)) {
      return e.replace(/(<content[^>]*>)[\s\S]*?(<\/content>)/, '$1$2');
    }
    return e;
  });
}

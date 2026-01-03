import { describe, it, expect } from 'bun:test';
import { codexCliAtomPlugin } from '../../src/lib/plugins/codex-cli-atom';
import type { Monitor } from '../../src/db/schema';

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

describe('codex-cli-atom plugin (unit)', () => {
  it('skips when no stable entries exist', () => {
    const xml = `<?xml version="1.0"?><feed><entry><title>0.47.0-alpha.1</title><content type="html">notes</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    expect('skip' in res).toBeTrue();
  });

  it('skips when stable has no notes and requireNotes=true', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.47.0</title><content type=\"html\"></content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    expect('skip' in res).toBeTrue();
  });

  it('produces markdown when stable has highlights', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.47.0</title><content type=\"html\">`+
      `&lt;h2&gt;Highlights&lt;/h2&gt;`+
      `&lt;ul&gt;`+
      `&lt;li&gt;Item A&lt;/li&gt;`+
      `&lt;li&gt;Item B&lt;/li&gt;`+
      `&lt;li&gt;Item C&lt;/li&gt;`+
      `&lt;/ul&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    expect(res.releases.length).toBe(1);
    expect(res.releases[0].version).toBe('v0.47.0');
    const bulletCount = (res.releases[0].markdown.match(/^\-\s/mg) || []).length;
    expect(bulletCount).toBeGreaterThanOrEqual(3);
  });

  it('skips when highlights section has no checklist items', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.47.1</title><content type=\"html\">`+
      `&lt;h2&gt;Highlights&lt;/h2&gt;`+
      `&lt;p&gt;Coming soon&lt;/p&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    expect('skip' in res).toBeTrue();
  });

  it('exposes Merged PRs via aiExtra (not in markdown)', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.51.0</title><content type=\"html\">`+
      // Highlights under h2
      `&lt;h2&gt;Highlights&lt;/h2&gt;`+
      `&lt;ul&gt;`+
      `&lt;li&gt;Core improvement&lt;/li&gt;`+
      `&lt;/ul&gt;`+
      // Merged PRs under h3
      `&lt;h3&gt;Merged PRs&lt;/h3&gt;`+
      `&lt;ul&gt;`+
      `&lt;li&gt;&lt;a href=\"https://github.com/openai/codex/pull/123\"&gt;#123&lt;/a&gt; — Fix something&lt;/li&gt;`+
      `&lt;li&gt;&lt;a href=\"https://github.com/openai/codex/pull/456\"&gt;#456&lt;/a&gt; — Add feature&lt;/li&gt;`+
      `&lt;/ul&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    expect(res.releases.length).toBe(1);
    const rel = res.releases[0] as any;
    const md = rel.markdown as string;
    // Has highlights bullet
    expect(/^\-\s/m.test(md)).toBeTrue();
    // Does not include merged PRs in markdown
    expect(md.includes('Merged PRs:')).toBeFalse();
    // aiExtra carries merged PRs
    expect(typeof rel.aiExtra).toBe('string');
    expect((rel.aiExtra as string)).toMatch(/Merged PRs:/);
    expect((rel.aiExtra as string)).toMatch(/#123/);
    expect((rel.aiExtra as string)).toMatch(/#456/);
  });

  it('accepts Highlights under h3 as well', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.50.0</title><content type=\"html\">`+
      `&lt;h3&gt;Highlights&lt;/h3&gt;`+
      `&lt;ul&gt;`+
      `&lt;li&gt;Improvement X&lt;/li&gt;`+
      `&lt;/ul&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    expect(res.releases.length).toBe(1);
    expect(res.releases[0].version).toBe('v0.50.0');
    expect(/^\-\s/m.test(res.releases[0].markdown)).toBeTrue();
  });

  it('accepts Highlights called out via strong label', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.52.1</title><content type=\"html\">`+
      `&lt;p&gt;&lt;strong&gt;Highlights&lt;/strong&gt;&lt;/p&gt;`+
      `&lt;ul&gt;`+
      `&lt;li&gt;Improvement Y&lt;/li&gt;`+
      `&lt;/ul&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    expect(res.releases.length).toBe(1);
    expect(res.releases[0].version).toBe('v0.52.1');
    expect(res.releases[0].markdown).toMatch(/Improvement Y/);
  });

  it('falls back to first unordered list when highlight heading missing', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.53.0</title><content type=\"html\">`+
      `&lt;div&gt;`+
      `&lt;ul&gt;&lt;li&gt;Feature one&lt;/li&gt;&lt;li&gt;Feature two&lt;/li&gt;&lt;/ul&gt;`+
      `&lt;h3&gt;Merged PRs&lt;/h3&gt;`+
      `&lt;ol&gt;&lt;li&gt;&lt;a href="https://github.com/openai/codex/pull/1"&gt;#1&lt;/a&gt;&lt;/li&gt;&lt;/ol&gt;`+
      `&lt;/div&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    expect(res.releases.length).toBe(1);
    const md = res.releases[0].markdown;
    expect(md).toContain('Feature one');
    expect(md).not.toContain('#1');
  });

  it('skips when highlight bullets are empty placeholders', () => {
    const xml = `<?xml version=\"1.0\"><feed><entry><title>0.54.0</title><content type=\"html\">`+
      `&lt;h2&gt;Highlights&lt;/h2&gt;`+
      `&lt;ul&gt;&lt;li&gt;&amp;nbsp;&lt;/li&gt;&lt;/ul&gt;`+
      `</content></entry></feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    expect('skip' in res).toBeTrue();
  });

  it('overrides link from releases.atom to releases', () => {
    const link = codexCliAtomPlugin.linkForPrompt!({ monitor });
    expect(link).toBe('https://github.com/openai/codex/releases');
  });

  it('renders all stable releases when multiple exist', () => {
    const xml = `<?xml version=\"1.0\"><feed>`+
      `<entry><title>0.48.0</title><content type=\"html\">&lt;h2&gt;Highlights&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Latest&lt;/li&gt;&lt;/ul&gt;</content></entry>`+
      `<entry><title>0.47.0</title><content type=\"html\">&lt;h2&gt;Highlights&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Older&lt;/li&gt;&lt;/ul&gt;</content></entry>`+
      `</feed>`;
    const res = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    const versions = res.releases.map((r) => r.version);
    expect(versions).toEqual(['v0.48.0', 'v0.47.0']);
  });
});

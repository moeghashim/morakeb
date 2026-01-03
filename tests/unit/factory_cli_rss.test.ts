import { describe, it, expect } from 'bun:test';
import type { Monitor } from '../../src/db';
import { factoryCliRssPlugin } from '../../src/lib/plugins/factory-cli-rss';

const monitor: Monitor = {
  id: 1,
  name: 'Factory CLI Updates (RSS)',
  url: 'https://docs.factory.ai/changelog/cli-updates/rss.xml',
  intervalMinutes: 60,
  type: 'xml',
  selector: null,
  includeLink: true,
  active: true,
  createdAt: new Date().toISOString(),
  lastCheckedAt: null,
};

const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>CLI Updates</title>
    <item>
      <title>Latest Update</title>
      <description>&lt;p&gt;\`v0.22.3\`&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Feature A&lt;/li&gt;&lt;li&gt;Feature B&lt;/li&gt;&lt;/ul&gt;</description>
    </item>
  </channel>
</rss>`;

describe('factory-cli-rss plugin', () => {
  it('matches the Factory CLI RSS URL', () => {
    expect(factoryCliRssPlugin.match(monitor)).toBeTrue();
    expect(factoryCliRssPlugin.match({ ...monitor, url: 'https://docs.factory.ai/changelog/cli-updates.md' })).toBeFalse();
  });

  it('parses encoded entities and extracts version/bullets', () => {
    const res = factoryCliRssPlugin.transform({ content: rss }, monitor);
    if (!('releases' in res) || !res.releases) throw new Error('unexpected shape');
    expect(res.releases.length).toBeGreaterThan(0);
    expect(res.releases[0].version).toBe('v0.22.3');
    expect(res.releases[0].markdown).toMatch(/^-/m);
  });

  it('linkForPrompt strips /rss.xml', () => {
    const link = factoryCliRssPlugin.linkForPrompt!({ monitor, options: undefined });
    expect(link).toBe('https://docs.factory.ai/changelog/cli-updates');
  });
});

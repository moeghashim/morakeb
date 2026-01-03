import { codexCliAtomPlugin } from '../src/lib/plugins/codex-cli-atom.ts';
import type { Monitor } from '../src/db/schema.ts';

const monitor = {
  id: 0,
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

const url = monitor.url;
const res = await fetch(url, { headers: { 'User-Agent': 'Changes-CLI-Check' }});
if (!res.ok) throw new Error(`failed to fetch: ${res.status}`);
const xml = await res.text();
const t = codexCliAtomPlugin.transform({ content: xml }, monitor, { ignorePreReleases: true, requireNotes: true });
console.log(JSON.stringify(t, null, 2));

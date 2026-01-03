import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ensureDir} from './sys';

const PREFS_PATH = path.join(process.cwd(), 'data', 'setup_prefs.json');

type Prefs = Record<string, string>;

async function readPrefs(): Promise<Prefs> {
  try {
    const raw = await fs.readFile(PREFS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Prefs;
    }
    return {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writePrefs(prefs: Prefs): Promise<void> {
  await ensureDir(path.dirname(PREFS_PATH));
  const json = JSON.stringify(prefs, null, 2);
  await fs.writeFile(PREFS_PATH, `${json}\n`, 'utf8');
}

export async function getPref(key: string): Promise<string | undefined> {
  const prefs = await readPrefs();
  return prefs[key];
}

export async function setPref(key: string, value: string): Promise<void> {
  const prefs = await readPrefs();
  prefs[key] = value;
  await writePrefs(prefs);
}

export async function getHostDest(): Promise<{host?: string; dest?: string}> {
  const prefs = await readPrefs();
  return {host: prefs['deploy_host'], dest: prefs['deploy_dest']};
}

export async function setHostDest(host: string, dest: string): Promise<void> {
  const prefs = await readPrefs();
  prefs['deploy_host'] = host;
  prefs['deploy_dest'] = dest;
  await writePrefs(prefs);
}

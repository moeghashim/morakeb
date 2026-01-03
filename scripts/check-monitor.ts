import { DB } from '../src/db/index.ts';

const db = new DB('./data/changes.db');
const monitors = db.listMonitors(false);
const m = monitors.find(m => m.url === 'https://github.com/openai/codex/releases.atom');
if (!m) {
  console.log(JSON.stringify({ found: false, monitors: monitors.map(x => ({id:x.id,name:x.name,url:x.url})) }, null, 2));
  process.exit(0);
}
const latest = db.getLatestSnapshot(m.id);
const latestRel = db.getLatestSnapshotWithRelease(m.id);
const snaps = db.listSnapshots(m.id, 5);
console.log(JSON.stringify({found:true, monitor:m, latest, latestRel, snaps}, null, 2));

import { DB } from '../src/db';

const databasePath = process.env.DATABASE_PATH || './data/changes.db';
const dryRun = process.env.DRY_RUN === '1';

const db = new DB(databasePath);
const raw = db.getRawDB();
const rows = raw
  .prepare(`select id, monitor_id as monitorId, content_md as contentMd from snapshots where release_version is null`)
  .all() as Array<{ id: number; monitorId: number; contentMd: string }>;

const releaseRegex = /^##\s+([^\n]+)/m;
let updates = 0;

for (const row of rows) {
  const match = row.contentMd.match(releaseRegex);
  if (!match) continue;
  const heading = match[1].trim();
  const versionMatch = heading.match(/v?\d+(?:\.\d+)+(?:[-+.][^\s]+)?/i);
  if (!versionMatch) continue;
  const version = versionMatch[0].startsWith('v') ? versionMatch[0] : `v${versionMatch[0]}`;
  if (!dryRun) {
    raw.prepare(`update snapshots set release_version = ? where id = ?`).run(version, row.id);
  }
  updates++;
}

console.log(`Processed ${rows.length} snapshots; ${updates} ${dryRun ? 'would be updated' : 'updated'}.`);

db.close();

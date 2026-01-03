import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DB } from '../../src/db';
import { cleanupSqliteFiles } from '../helpers/cleanup';

type DrizzleDb = ReturnType<typeof drizzle>;

const TMP_DB = './tmp/test-retention.db';

function createSampleHistory(db: DB, monitorId: number, count: number): { lastSnapshotId: number; lastChangeId: number | null } {
  let prevSnapshotId: number | null = null;
  let lastSnapshotId = -1;
  let lastChangeId: number | null = null;

  for (let i = 0; i < count; i++) {
    const snapshot = db.createSnapshot({
      monitorId,
      contentHash: `hash-${i}`,
      contentMd: `content-${i}`,
      releaseVersion: null,
    });
    lastSnapshotId = snapshot.id;
    if (prevSnapshotId !== null) {
      const change = db.createChange({
        monitorId,
        beforeSnapshotId: prevSnapshotId,
        afterSnapshotId: snapshot.id,
        summary: `summary-${i}`,
        diffMd: `diff-${i}`,
        diffType: 'modification',
        releaseVersion: null,
        aiSummary: null,
        aiSummaryMeta: null,
      });
      lastChangeId = change.id;
    }
    prevSnapshotId = snapshot.id;
  }

  return { lastSnapshotId, lastChangeId };
}

describe('retention cleanup', () => {
  let db: DB;
  beforeAll(() => {
    db = new DB(TMP_DB);
    const internal = db as unknown as { db: DrizzleDb };
    migrate(internal.db, { migrationsFolder: './drizzle' });
  });
  afterAll(() => {
    try { db.close(); } catch {}
    try { cleanupSqliteFiles(TMP_DB); } catch {}
  });

  it('keeps at most N snapshots and changes', () => {
    const monitor = db.createMonitor({
      name: 'Test Monitor',
      url: 'https://example.com',
      intervalMinutes: 1,
      type: 'webpage',
      selector: null,
      includeLink: true,
      active: true,
    });

    const { lastSnapshotId, lastChangeId } = createSampleHistory(db, monitor.id, 25);

    db.cleanupMonitorHistory(monitor.id, 20, 20);

    const snapshots = db.listSnapshots(monitor.id, 200);
    const changes = db.listChangesByMonitor(monitor.id, 200);

    expect(snapshots.length).toBeLessThanOrEqual(20);
    expect(changes.length).toBeLessThanOrEqual(20);
    expect(db.getSnapshot(lastSnapshotId)).toBeTruthy();
    if (lastChangeId !== null) {
      expect(db.getChange(lastChangeId)).toBeTruthy();
    }
  });
});

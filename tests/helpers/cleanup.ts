import { unlinkSync } from 'node:fs';

export function cleanupSqliteFiles(basePath: string) {
  try { unlinkSync(basePath); } catch {}
  try { unlinkSync(basePath + '-shm'); } catch {}
  try { unlinkSync(basePath + '-wal'); } catch {}
}


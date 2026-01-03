import { describe, it, expect, afterAll } from 'bun:test';
import { cleanupSqliteFiles } from '../helpers/cleanup';
import { DB } from '../../src/db';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '../../src/db/schema';
import { randomUUID } from 'node:crypto';

describe('AI seed data (providers + models)', () => {
  let path = '';
  afterAll(() => { try { if (path) cleanupSqliteFiles(path); } catch {} });
  it('seeds providers with proper names and one default model each', () => {
    path = `./tmp/test-${randomUUID()}.db`;
    const sqlite = new Database(path);
    const dz = drizzle(sqlite, { schema });
    migrate(dz, { migrationsFolder: './drizzle' });
    sqlite.close();
    const db = new DB(path);
    db.ensureDefaultAIData();
    const providers = ['droid','anthropic','openai','google'] as const;
    for (const id of providers) {
      const p = db.getAIProviderDecrypted(id);
      expect(p).toBeTruthy();
      const models = db.listAIModels(id);
      expect(models.length).toBeGreaterThan(0);
      const defaults = models.filter(m => m.isDefault);
      expect(defaults.length).toBe(1);
    }
    db.close();
  });
});

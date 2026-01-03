import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { DB } from '../../src/db';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { unlinkSync } from 'node:fs';
import { cleanupSqliteFiles } from '../helpers/cleanup';

const TMP = './tmp/test-ai.db';

describe('DB AI Providers', () => {
  let db: DB;
  beforeAll(() => {
    // Point migrations and DB to TMP path
    process.env.DATABASE_PATH = TMP;
    const sqlite = new Database(TMP);
    const mig = drizzle(sqlite);
    migrate(mig, { migrationsFolder: './drizzle' });
    sqlite.close();
    db = new DB(TMP);
    db.ensureDefaultAIData();
  });
  afterAll(() => {
    try { db.close(); } catch {}
    try { cleanupSqliteFiles(TMP); } catch {}
  });

  test('seeds providers and models', () => {
    const p = db.getAIProvider('openai');
    expect(p?.name).toBe('OpenAI');
    const models = db.listAIModels('openai');
    expect(models.length).toBeGreaterThan(0);
  });

  test('set/get encrypted provider key', () => {
    db.setAIProviderKey('openai', 'sk-test-xyz');
    const rec = db.getAIProviderDecrypted('openai');
    expect(rec?.apiKey).toBe('sk-test-xyz');
    db.setAIProviderVerified('openai', true);
    const rec2 = db.getAIProvider('openai');
    expect(rec2?.verified).toBe(true);
  });
});

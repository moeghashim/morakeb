import { describe, it, expect, afterAll } from 'bun:test';
import { DB } from '../../src/db';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '../../src/db/schema';
import { randomUUID } from 'node:crypto';
import { cleanupSqliteFiles } from '../helpers/cleanup';

describe('AI provider key store & verify', () => {
  let path = '';
  afterAll(() => { try { if (path) cleanupSqliteFiles(path); } catch {} });
  it('stores encrypted key and flips verified', () => {
    path = `./tmp/test-${randomUUID()}.db`;
    const sqlite = new Database(path);
    const dz = drizzle(sqlite, { schema });
    migrate(dz, { migrationsFolder: './drizzle' });
    sqlite.close();
    const db = new DB(path);
    db.ensureDefaultAIData();
    db.setAIProviderKey('anthropic', 'sek');
    let rec = db.getAIProviderDecrypted('anthropic');
    expect(rec?.apiKey).toBe('sek');
    expect(rec?.verified).toBe(false);
    db.setAIProviderVerified('anthropic', true);
    rec = db.getAIProviderDecrypted('anthropic');
    expect(rec?.verified).toBe(true);
    db.close();
  });
});

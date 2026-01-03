import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/changes.db';

console.log('🔄 Running migrations...');
console.log(`📁 Database: ${DATABASE_PATH}`);

const sqlite = new Database(DATABASE_PATH);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: './drizzle' });

console.log('✅ Migrations complete!');

sqlite.close();

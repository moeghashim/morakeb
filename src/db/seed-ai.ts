import { DB } from './index';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/changes.db';

const db = new DB(DATABASE_PATH);
db.ensureDefaultAIData();
db.close();
console.log('Seeded AI providers/models (if missing).');


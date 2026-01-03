import { DB } from './db';
import { Scheduler } from './scheduler';
import { createApiServer } from './api';
import { createQueue } from './jobs/queue';
import { startWorkers } from './jobs/worker';

// Load environment variables
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '127.0.0.1';
const DATABASE_PATH = process.env.DATABASE_PATH || './data/changes.db';
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '60') * 1000; // Convert to ms
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function main() {

  // Initialize database
  console.log(`[${ts()}] database: ${DATABASE_PATH}`);
  const db = new DB(DATABASE_PATH);

  // Initialize job queue & workers
  const queue = createQueue(db);
  const removed = db.cleanupStaleJobLocks(30 * 60 * 1000);
  if (removed > 0) console.log(`[${ts()}] cleaned stale job locks: ${removed}`);
  const pool = startWorkers(db, queue, WORKER_CONCURRENCY);
  console.log(`[${ts()}] workers: ${WORKER_CONCURRENCY}`);

  // Initialize scheduler (enqueue-only)
  const scheduler = new Scheduler(db, CHECK_INTERVAL, queue);

  // Create and start API server
  const app = createApiServer(db, scheduler, queue);

  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: app.fetch,
  });

  console.log(`[${ts()}] api server: http://${HOST}:${PORT}`);

  // Start scheduler after server is ready, then kick an immediate check (logs after server)
  scheduler.start();
  scheduler.checkNow();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`[${ts()}] shutting down`);
    scheduler.stop();
    pool.stop().catch(() => {});
    queue.close();
    db.close();
    server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

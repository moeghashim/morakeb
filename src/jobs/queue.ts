import type { Queue as PlainQueue } from 'plainjob';
import { bun, defineQueue } from 'plainjob';
import type { DB } from '@/db';

export type JobsQueue = PlainQueue;

export function createQueue(db: DB): JobsQueue {
  const connection = bun(db.getRawDB());
  const ts = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const quietLogger = {
    error: console.error,
    warn: console.warn,
    info: () => {},
    debug: () => {},
  } as const;
  const queue = defineQueue({
    connection,
    timeout: 30 * 60 * 1000,
    maintenanceInterval: 60 * 1000,
    logger: quietLogger,
    serializer: (data: unknown) => JSON.stringify(data),
    onProcessingJobsRequeued: (n: number) => { if (n > 0) console.log(`[${ts()}] requeued ${n} timed out job${n===1?'':'s'}`); },
    onDoneJobsRemoved: (n: number) => { if (n > 0) console.log(`[${ts()}] removed ${n} done job${n===1?'':'s'}`); },
    onFailedJobsRemoved: (n: number) => { if (n > 0) console.log(`[${ts()}] removed ${n} failed job${n===1?'':'s'}`); },
  });
  return queue;
}

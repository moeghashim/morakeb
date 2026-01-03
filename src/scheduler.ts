import { DB } from './db';
import type { Monitor } from './db';
import type { JobsQueue } from './jobs/queue';

export class Scheduler {
  private intervalId?: Timer;
  private isEnqueueing = false;

  constructor(private db: DB, private checkIntervalMs: number = 60_000, private queue: JobsQueue) {}

  start() {
    console.log(`[${this.timestamp()}] scheduler started (interval: ${this.checkIntervalMs / 1000}s)`);

    // Run initial check immediately
    this.runCheck(true);

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runCheck(false);
    }, this.checkIntervalMs);
  }

  private async runCheck(initial: boolean = false) {
    if (this.isEnqueueing) {
      console.log(`[${this.timestamp()}] scheduler: skipping enqueue (previous cycle in progress)`);
      return;
    }
    this.isEnqueueing = true;
    try {
      await this.enqueueDueMonitors(initial);
    } catch (error) {
      console.error(`[${this.timestamp()}] scheduler: enqueue failed:`, error);
    } finally {
      this.isEnqueueing = false;
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log(`[${this.timestamp()}] scheduler stopped`);
    }
  }

  async checkNow() {
    await this.enqueueDueMonitors(false);
  }

  private async enqueueDueMonitors(initial: boolean = false): Promise<void> {
    const monitors = this.db.listMonitors(true);
    if (monitors.length === 0) return;

    // No periodic console log; quiet unless there are actions or errors

    let enqueued = 0;
    for (const monitor of monitors) {
      if (!this.shouldCheck(monitor)) continue;
      const payload = { monitorId: monitor.id };
      try {
        const { id } = this.queue.add('monitor.check', payload);
        try { this.db.recordJobEvent({ jobId: id, type: 'monitor.check', status: 'queued', monitorId: monitor.id, message: 'enqueue', error: undefined }); } catch {}
        enqueued++;
      } catch (e) {
        console.error(`[${this.timestamp()}] scheduler: failed to enqueue monitor ${monitor.id}:`, e);
      }
    }

    const nowIso = new Date().toISOString();
    const pendingDigests = this.db.listPendingDigestGroups(nowIso);
    for (const digest of pendingDigests) {
      try {
        const payload = {
          monitorId: digest.monitorId,
          channelId: digest.channelId,
          digestAt: digest.digestAt,
        };
        const { id } = this.queue.add('notification.digest', payload);
        try {
          this.db.recordJobEvent({
            jobId: id,
            type: 'notification.digest',
            status: 'queued',
            monitorId: digest.monitorId,
            message: `digest ${digest.digestKey}`,
            error: undefined,
          });
        } catch {}
      } catch (error) {
        console.error(`[${this.timestamp()}] scheduler: failed to enqueue digest job`, error);
      }
    }

    // No summary log when none due; keep console quiet unless there are actions or errors
  }

  private shouldCheck(monitor: Monitor): boolean {
    if (!monitor.lastCheckedAt) {
      return true; // Never checked before
    }

    const lastChecked = new Date(monitor.lastCheckedAt);
    const now = new Date();
    const minutesSinceLastCheck = (now.getTime() - lastChecked.getTime()) / 1000 / 60;

    return minutesSinceLastCheck >= monitor.intervalMinutes;
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

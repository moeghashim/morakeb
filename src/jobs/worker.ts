import type { Queue, Job } from 'plainjob';
import { defineWorker } from 'plainjob';
import { DB, type Change } from '@/db';
import { Fetcher } from '@/lib/fetcher';
import { MarkdownConverter } from '@/lib/markdown';
import { Differ } from '@/lib/differ';
import { NotificationService } from '@/lib/notifier';
import { SummaryService } from '@/lib/summary-service';
import { AISDKSummarizer } from '@/lib/summarizer-aisdk';
import { DroidSummarizer } from '@/lib/summarizer-droid';
import { MonitorService } from '@/lib/monitor-service';
import { resolvePlugin } from '@/lib/plugins/registry';
import { buildAggregatedSummary, parseChangeMeta } from '@/lib/summary-format';

export type DigestPayload = { monitorId: number; channelId: number; digestAt: string };

const computeDigestTimeframe = (digestKey: string, digestAt: string): { start: string; end: string } => {
  let start = new Date(`${digestKey}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    start = new Date(digestAt);
  }
  const end = new Date(digestAt);
  if (!Number.isNaN(end.getTime())) {
    end.setMilliseconds(end.getMilliseconds() - 1);
  }
  const startLabel = Number.isNaN(start.getTime()) ? digestKey : start.toISOString().slice(0, 10);
  const endLabel = Number.isNaN(end.getTime()) ? digestAt : end.toISOString().slice(0, 10);
  return { start: startLabel, end: endLabel };
};

export type DigestJobResult =
  | { status: 'none'; reason: string }
  | { status: 'skipped'; reason: string }
  | { status: 'sent'; items: number; summary: string };

export async function processDigestJob(
  db: DB,
  payload: DigestPayload,
  notificationService: NotificationService
): Promise<DigestJobResult> {
  const groups = db.listPendingDigestGroups(payload.digestAt);
  const group = groups.find(
    (g) => g.monitorId === payload.monitorId && g.channelId === payload.channelId && g.digestAt === payload.digestAt
  );
  if (!group || group.itemIds.length === 0) {
    return { status: 'none', reason: 'no pending digest items' };
  }

  const monitor = db.getMonitor(payload.monitorId);
  if (!monitor || !monitor.active) {
    db.markDigestItemsSent(group.itemIds, new Date().toISOString());
    return { status: 'skipped', reason: 'monitor missing or inactive' };
  }

  const channels = db.getMonitorChannels(monitor.id, true);
  const channel = channels.find((c) => Number(c.id) === Number(payload.channelId));
  const deliveryMode = channel?.deliveryMode === 'weekly_digest' ? 'weekly_digest' : 'immediate';
  if (!channel || deliveryMode !== 'weekly_digest') {
    db.markDigestItemsSent(group.itemIds, new Date().toISOString());
    return { status: 'skipped', reason: 'channel unavailable' };
  }

  const changes = db.getChangesByIds(group.changeIds).filter((c): c is Change => !!c);
  if (changes.length === 0) {
    db.markDigestItemsSent(group.itemIds, new Date().toISOString());
    return { status: 'skipped', reason: 'changes missing' };
  }

  changes.sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    return at - bt;
  });

  const itemsWithMeta = changes.map((change) => {
    const after = db.getSnapshot((change as any).afterSnapshotId ?? (change as any).after_snapshot_id);
    return { change, meta: parseChangeMeta(change), afterMd: after?.contentMd ?? '' } as any;
  });
  const { plugin, options } = resolvePlugin(monitor, db);
  const displayUrl = plugin?.linkForPrompt?.({ monitor, options });
  const timeframe = computeDigestTimeframe(group.digestKey, group.digestAt);
  // Plugin-specific digest formatting override (e.g., Amp)
  const aggregatedCustom = plugin?.formatDigest?.({ monitor, items: itemsWithMeta, timeframe, options });
  const aggregated = aggregatedCustom
    ? { title: `${monitor.name}: weekly digest`, markdown: aggregatedCustom, versions: [] }
    : buildAggregatedSummary(monitor.name, itemsWithMeta, { timeframe });
  const fallbackPieces = itemsWithMeta
    .map(({ change }) => change.aiSummary ?? change.summary ?? '')
    .filter((text) => text && text.trim().length > 0);
  let summaryText = aggregated?.markdown || fallbackPieces.join('\n\n');
  if (!summaryText || summaryText.trim().length === 0) {
    summaryText = `**${monitor.name}: weekly digest**\n- ${changes.length} change${changes.length === 1 ? '' : 's'} recorded.`;
  }
  summaryText = summaryText.trim();
  if (summaryText.length === 0) {
    db.markDigestItemsSent(group.itemIds, new Date().toISOString());
    return { status: 'skipped', reason: 'digest empty' };
  }

  const latestChange = changes[changes.length - 1];
  const eventRefs = changes.map((change) => ({ changeId: change.id, releaseVersion: change.releaseVersion ?? null }));
  const aggregatedChange: Change = {
    ...latestChange,
    aiSummary: summaryText,
    aiSummaryMeta: null,
  };

  const results = await notificationService.sendNotifications(
    aggregatedChange,
    monitor,
    [channel],
    displayUrl,
    { eventChangeRefs: eventRefs, eventDetail: aggregated?.title ?? 'weekly digest' }
  );

  const ok = results.every((r) => r.ok);
  if (!ok) {
    const errorMessage = results.find((r) => !r.ok)?.error || 'failed to send digest';
    throw new Error(errorMessage);
  }

  const stamp = new Date().toISOString();
  db.markDigestItemsSent(group.itemIds, stamp);
  db.updateMonitorChannelOptions(monitor.id, channel.id, { lastDigestAt: payload.digestAt });

  return { status: 'sent', items: changes.length, summary: summaryText };
}

function buildMonitorService(db: DB): MonitorService {
  try { db.ensureDefaultAIData(); } catch {}
  const fetcher = new Fetcher();
  const markdownConverter = new MarkdownConverter();
  const differ = new Differ();
  const notificationService = new NotificationService(db);
  const summaryService = new SummaryService(db, {
    droid: new DroidSummarizer(),
    aisdk: new AISDKSummarizer(),
  });
  return new MonitorService(
    db,
    fetcher,
    markdownConverter,
    differ,
    notificationService,
    summaryService,
  );
}

type MonitorCheckPayload = { monitorId: number };

export function startWorkers(db: DB, queue: Queue, concurrency: number): { stop: () => Promise<void> } {
  const workers: { start: () => Promise<void>; stop: () => Promise<void> }[] = [];
  const monitorService = buildMonitorService(db);

  const logger = {
    error: console.error,
    warn: console.warn,
    info: () => {},
    debug: () => {},
  };

  for (let i = 0; i < Math.max(1, concurrency); i++) {
    const w = defineWorker(
      'monitor.check',
      async (job: Job) => {
        // record started
        try { db.recordJobEvent({ jobId: job.id, type: 'monitor.check', status: 'started', monitorId: undefined, message: undefined, error: undefined }); } catch {}

        const payload = JSON.parse(job.data) as MonitorCheckPayload;
        const monitorId = payload.monitorId;
        const lockKey = String(monitorId);

        // try to acquire lock
        const locked = db.acquireJobLock('monitor.check', lockKey, job.id);
        if (!locked) {
          try { db.recordJobEvent({ jobId: job.id, type: 'monitor.check', status: 'skipped', monitorId, message: 'lock held', error: undefined }); } catch {}
          return;
        }
        try {
          const monitor = db.getMonitor(monitorId);
          if (!monitor || !monitor.active) {
            try { db.recordJobEvent({ jobId: job.id, type: 'monitor.check', status: 'done', monitorId, message: 'monitor missing or inactive', error: undefined }); } catch {}
            return;
          }
          const result = await monitorService.checkMonitor(monitor);
          db.updateMonitorLastChecked(monitor.id, new Date().toISOString());
          const msg = result.success ? (result.hasChange ? 'change detected' : 'no change') : `error: ${result.message}`;
          try { db.recordJobEvent({ jobId: job.id, type: 'monitor.check', status: result.success ? 'done' : 'failed', monitorId, message: msg, error: result.success ? undefined : result.message }); } catch {}
        } catch (err) {
          const e = err as Error;
          try { db.recordJobEvent({ jobId: job.id, type: 'monitor.check', status: 'failed', monitorId, message: undefined, error: e?.message || String(e) }); } catch {}
          throw err;
        } finally {
          db.releaseJobLock('monitor.check', lockKey);
        }
      },
      { queue, logger }
    );
    workers.push(w);
    void w.start();
  }

  const digestNotificationService = new NotificationService(db);

  const digestWorker = defineWorker(
    'notification.digest',
    async (job: Job) => {
      let payload: DigestPayload;
      try {
        payload = JSON.parse(job.data) as DigestPayload;
      } catch {
        try { db.recordJobEvent({ jobId: job.id, type: 'notification.digest', status: 'failed', monitorId: undefined, message: undefined, error: 'invalid payload' }); } catch {}
        return;
      }

      try { db.recordJobEvent({ jobId: job.id, type: 'notification.digest', status: 'started', monitorId: payload.monitorId, message: undefined, error: undefined }); } catch {}

      const lockKey = `${payload.monitorId}:${payload.channelId}:${payload.digestAt}`;
      const locked = db.acquireJobLock('notification.digest', lockKey, job.id);
      if (!locked) {
        try { db.recordJobEvent({ jobId: job.id, type: 'notification.digest', status: 'skipped', monitorId: payload.monitorId, message: 'lock held', error: undefined }); } catch {}
        return;
      }

      try {
        const result = await processDigestJob(db, payload, digestNotificationService);
        if (result.status === 'sent') {
          try {
            db.recordJobEvent({
              jobId: job.id,
              type: 'notification.digest',
              status: 'done',
              monitorId: payload.monitorId,
              message: `sent ${result.items} change${result.items === 1 ? '' : 's'}`,
              error: undefined,
            });
          } catch {}
        } else {
          try {
            db.recordJobEvent({
              jobId: job.id,
              type: 'notification.digest',
              status: 'done',
              monitorId: payload.monitorId,
              message: result.reason,
              error: undefined,
            });
          } catch {}
        }
      } catch (error) {
        const e = error as Error;
        try { db.recordJobEvent({ jobId: job.id, type: 'notification.digest', status: 'failed', monitorId: payload.monitorId, message: undefined, error: e?.message || String(e) }); } catch {}
        throw error;
      } finally {
        db.releaseJobLock('notification.digest', lockKey);
      }
    },
    { queue, logger }
  );
  workers.push(digestWorker);
  void digestWorker.start();

  return {
    async stop() {
      for (const w of workers) {
        await w.stop();
      }
    },
  };
}

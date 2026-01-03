import { DB, type Monitor, type Snapshot, type Change } from '@/db';
import { Fetcher } from './fetcher';
import { MarkdownConverter } from './markdown';
import { Differ } from './differ';
import { NotificationService } from './notifier';
import { SummaryService } from './summary-service';
import { resolvePlugin } from './plugins/registry';
import type { PluginRelease } from './plugins/types';
import type { ChannelWithConfig } from './channel';
import { buildAggregatedSummary, type StructuredSummary } from './summary-format';

export class MonitorService {
  constructor(
    private db: DB,
    private fetcher: Fetcher,
    private markdownConverter: MarkdownConverter,
    private differ: Differ,
    private notificationService: NotificationService,
    private summaryService: SummaryService
  ) {}

  async checkMonitor(monitor: Monitor): Promise<{ success: boolean; message: string; hasChange?: boolean }> {
    try {
      // Fetch the content
      const result = await this.fetcher.check(monitor);

      if (!result.success) {
        console.error(`[${this.timestamp()}] ${monitor.name}: error: ${result.error}`);
        return { success: false, message: result.error || 'Failed to fetch' };
      }

      if (!result.content) {
        return { success: false, message: 'No content retrieved' };
      }

      // Convert content via plugin or default converters
      let content = result.content;
      const contentType = result.contentType;

      const { plugin, options } = resolvePlugin(monitor, this.db);
      if (plugin) {
        const transformed = plugin.transform({ content, contentType }, monitor, options);
        if ('skip' in transformed) {
          const reason = transformed.reason ? ` (${transformed.reason})` : '';
          console.log(`[${this.timestamp()}] ${monitor.name}: skipped by plugin${reason}`);
          this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());
          return { success: true, message: 'Skipped by plugin', hasChange: false };
        }
        if ('releases' in transformed && transformed.releases && transformed.releases.length > 0) {
          return await this.processReleaseSlices(monitor, transformed.releases, plugin, options);
        }
        if ('contentMd' in transformed) {
          content = transformed.contentMd;
        }
      } else {
        if (monitor.type === 'webpage' && this.isHtml(content)) {
          content = this.markdownConverter.convert(content);
        }
      }

      // Hash the markdown content (not raw HTML) to avoid spurious changes from dynamic HTML
      const contentHash = await this.hashContent(content);

      // Get the latest snapshot
      const latestSnapshot = this.db.getLatestSnapshot(monitor.id);

      // Check if content has changed
      if (latestSnapshot && latestSnapshot.contentHash === contentHash) {
        this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());
        return { success: true, message: 'No changes detected', hasChange: false };
      }

      // Save new snapshot
      const newSnapshot = this.db.createSnapshot({
        monitorId: monitor.id,
        contentHash: contentHash,
        contentMd: content,
      });

      // If there's a previous snapshot, create a change record
      if (latestSnapshot) {
        const diffResult = this.differ.generateDiff(
          latestSnapshot.contentMd,
          content,
          monitor
        );

        // If there are no meaningful additions/removals, treat as no change
        const hasMeaningfulChange = diffResult.changes && diffResult.changes.length > 0;
        if (!hasMeaningfulChange) {
          this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());
          return { success: true, message: 'No changes detected', hasChange: false };
        }

        // Generate AI summary when we have a real diff
        const summaryResult = await this.summaryService.generateSummary(monitor, diffResult.diffMarkdown);
        const structured = summaryResult?.structured ?? null;
        if (structured && structured.status === 'no_changes') {
          console.log(`[${this.timestamp()}] ${monitor.name}: snapshot only (no user-facing changes)`);
          return { success: true, message: 'No meaningful user-facing changes', hasChange: false };
        }

        const aiSummary = summaryResult?.text ?? null;
        const aiSummaryMeta = structured ? JSON.stringify(structured) : null;
        const shouldNotify = structured ? structured.shouldNotify !== false : true;
        const skipReason = structured?.skipReason;

        const change = this.db.createChange({
          monitorId: monitor.id,
          beforeSnapshotId: latestSnapshot.id,
          afterSnapshotId: newSnapshot.id,
          summary: diffResult.summary,
          diffMd: diffResult.diffMarkdown,
          diffType: diffResult.diffType,
          aiSummary,
          aiSummaryMeta,
        });

        const logLine = aiSummary ?? diffResult.summary ?? 'Change detected';
        console.log(`[${this.timestamp()}] ${monitor.name}: ${logLine}`);

        // Send notifications (plugin may decide to suppress)
        const channels = this.db.getMonitorChannels(monitor.id, true);
        if (channels.length > 0) {
          const allowByPlugin = !plugin || !plugin.shouldNotify || plugin.shouldNotify(change, monitor, options);
        if (allowByPlugin && shouldNotify) {
          const { immediate, weekly } = this.partitionChannels(channels);
          const displayUrl = plugin?.linkForPrompt?.({ monitor, options });
          if (immediate.length > 0) {
            await this.notificationService.sendNotifications(change, monitor, immediate, displayUrl);
          }
          if (weekly.length > 0) {
            this.enqueueWeeklyDigest(change, weekly);
          }
        } else if (!shouldNotify && skipReason) {
          console.log(`[${this.timestamp()}] ${monitor.name}: notification skipped (${skipReason})`);
        }
      }

        this.cleanupMonitorHistory(monitor.id);
        return { success: true, message: `Change detected: ${diffResult.summary}`, hasChange: true };
      }

      // First snapshot for this monitor
      const notifyOnFirst = (this.db.getSetting('notify_on_first_snapshot') || '').toLowerCase() === 'true';
      console.log(`[${this.timestamp()}] ${monitor.name}: first snapshot created`);
      this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());

      if (notifyOnFirst) {
        const diffResult = this.differ.generateDiff('', content, monitor);
        const summaryResult = await this.summaryService.generateSummary(monitor, diffResult.diffMarkdown || content);
        const structured = summaryResult?.structured ?? null;
        if (structured && structured.status === 'no_changes') {
          console.log(`[${this.timestamp()}] ${monitor.name}: initial snapshot suppressed (no changes)`);
        } else {
          const aiSummary = summaryResult?.text ?? null;
          const aiSummaryMeta = structured ? JSON.stringify(structured) : null;
          const shouldNotify = structured ? structured.shouldNotify !== false : true;
          const skipReason = structured?.skipReason;
          const change = this.db.createChange({
            monitorId: monitor.id,
            beforeSnapshotId: null,
            afterSnapshotId: newSnapshot.id,
            summary: diffResult.summary,
            diffMd: diffResult.diffMarkdown,
            diffType: diffResult.diffType,
            aiSummary,
            aiSummaryMeta,
          });

          const channels = this.db.getMonitorChannels(monitor.id, true);
          if (channels.length > 0 && shouldNotify) {
            const displayUrl = plugin?.linkForPrompt?.({ monitor, options });
            const { immediate, weekly } = this.partitionChannels(channels);
            if (immediate.length > 0) {
              await this.notificationService.sendNotifications(change, monitor, immediate, displayUrl);
            }
            if (weekly.length > 0) {
              this.enqueueWeeklyDigest(change, weekly);
            }
          } else if (!shouldNotify && skipReason) {
            console.log(`[${this.timestamp()}] ${monitor.name}: initial notification skipped (${skipReason})`);
          }
        }
      }

      this.cleanupMonitorHistory(monitor.id);
      return { success: true, message: 'First snapshot created', hasChange: false };
    } catch (error: unknown) {
      const e = error as Error;
      console.error(`[${this.timestamp()}] ${monitor.name}: error: ${e?.message || e}`);
      if ((e as Error)?.stack) console.error((e as Error).stack);
      return { success: false, message: e?.message || 'Unknown error' };
    }
  }

  private async processReleaseSlices(
    monitor: Monitor,
    releases: PluginRelease[],
    plugin: ReturnType<typeof resolvePlugin>['plugin'],
    options: unknown,
  ): Promise<{ success: boolean; message: string; hasChange?: boolean }> {
    if (!releases.length) {
      return { success: true, message: 'No releases available', hasChange: false };
    }

    const latestSnapshot = this.db.getLatestSnapshot(monitor.id);
    const latestReleaseSnapshot = this.db.getLatestSnapshotWithRelease(monitor.id);
    const existingVersion = latestReleaseSnapshot?.releaseVersion ?? null;

    let newSlices: PluginRelease[];
    if (!existingVersion) {
      newSlices = [releases[0]]; // seed with the newest release only
    } else {
      newSlices = [];
      for (const slice of releases) {
        if (slice.version === existingVersion) break;
        newSlices.push(slice);
      }
    }

    if (newSlices.length === 0) {
      this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());
      return { success: true, message: 'No new releases', hasChange: false };
    }

    const slicesChrono = [...newSlices].reverse();
    let previousSnapshot: Snapshot | undefined = latestSnapshot ?? undefined;
    let hasChange = false;
    let changeCreated = false;
    const suppressFirstChange = !existingVersion;
    const notifyCandidates: Array<{ change: Change; meta: StructuredSummary | null; slice?: PluginRelease }> = [];
    const suppressedReasons: string[] = [];

    for (const slice of slicesChrono) {
      if (this.db.getSnapshotByVersion(monitor.id, slice.version)) {
        previousSnapshot = this.db.getSnapshotByVersion(monitor.id, slice.version) ?? previousSnapshot;
        continue;
      }

      const heading = `## ${(slice as any).title ?? slice.version}`;
      const markdown = `${heading}\n\n${slice.markdown}`.trim();
      const hash = await this.hashContent(markdown);

      const snapshot = this.db.createSnapshot({
        monitorId: monitor.id,
        contentHash: hash,
        contentMd: markdown,
        releaseVersion: slice.version,
      });

      const shouldSkipChange: boolean = suppressFirstChange && !changeCreated;

      if (!previousSnapshot || shouldSkipChange) {
        previousSnapshot = snapshot;
        changeCreated = changeCreated || !shouldSkipChange;
        continue;
      }

      const diffResult = this.differ.generateDiff(previousSnapshot.contentMd, markdown, monitor);
      const hasMeaningful = diffResult.changes && diffResult.changes.length > 0;
      if (!hasMeaningful) {
        previousSnapshot = snapshot;
        continue;
      }

      let summaryResult = null as Awaited<ReturnType<SummaryService['generateSummary']>> | null;
      const wantAI = plugin?.useAISummary ? plugin.useAISummary({ monitor, slice, options }) : true;
      if (wantAI) {
        summaryResult = await this.summaryService.generateSummary(
          monitor,
          diffResult.diffMarkdown,
          (slice as any).aiExtra ?? undefined
        );
      }
      const structured = summaryResult?.structured ?? null;
      if (structured && structured.status === 'no_changes') {
        console.log(`[${this.timestamp()}] ${monitor.name} ${slice.version}: snapshot only (no user-facing changes)`);
        previousSnapshot = snapshot;
        continue;
      }

      const aiText = summaryResult?.text ?? null;
      let formattedSummary = this.formatReleaseSummary(monitor.name, slice.version, aiText);
      if (plugin?.formatAISummary) {
        const overridden = plugin.formatAISummary({ monitor, slice, aiText, options });
        if (typeof overridden === 'string' && overridden.trim().length > 0) {
          formattedSummary = overridden.trim();
        }
      }
      const aiSummaryMeta = structured ? JSON.stringify(structured) : null;
      const shouldNotify = structured ? structured.shouldNotify !== false : true;
      const skipReason = structured?.skipReason;

      const change = this.db.createChange({
        monitorId: monitor.id,
        beforeSnapshotId: previousSnapshot.id,
        afterSnapshotId: snapshot.id,
        summary: diffResult.summary,
        diffMd: diffResult.diffMarkdown,
        diffType: diffResult.diffType,
        aiSummary: formattedSummary,
        releaseVersion: slice.version,
        aiSummaryMeta,
      });

      // Minimal release log: "<name> <version> released"
      console.log(`[${this.timestamp()}] ${monitor.name} ${slice.version} released`);

      const pluginAllows = !plugin || !plugin.shouldNotify || plugin.shouldNotify(change, monitor, options);
      if (shouldNotify && pluginAllows) {
        notifyCandidates.push({ change, meta: structured, slice });
      } else if (!shouldNotify && skipReason) {
        suppressedReasons.push(`${slice.version}: ${skipReason}`);
      }

      hasChange = true;
      changeCreated = true;
      previousSnapshot = snapshot;
    }

    this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());

    if (!hasChange && suppressFirstChange) {
      console.log(`[${this.timestamp()}] ${monitor.name}: release snapshot seeded (${newSlices[0].version})`);
    }

    const channels = this.db.getMonitorChannels(monitor.id, true);
    if (channels.length > 0) {
      const { immediate, weekly } = this.partitionChannels(channels);
      const defaultDisplayUrl = plugin?.linkForPrompt?.({ monitor, options });

      if (notifyCandidates.length > 0) {
        if (immediate.length > 0) {
          if (notifyCandidates.length === 1) {
            const only = notifyCandidates[0];
            const perSliceUrl = plugin?.linkForSlice?.({ monitor, slice: only.slice!, options }) ?? defaultDisplayUrl;
            await this.notificationService.sendNotifications(
              only.change,
              monitor,
              immediate,
              perSliceUrl
            );
          } else {
            const aggregated = buildAggregatedSummary(
              monitor.name,
              notifyCandidates
            );
            const latestChange = notifyCandidates[notifyCandidates.length - 1].change;
            const fallbackPieces = notifyCandidates
              .map(({ change }) => change.aiSummary ?? change.summary ?? '')
              .filter((text) => text && text.trim().length > 0);
            let summaryText = aggregated?.markdown || fallbackPieces.join('\n\n');
            if (!summaryText || summaryText.trim().length === 0) {
              summaryText = `**${monitor.name}: recent releases**\n- ${notifyCandidates.length} releases recorded.`;
            }
            summaryText = summaryText.trim();
            if (summaryText.length > 0) {
              const eventRefs = notifyCandidates.map(({ change }) => ({
                changeId: change.id,
                releaseVersion: change.releaseVersion ?? null,
              }));
              const aggregatedChange: Change = {
                ...latestChange,
                aiSummary: summaryText,
                aiSummaryMeta: null,
              };
              await this.notificationService.sendNotifications(
                aggregatedChange,
                monitor,
                immediate,
                defaultDisplayUrl,
                { eventChangeRefs: eventRefs, eventDetail: aggregated?.title ?? 'release bundle' }
              );
            }
          }
        }
        if (weekly.length > 0) {
          for (const candidate of notifyCandidates) {
            this.enqueueWeeklyDigest(candidate.change, weekly);
          }
        }
      } else if (suppressedReasons.length > 0) {
        console.log(`[${this.timestamp()}] ${monitor.name}: release notification skipped (${suppressedReasons[0]})`);
      }
    }

    const message = hasChange
      ? `Recorded ${newSlices.length} new release${newSlices.length === 1 ? '' : 's'}`
      : 'No changes detected';
    this.cleanupMonitorHistory(monitor.id);
    return { success: true, message, hasChange };
  }

  private formatReleaseSummary(monitorName: string, version: string, summary: string | null | undefined): string {
    const heading = `**${monitorName} ${version} released**`;
    if (!summary) return heading;
    const stripped = summary.replace(/^\s*\*\*[^\n]+\*\*\s*/i, '').trim();
    if (!stripped) return heading;
    return `${heading}\n${stripped}`;
  }

  private partitionChannels(channels: ChannelWithConfig[]): { immediate: ChannelWithConfig[]; weekly: ChannelWithConfig[] } {
    const immediate: ChannelWithConfig[] = [];
    const weekly: ChannelWithConfig[] = [];
    for (const channel of channels) {
      const mode = channel.deliveryMode === 'weekly_digest' ? 'weekly_digest' : 'immediate';
      if (mode === 'weekly_digest') weekly.push(channel);
      else immediate.push(channel);
    }
    return { immediate, weekly };
  }

  private computeWeeklyDigestTarget(referenceIso?: string): { digestAt: string; digestKey: string; periodStart: string; periodEnd: string } {
    const reference = referenceIso ? new Date(referenceIso) : new Date();
    if (Number.isNaN(reference.getTime())) reference.setTime(Date.now());
    const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
    const weekday = start.getUTCDay(); // 0 = Sunday
    const offset = (weekday + 6) % 7; // Monday start
    start.setUTCDate(start.getUTCDate() - offset);
    const send = new Date(start);
    send.setUTCDate(send.getUTCDate() + 7);
    send.setUTCHours(9, 0, 0, 0);
    const startIso = start.toISOString();
    const sendIso = send.toISOString();
    return {
      digestAt: sendIso,
      digestKey: startIso.slice(0, 10),
      periodStart: startIso,
      periodEnd: sendIso,
    };
  }

  private enqueueWeeklyDigest(change: Change, weeklyChannels: ChannelWithConfig[]): void {
    if (!weeklyChannels.length) return;
    const target = this.computeWeeklyDigestTarget(change.createdAt ?? undefined);
    for (const channel of weeklyChannels) {
      const channelIdRaw = typeof channel.id === 'number' ? channel.id : Number(channel.id);
      if (!Number.isFinite(channelIdRaw)) continue;
      this.db.addChannelDigestItem({
        monitorId: change.monitorId,
        channelId: channelIdRaw,
        changeId: change.id,
        digestAt: target.digestAt,
        digestKey: target.digestKey,
      });
    }
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async checkAllActiveMonitors(): Promise<void> {
    const monitors = this.db.listMonitors(true);

    if (monitors.length === 0) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`\n[${timestamp}] === Checking ${monitors.length} active monitor${monitors.length !== 1 ? 's' : ''} ===`);

    let changesDetected = 0;

    for (const monitor of monitors) {
      // Check if it's time to check this monitor
      if (!this.shouldCheck(monitor)) {
        continue;
      }

      const result = await this.checkMonitor(monitor);
      if (result.hasChange) {
        changesDetected++;
      }

      // Update last checked time
      this.db.updateMonitorLastChecked(monitor.id, new Date().toISOString());

      // Add a small delay between checks to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (changesDetected === 0) {
      console.log(`[${timestamp}] === No changes found ===`);
    }
    console.log(`[${timestamp}] === Check complete ===\n`);
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

  private isHtml(content: string): boolean {
    return content.trim().toLowerCase().startsWith('<!doctype html') ||
           content.trim().toLowerCase().startsWith('<html');
  }

  private async hashContent(content: string): Promise<string> {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(content);
    return hasher.digest('hex');
  }

  private cleanupMonitorHistory(monitorId: number): void {
    const keepSnapshots = this.readRetentionSetting('retention_snapshots', 20);
    const keepChanges = this.readRetentionSetting('retention_changes', 20);
    this.db.cleanupMonitorHistory(monitorId, keepSnapshots, keepChanges);
  }

  private readRetentionSetting(key: string, fallback: number): number {
    const envKey = key.toUpperCase();
    const raw = this.db.getSetting(key) ?? process.env[envKey];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }
}

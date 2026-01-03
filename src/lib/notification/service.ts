import type { Change, Monitor } from '@/db';
import type { DB } from '@/db';
import type { ChannelWithConfig } from '../channel';
import { resolveNotificationChannelPlugin } from '../channel';
import type { Notifier } from './types';

export type NotificationSendResult = {
  channel: ChannelWithConfig;
  ok: boolean;
  error?: string;
};

type NotificationServiceLogger = {
  error?: (msg: string) => void;
  warn?: (msg: string) => void;
  info?: (msg: string) => void;
};

type NotificationServiceOptions = {
  overrides?: Record<string, Notifier<any>>;
  logger?: NotificationServiceLogger;
};

type NotificationEventRef = {
  changeId: number | null;
  releaseVersion?: string | null;
};

export class NotificationService {
  private notifiers = new Map<string, Notifier<any>>();
  private overrides: Record<string, Notifier<any>>;
  private logger: NotificationServiceLogger;

  constructor(private db: DB, options: NotificationServiceOptions = {}) {
    this.overrides = options.overrides ?? {};
    this.logger = options.logger ?? console;
  }

  private logError(message: string) {
    if (this.logger.error) this.logger.error(message);
  }

  private logInfo(message: string) {
    if (this.logger.info) this.logger.info(message);
  }

  private getNotifier(type: string): Notifier<any> | undefined {
    if (this.overrides[type]) {
      return this.overrides[type];
    }

    let notifier = this.notifiers.get(type);
    if (!notifier) {
      const plugin = resolveNotificationChannelPlugin(type);
      if (!plugin) return undefined;
      notifier = plugin.createNotifier();
      this.notifiers.set(type, notifier);
    }
    return notifier;
  }

  private recordEvent(changeId: number | null, channelId: number | null, status: 'sent' | 'failed', detail?: string, releaseVersion?: string) {
    if (changeId === null || channelId === null) return;
    try {
      this.db.recordNotificationEvent({
        changeId,
        channelId,
        status,
        detail: detail ?? null,
        releaseVersion: releaseVersion ?? null,
      });
    } catch (error) {
      this.logError('Failed to record notification event');
    }
  }

  async sendNotifications(
    change: Change,
    monitor: Monitor,
    channels: ChannelWithConfig[],
    displayUrl?: string,
    options: { allowRepeat?: boolean; eventChangeRefs?: NotificationEventRef[]; eventDetail?: string } = {}
  ): Promise<NotificationSendResult[]> {
    const { allowRepeat = false, eventChangeRefs, eventDetail } = options;
    const activeChannels = channels.filter((c) => c.active === true);
    if (activeChannels.length === 0) {
      return [];
    }

    const changeIdNumeric = typeof change.id === 'number' ? change.id : Number(change.id);
    const defaultEventRef: NotificationEventRef = {
      changeId: Number.isFinite(changeIdNumeric) ? changeIdNumeric : null,
      releaseVersion: change.releaseVersion ?? null,
    };
    const rawEventRefs: NotificationEventRef[] =
      eventChangeRefs && eventChangeRefs.length > 0
        ? eventChangeRefs.map((ref) => ({
            changeId: ref.changeId ?? null,
            releaseVersion: ref.releaseVersion ?? null,
          }))
        : [defaultEventRef];

    const filteredRefs = allowRepeat
      ? rawEventRefs
      : rawEventRefs.filter((ref) => {
          if (ref.releaseVersion) {
            return !this.db.hasSentNotificationForVersion(monitor.id, ref.releaseVersion);
          }
          return true;
        });

    const seen = new Set<string>();
    const eventRefs: NotificationEventRef[] = [];
    for (const ref of filteredRefs) {
      const key = `${ref.changeId ?? 'null'}:${ref.releaseVersion ?? 'null'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      eventRefs.push(ref);
    }

    if (eventRefs.length === 0) {
      return [];
    }

    const effectiveChange: Change = {
      ...change,
      summary: (change as unknown as { aiSummary?: string }).aiSummary || change.summary,
    } as Change;

    const results: NotificationSendResult[] = [];

    await Promise.all(
      activeChannels.map(async (channel) => {
        const plugin = resolveNotificationChannelPlugin(channel.type);
        const channelId = typeof channel.id === 'number' ? channel.id : Number(channel.id);
        const validChannelId = Number.isFinite(channelId) ? channelId : null;

        if (!plugin) {
          const error = `Unknown notification type: ${channel.type}`;
          this.logError(error);
          for (const ref of eventRefs) {
            this.recordEvent(ref.changeId, validChannelId, 'failed', 'unknown notification type', ref.releaseVersion ?? undefined);
          }
          results.push({ channel, ok: false, error });
          return;
        }

        const parsedConfig = plugin.configSchema.safeParse(channel.config);
        if (!parsedConfig.success) {
          const error = `Invalid configuration for channel '${channel.name}'`;
          this.logError(error);
          for (const ref of eventRefs) {
            this.recordEvent(ref.changeId, validChannelId, 'failed', 'invalid configuration', ref.releaseVersion ?? undefined);
          }
          results.push({ channel, ok: false, error });
          return;
        }

        const notifier = this.getNotifier(channel.type);
        if (!notifier) {
          const error = `No notifier available for type: ${channel.type}`;
          this.logError(error);
          for (const ref of eventRefs) {
            this.recordEvent(ref.changeId, validChannelId, 'failed', 'missing notifier', ref.releaseVersion ?? undefined);
          }
          results.push({ channel, ok: false, error });
          return;
        }

        const typedChannel = {
          ...channel,
          config: parsedConfig.data,
        };

        const includeLinkEffective = (channel.includeLink ?? monitor.includeLink) ? true : false;
        const effMonitor = { ...monitor, includeLink: includeLinkEffective } as Monitor;

        try {
          const ok = await notifier.send(effectiveChange, effMonitor, typedChannel, displayUrl);
          if (ok) {
            for (const ref of eventRefs) {
              this.recordEvent(ref.changeId, validChannelId, 'sent', eventDetail, ref.releaseVersion ?? undefined);
            }
            results.push({ channel, ok: true });
          } else {
            const error = 'Notifier returned false';
            for (const ref of eventRefs) {
              this.recordEvent(ref.changeId, validChannelId, 'failed', error, ref.releaseVersion ?? undefined);
            }
            results.push({ channel, ok: false, error });
          }
        } catch (err: unknown) {
          const e = err as Error;
          const message = e?.message || 'unknown error';
          this.logError(`Notification error [${channel.type}:${channel.name}]: ${message}`);
          for (const ref of eventRefs) {
            this.recordEvent(ref.changeId, validChannelId, 'failed', message, ref.releaseVersion ?? undefined);
          }
          results.push({ channel, ok: false, error: message });
        }
      })
    );

    return results;
  }
}

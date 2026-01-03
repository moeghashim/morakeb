import type { NotificationChannel } from '@/db';
import { getNotificationChannelPlugin, listNotificationChannelPlugins } from './notification/plugins';

export type ChannelWithConfig = NotificationChannel & {
  type: string;
  config: unknown;
  includeLink?: boolean | null;
  deliveryMode?: 'immediate' | 'weekly_digest';
  lastDigestAt?: string | null;
};

export function validateChannelConfig(type: string, value: unknown): unknown {
  const plugin = getNotificationChannelPlugin(type);
  if (!plugin) {
    throw new Error(`Unsupported channel type: ${type}`);
  }
  return plugin.configSchema.parse(value);
}

export const notificationChannelPlugins = listNotificationChannelPlugins;
export const resolveNotificationChannelPlugin = getNotificationChannelPlugin;

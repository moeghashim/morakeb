import type { NotificationChannelPlugin } from './types';
import { telegramNotificationPlugin } from './telegram';
import { instagramNotificationPlugin } from './instagram';

const registry: NotificationChannelPlugin[] = [
  telegramNotificationPlugin,
  instagramNotificationPlugin,
];

export function listNotificationChannelPlugins(): NotificationChannelPlugin[] {
  return registry;
}

export function getNotificationChannelPlugin(id: string): NotificationChannelPlugin | undefined {
  return registry.find((plugin) => plugin.id === id);
}

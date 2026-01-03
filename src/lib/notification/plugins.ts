import type { NotificationChannelPlugin } from './types';
import { telegramNotificationPlugin } from './telegram';

const registry: NotificationChannelPlugin[] = [
  telegramNotificationPlugin,
];

export function listNotificationChannelPlugins(): NotificationChannelPlugin[] {
  return registry;
}

export function getNotificationChannelPlugin(id: string): NotificationChannelPlugin | undefined {
  return registry.find((plugin) => plugin.id === id);
}

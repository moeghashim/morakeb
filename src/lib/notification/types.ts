import type { z } from 'zod';
import type { Change, Monitor, NotificationChannel } from '@/db';

export interface Notifier<TConfig = unknown> {
  send(
    change: Change,
    monitor: Monitor,
    channel: NotificationChannel & { config: TConfig; includeLink?: boolean | null },
    displayUrl?: string
  ): Promise<boolean>;
}

export type NotificationFormField = {
  field: 'name' | string;
  prompt: string;
  hint?: string;
  mask?: boolean;
};

export interface NotificationChannelPlugin<TConfig = unknown> {
  id: string;
  label: string;
  configSchema: z.ZodType<TConfig>;
  form: NotificationFormField[];
  createNotifier(): Notifier<TConfig>;
}

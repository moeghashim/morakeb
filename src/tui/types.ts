import type { Monitor, NotificationChannel } from '../db/schema';

export type Screen =
  | 'main'
  | 'list'
  | 'add'
  | 'channels'
  | 'add-channel'
  | 'link-channel'
  | 'monitor-detail'
  | 'monitor-snapshots'
  | 'snapshot-actions'
  | 'add-channels-to-monitor'
  | 'channel-detail'
  | 'edit-monitor'
  | 'edit-channel'
  | 'view-linked-channels'
  | 'confirm-delete-monitor'
  | 'confirm-delete-channel'
  | 'confirm-unlink-monitor-channel'
  | 'monitor-channel-actions'
  | 'monitor-changes'
  | 'change-detail'
  | 'resend-change-channels'
  | 'settings'
  | 'edit-ai'
  | 'notifications-settings'
  | 'retention-settings'
  | 'plugin-settings'
  | 'pick-model'
  | 'pick-provider'
  | 'edit-provider-key'
  ;

export type { Monitor, NotificationChannel };
export type { Change } from '../db/schema';
export type { Snapshot } from '../db/schema';

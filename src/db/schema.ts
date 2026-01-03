import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Monitors table
export const monitors = sqliteTable('monitors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  intervalMinutes: integer('interval_minutes').notNull().default(60),
  type: text('type', { enum: ['webpage', 'api', 'markdown', 'xml'] }).notNull().default('webpage'),
  selector: text('selector'),
  includeLink: integer('include_link', { mode: 'boolean' }).notNull().default(true),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  lastCheckedAt: text('last_checked_at'),
});

// Snapshots table
export const snapshots = sqliteTable('snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  contentHash: text('content_hash').notNull(),
  contentMd: text('content_md').notNull(),
  releaseVersion: text('release_version'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  monitorIdx: index('idx_snapshots_monitor_id').on(table.monitorId),
  versionIdx: index('idx_snapshots_monitor_release').on(table.monitorId, table.releaseVersion),
  versionUnique: unique('uq_snapshots_monitor_release').on(table.monitorId, table.releaseVersion),
  createdIdx: index('idx_snapshots_created_at').on(table.createdAt),
}));

// Changes table with AI summary support
export const changes = sqliteTable('changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  beforeSnapshotId: integer('before_snapshot_id').references(() => snapshots.id, { onDelete: 'set null' }),
  afterSnapshotId: integer('after_snapshot_id').notNull().references(() => snapshots.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  aiSummary: text('ai_summary'), // NEW: AI-generated summary
  diffMd: text('diff_md'),
  diffType: text('diff_type', { enum: ['addition', 'modification', 'deletion'] }),
  releaseVersion: text('release_version'),
  aiSummaryMeta: text('ai_summary_meta'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  monitorIdx: index('idx_changes_monitor_id').on(table.monitorId),
  versionIdx: index('idx_changes_monitor_release').on(table.monitorId, table.releaseVersion),
  createdIdx: index('idx_changes_created_at').on(table.createdAt),
}));

// Notification channels table
export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  encryptedConfig: text('encrypted_config').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Many-to-many relationship between monitors and notification channels
export const monitorNotificationChannels = sqliteTable('monitor_notification_channels', {
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' }),
  // Per-link options
  includeLink: integer('include_link', { mode: 'boolean' }), // null = inherit from monitor
  deliveryMode: text('delivery_mode').notNull().default('immediate'),
  lastDigestAt: text('last_digest_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.monitorId, table.channelId] }),
  monitorIdx: index('idx_monitor_notification_channels_monitor').on(table.monitorId),
  channelIdx: index('idx_monitor_notification_channels_channel').on(table.channelId),
}));

export const channelDigestItems = sqliteTable('channel_digest_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' }),
  changeId: integer('change_id').notNull().references(() => changes.id, { onDelete: 'cascade' }),
  digestAt: text('digest_at').notNull(),
  digestKey: text('digest_key').notNull(),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  idxDigestPending: index('idx_digest_pending').on(table.digestAt, table.sentAt),
  idxDigestChannel: index('idx_digest_channel').on(table.monitorId, table.channelId),
  uqDigestChannelChange: unique('uq_digest_channel_change').on(table.channelId, table.changeId),
}));

export const notificationEvents = sqliteTable('notification_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  changeId: integer('change_id').notNull().references(() => changes.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['sent', 'failed'] }).notNull(),
  detail: text('detail'),
  releaseVersion: text('release_version'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  changeIdx: index('idx_notification_events_change').on(table.changeId),
  channelIdx: index('idx_notification_events_channel').on(table.channelId),
  versionIdx: index('idx_notification_events_version').on(table.changeId, table.releaseVersion),
}));

// Settings table for app-level configuration
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// AI providers and models
export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(), // 'droid' | 'anthropic' | 'openai' | 'google'
  name: text('name').notNull(),
  encryptedApiKey: text('encrypted_api_key'),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const aiModels = sqliteTable('ai_models', {
  id: text('id').primaryKey(), // model id, e.g., 'claude-haiku-4-5'
  providerId: text('provider_id').notNull().references(() => aiProviders.id, { onDelete: 'cascade' }),
  display: text('display').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Generic job locks table for background workers
export const jobLocks = sqliteTable('job_locks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  key: text('key').notNull(),
  jobId: integer('job_id').notNull(),
  acquiredAt: text('acquired_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  uqTypeKey: unique('uq_job_locks_type_key').on(table.type, table.key),
  jobIdx: index('idx_job_locks_job_id').on(table.jobId),
  acquiredIdx: index('idx_job_locks_acquired_at').on(table.acquiredAt),
}));

// Job events for auditing background processing
export const jobEvents = sqliteTable('job_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id'),
  type: text('type').notNull(),
  status: text('status', { enum: ['queued','started','skipped','done','failed'] }).notNull(),
  monitorId: integer('monitor_id').references(() => monitors.id, { onDelete: 'set null' }),
  message: text('message'),
  error: text('error'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  jobIdx: index('idx_job_events_job_id').on(table.jobId),
  typeIdx: index('idx_job_events_type').on(table.type),
  statusIdx: index('idx_job_events_status').on(table.status),
  createdIdx: index('idx_job_events_created_at').on(table.createdAt),
}));

// TypeScript types inferred from schema
export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;

export type Change = typeof changes.$inferSelect;
export type NewChange = typeof changes.$inferInsert;

export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;

export type MonitorNotificationChannel = typeof monitorNotificationChannels.$inferSelect;
export type NewMonitorNotificationChannel = typeof monitorNotificationChannels.$inferInsert;

export type NotificationEvent = typeof notificationEvents.$inferSelect;
export type NewNotificationEvent = typeof notificationEvents.$inferInsert;

export type ChannelDigestItem = typeof channelDigestItems.$inferSelect;
export type NewChannelDigestItem = typeof channelDigestItems.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type AIProvider = typeof aiProviders.$inferSelect;
export type NewAIProvider = typeof aiProviders.$inferInsert;
export type AIModel = typeof aiModels.$inferSelect;
export type NewAIModel = typeof aiModels.$inferInsert;

export type JobLock = typeof jobLocks.$inferSelect;
export type NewJobLock = typeof jobLocks.$inferInsert;
export type JobEvent = typeof jobEvents.$inferSelect;
export type NewJobEvent = typeof jobEvents.$inferInsert;

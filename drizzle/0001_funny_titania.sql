ALTER TABLE `changes` ADD `release_version` text;--> statement-breakpoint
CREATE INDEX `idx_changes_monitor_release` ON `changes` (`monitor_id`,`release_version`);--> statement-breakpoint
ALTER TABLE `notification_events` ADD `release_version` text;--> statement-breakpoint
CREATE INDEX `idx_notification_events_version` ON `notification_events` (`change_id`,`release_version`);--> statement-breakpoint
ALTER TABLE `snapshots` ADD `release_version` text;--> statement-breakpoint
CREATE INDEX `idx_snapshots_monitor_release` ON `snapshots` (`monitor_id`,`release_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_snapshots_monitor_release` ON `snapshots` (`monitor_id`,`release_version`);
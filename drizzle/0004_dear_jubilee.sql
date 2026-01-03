CREATE TABLE `channel_digest_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`channel_id` integer NOT NULL,
	`change_id` integer NOT NULL,
	`digest_at` text NOT NULL,
	`digest_key` text NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`change_id`) REFERENCES `changes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_digest_pending` ON `channel_digest_items` (`digest_at`,`sent_at`);--> statement-breakpoint
CREATE INDEX `idx_digest_channel` ON `channel_digest_items` (`monitor_id`,`channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_digest_channel_change` ON `channel_digest_items` (`channel_id`,`change_id`);--> statement-breakpoint
ALTER TABLE `changes` ADD `ai_summary_meta` text;--> statement-breakpoint
ALTER TABLE `monitor_notification_channels` ADD `delivery_mode` text DEFAULT 'immediate' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_notification_channels` ADD `last_digest_at` text;
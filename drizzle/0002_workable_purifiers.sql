CREATE TABLE `job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`monitor_id` integer,
	`message` text,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_job_events_job_id` ON `job_events` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_job_events_type` ON `job_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_job_events_status` ON `job_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_job_events_created_at` ON `job_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `job_locks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`job_id` integer NOT NULL,
	`acquired_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_job_locks_job_id` ON `job_locks` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_job_locks_acquired_at` ON `job_locks` (`acquired_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_job_locks_type_key` ON `job_locks` (`type`,`key`);
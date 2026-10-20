CREATE TABLE `pipeline_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payload` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_stage` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer
);

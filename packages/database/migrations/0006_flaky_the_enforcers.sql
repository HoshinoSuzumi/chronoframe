PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pipeline_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payload` text DEFAULT '{"type":"photo","storageKey":""}' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_stage` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_pipeline_queue`("id", "payload", "priority", "attempts", "max_attempts", "status", "status_stage", "error_message", "created_at", "completed_at") SELECT "id", "payload", "priority", "attempts", "max_attempts", "status", "status_stage", "error_message", "created_at", "completed_at" FROM `pipeline_queue`;--> statement-breakpoint
DROP TABLE `pipeline_queue`;--> statement-breakpoint
ALTER TABLE `__new_pipeline_queue` RENAME TO `pipeline_queue`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
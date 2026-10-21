CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`namespace` text DEFAULT 'common' NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`value` text,
	`default_value` text,
	`label` text,
	`description` text,
	`is_public` integer DEFAULT false NOT NULL,
	`is_readonly` integer DEFAULT false NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`enum` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_namespace_key` ON `settings` (`namespace`,`key`);--> statement-breakpoint
CREATE TABLE `settings_storage_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

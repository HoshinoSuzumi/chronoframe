CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`description` text,
	`width` integer,
	`height` integer,
	`aspect_ratio` real,
	`date_taken` text,
	`storage_key` text,
	`file_size` integer,
	`last_modified` text,
	`original_url` text,
	`thumbnail_url` text,
	`thumbnail_hash` text,
	`tags` text,
	`exif` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_id_unique` ON `photos` (`id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text,
	`avatar` text,
	`created_at` integer NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE TABLE `album_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`photo_id` text NOT NULL,
	`position` real DEFAULT 1000000 NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`cover_photo_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cover_photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `photo_reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` text NOT NULL,
	`reaction_type` text NOT NULL,
	`fingerprint` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);

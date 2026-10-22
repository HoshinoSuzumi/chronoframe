ALTER TABLE `photos` ADD `is_live_photo` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `live_photo_video_url` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `live_photo_video_key` text;
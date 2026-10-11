ALTER TABLE `pipeline_queue` ADD `available_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_pipeline_queue_pending` ON `pipeline_queue` ("priority" DESC,`created_at`,`id`) WHERE "pipeline_queue"."status" = 'pending';

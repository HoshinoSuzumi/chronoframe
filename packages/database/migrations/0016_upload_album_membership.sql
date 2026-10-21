ALTER TABLE `pipeline_queue` ADD `warning_code` text;--> statement-breakpoint
DELETE FROM `album_photos`
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `album_id`, `photo_id`
      ORDER BY `position`, `id`
    ) AS `rank`
    FROM `album_photos`
  ) WHERE `rank` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `album_photos_album_photo_unique` ON `album_photos` (`album_id`,`photo_id`);

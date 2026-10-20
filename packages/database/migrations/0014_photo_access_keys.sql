CREATE TABLE `photo_access_keys` (
	`access_key` text NOT NULL,
	`photo_id` text NOT NULL,
	PRIMARY KEY(`access_key`, `photo_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_photo_access_keys_photo_id` ON `photo_access_keys` (`photo_id`);
--> statement-breakpoint
-- Keep photo_access_keys aligned with photos. Storage keys stay as the object
-- provider stored them; only this lookup table holds the tidied aliases.
-- Tidying matches the local storage provider's sanitizeKey, and also strips a single
-- /storage/ or /image/ prefix so a file request can hit the public URL.
-- Absolute http(s) URLs are stored unchanged (`https://` must not collapse).
CREATE TRIGGER `photos_access_keys_insert`
AFTER INSERT ON `photos`
BEGIN
  INSERT OR IGNORE INTO `photo_access_keys` (`access_key`, `photo_id`)
  WITH RECURSIVE
  `raw`(`value`, `kind`) AS (
    SELECT NEW.`id`, 'id'
    UNION ALL SELECT NEW.`storage_key`, 'path'
    UNION ALL SELECT NEW.`thumbnail_key`, 'path'
    UNION ALL SELECT NEW.`original_url`, 'path'
    UNION ALL SELECT NEW.`thumbnail_url`, 'path'
    UNION ALL SELECT NEW.`live_photo_video_key`, 'path'
    UNION ALL SELECT NEW.`live_photo_video_url`, 'path'
  ),
  `present`(`value`, `kind`) AS (
    SELECT `value`, `kind` FROM `raw`
    WHERE `value` IS NOT NULL AND `value` != ''
  ),
  `slashed`(`value`, `kind`, `absolute`, `step`) AS (
    SELECT
      CASE
        WHEN `kind` = 'id' THEN `value`
        WHEN lower(`value`) LIKE 'http://%' OR lower(`value`) LIKE 'https://%' THEN `value`
        ELSE replace(`value`, char(92), '/')
      END,
      `kind`,
      CASE
        WHEN `kind` = 'id' THEN 1
        WHEN lower(`value`) LIKE 'http://%' OR lower(`value`) LIKE 'https://%' THEN 1
        ELSE 0
      END,
      0
    FROM `present`
    UNION ALL
    SELECT replace(`value`, '//', '/'), `kind`, `absolute`, `step` + 1
    FROM `slashed`
    WHERE `absolute` = 0 AND instr(`value`, '//') > 0 AND `step` < 64
  ),
  `stable`(`value`, `kind`, `absolute`) AS (
    SELECT `value`, `kind`, `absolute` FROM `slashed`
    WHERE `absolute` = 1 OR instr(`value`, '//') = 0 OR `step` = 64
  ),
  `derived`(`access_key`) AS (
    SELECT `value` FROM `present`
    UNION ALL
    SELECT ltrim(`value`, '/') FROM `stable`
    WHERE `absolute` = 0 AND ltrim(`value`, '/') != ''
    UNION ALL
    SELECT ltrim(substr(`value`, 10), '/') FROM `stable`
    WHERE `absolute` = 0
      AND `kind` = 'path'
      AND `value` LIKE '/storage/%'
      AND ltrim(substr(`value`, 10), '/') != ''
    UNION ALL
    SELECT ltrim(substr(`value`, 8), '/') FROM `stable`
    WHERE `absolute` = 0
      AND `kind` = 'path'
      AND `value` LIKE '/image/%'
      AND ltrim(substr(`value`, 8), '/') != ''
  )
  SELECT DISTINCT `access_key`, NEW.`id` FROM `derived`
  WHERE `access_key` IS NOT NULL AND `access_key` != '';
END;
--> statement-breakpoint
CREATE TRIGGER `photos_access_keys_update`
AFTER UPDATE ON `photos`
BEGIN
  DELETE FROM `photo_access_keys` WHERE `photo_id` = OLD.`id`;
  INSERT OR IGNORE INTO `photo_access_keys` (`access_key`, `photo_id`)
  WITH RECURSIVE
  `raw`(`value`, `kind`) AS (
    SELECT NEW.`id`, 'id'
    UNION ALL SELECT NEW.`storage_key`, 'path'
    UNION ALL SELECT NEW.`thumbnail_key`, 'path'
    UNION ALL SELECT NEW.`original_url`, 'path'
    UNION ALL SELECT NEW.`thumbnail_url`, 'path'
    UNION ALL SELECT NEW.`live_photo_video_key`, 'path'
    UNION ALL SELECT NEW.`live_photo_video_url`, 'path'
  ),
  `present`(`value`, `kind`) AS (
    SELECT `value`, `kind` FROM `raw`
    WHERE `value` IS NOT NULL AND `value` != ''
  ),
  `slashed`(`value`, `kind`, `absolute`, `step`) AS (
    SELECT
      CASE
        WHEN `kind` = 'id' THEN `value`
        WHEN lower(`value`) LIKE 'http://%' OR lower(`value`) LIKE 'https://%' THEN `value`
        ELSE replace(`value`, char(92), '/')
      END,
      `kind`,
      CASE
        WHEN `kind` = 'id' THEN 1
        WHEN lower(`value`) LIKE 'http://%' OR lower(`value`) LIKE 'https://%' THEN 1
        ELSE 0
      END,
      0
    FROM `present`
    UNION ALL
    SELECT replace(`value`, '//', '/'), `kind`, `absolute`, `step` + 1
    FROM `slashed`
    WHERE `absolute` = 0 AND instr(`value`, '//') > 0 AND `step` < 64
  ),
  `stable`(`value`, `kind`, `absolute`) AS (
    SELECT `value`, `kind`, `absolute` FROM `slashed`
    WHERE `absolute` = 1 OR instr(`value`, '//') = 0 OR `step` = 64
  ),
  `derived`(`access_key`) AS (
    SELECT `value` FROM `present`
    UNION ALL
    SELECT ltrim(`value`, '/') FROM `stable`
    WHERE `absolute` = 0 AND ltrim(`value`, '/') != ''
    UNION ALL
    SELECT ltrim(substr(`value`, 10), '/') FROM `stable`
    WHERE `absolute` = 0
      AND `kind` = 'path'
      AND `value` LIKE '/storage/%'
      AND ltrim(substr(`value`, 10), '/') != ''
    UNION ALL
    SELECT ltrim(substr(`value`, 8), '/') FROM `stable`
    WHERE `absolute` = 0
      AND `kind` = 'path'
      AND `value` LIKE '/image/%'
      AND ltrim(substr(`value`, 8), '/') != ''
  )
  SELECT DISTINCT `access_key`, NEW.`id` FROM `derived`
  WHERE `access_key` IS NOT NULL AND `access_key` != '';
END;
--> statement-breakpoint
CREATE TRIGGER `photos_access_keys_delete`
AFTER DELETE ON `photos`
BEGIN
  DELETE FROM `photo_access_keys` WHERE `photo_id` = OLD.`id`;
END;
--> statement-breakpoint
-- One-off backfill. Read path columns once; do not rewrite photo rows.
INSERT OR IGNORE INTO `photo_access_keys` (`access_key`, `photo_id`)
WITH RECURSIVE
`raw`(`photo_id`, `value`, `kind`) AS (
  SELECT `id`, `id`, 'id' FROM `photos`
  UNION ALL SELECT `id`, `storage_key`, 'path' FROM `photos`
  UNION ALL SELECT `id`, `thumbnail_key`, 'path' FROM `photos`
  UNION ALL SELECT `id`, `original_url`, 'path' FROM `photos`
  UNION ALL SELECT `id`, `thumbnail_url`, 'path' FROM `photos`
  UNION ALL SELECT `id`, `live_photo_video_key`, 'path' FROM `photos`
  UNION ALL SELECT `id`, `live_photo_video_url`, 'path' FROM `photos`
),
`present`(`photo_id`, `value`, `kind`) AS (
  SELECT `photo_id`, `value`, `kind` FROM `raw`
  WHERE `value` IS NOT NULL AND `value` != ''
),
`slashed`(`photo_id`, `value`, `kind`, `absolute`, `step`) AS (
  SELECT
    `photo_id`,
    CASE
      WHEN `kind` = 'id' THEN `value`
      WHEN lower(`value`) LIKE 'http://%' OR lower(`value`) LIKE 'https://%' THEN `value`
      ELSE replace(`value`, char(92), '/')
    END,
    `kind`,
    CASE
      WHEN `kind` = 'id' THEN 1
      WHEN lower(`value`) LIKE 'http://%' OR lower(`value`) LIKE 'https://%' THEN 1
      ELSE 0
    END,
    0
  FROM `present`
  UNION ALL
  SELECT `photo_id`, replace(`value`, '//', '/'), `kind`, `absolute`, `step` + 1
  FROM `slashed`
  WHERE `absolute` = 0 AND instr(`value`, '//') > 0 AND `step` < 64
),
`stable`(`photo_id`, `value`, `kind`, `absolute`) AS (
  SELECT `photo_id`, `value`, `kind`, `absolute` FROM `slashed`
  WHERE `absolute` = 1 OR instr(`value`, '//') = 0 OR `step` = 64
),
`derived`(`photo_id`, `access_key`) AS (
  SELECT `photo_id`, `value` FROM `present`
  UNION ALL
  SELECT `photo_id`, ltrim(`value`, '/') FROM `stable`
  WHERE `absolute` = 0 AND ltrim(`value`, '/') != ''
  UNION ALL
  SELECT `photo_id`, ltrim(substr(`value`, 10), '/') FROM `stable`
  WHERE `absolute` = 0
    AND `kind` = 'path'
    AND `value` LIKE '/storage/%'
    AND ltrim(substr(`value`, 10), '/') != ''
  UNION ALL
  SELECT `photo_id`, ltrim(substr(`value`, 8), '/') FROM `stable`
  WHERE `absolute` = 0
    AND `kind` = 'path'
    AND `value` LIKE '/image/%'
    AND ltrim(substr(`value`, 8), '/') != ''
)
SELECT DISTINCT `access_key`, `photo_id` FROM `derived`
WHERE `access_key` IS NOT NULL AND `access_key` != '';
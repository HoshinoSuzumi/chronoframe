CREATE TABLE workspaces (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE sites (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE memberships (workspace_id INTEGER NOT NULL REFERENCES workspaces(id), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('admin','member')), PRIMARY KEY(workspace_id,user_id));
--> statement-breakpoint
INSERT INTO workspaces(id,name) VALUES (1,'Default Workspace');
--> statement-breakpoint
INSERT INTO sites(id,workspace_id,name) VALUES (1,1,'Default Site');
--> statement-breakpoint
INSERT INTO memberships(workspace_id,user_id,role) SELECT 1,id,CASE WHEN is_admin = 1 THEN 'admin' ELSE 'member' END FROM users;
--> statement-breakpoint
CREATE TRIGGER default_user_membership AFTER INSERT ON users BEGIN INSERT OR IGNORE INTO memberships(workspace_id,user_id,role) VALUES(1,NEW.id,CASE WHEN NEW.is_admin = 1 THEN 'admin' ELSE 'member' END); END;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_photos_site ON photos(site_id);
--> statement-breakpoint
CREATE TRIGGER photos_site_immutable BEFORE UPDATE OF site_id ON photos WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE albums ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_albums_site ON albums(site_id);
--> statement-breakpoint
CREATE TRIGGER albums_site_immutable BEFORE UPDATE OF site_id ON albums WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE album_photos ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_album_photos_site ON album_photos(site_id);
--> statement-breakpoint
CREATE TRIGGER album_photos_site_immutable BEFORE UPDATE OF site_id ON album_photos WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE photo_access_keys ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_photo_access_keys_site ON photo_access_keys(site_id);
--> statement-breakpoint
CREATE TRIGGER photo_access_keys_site_immutable BEFORE UPDATE OF site_id ON photo_access_keys WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE photo_reactions ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_photo_reactions_site ON photo_reactions(site_id);
--> statement-breakpoint
CREATE TRIGGER photo_reactions_site_immutable BEFORE UPDATE OF site_id ON photo_reactions WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_pipeline_queue_site ON pipeline_queue(site_id);
--> statement-breakpoint
CREATE TRIGGER pipeline_queue_site_immutable BEFORE UPDATE OF site_id ON pipeline_queue WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_settings_site ON settings(site_id);
--> statement-breakpoint
CREATE TRIGGER settings_site_immutable BEFORE UPDATE OF site_id ON settings WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
ALTER TABLE settings_storage_providers ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id);
--> statement-breakpoint
CREATE INDEX idx_settings_storage_providers_site ON settings_storage_providers(site_id);
--> statement-breakpoint
CREATE TRIGGER settings_storage_providers_site_immutable BEFORE UPDATE OF site_id ON settings_storage_providers WHEN NEW.site_id != OLD.site_id BEGIN SELECT RAISE(ABORT,'site ownership is immutable'); END;
--> statement-breakpoint
DROP INDEX idx_namespace_key;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_namespace_key ON settings(site_id,namespace,key);
--> statement-breakpoint
ALTER TABLE settings_storage_providers ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE storage_connection_versions (connection_id INTEGER NOT NULL, revision INTEGER NOT NULL, site_id INTEGER NOT NULL REFERENCES sites(id), config TEXT NOT NULL, PRIMARY KEY(connection_id,revision));
--> statement-breakpoint
INSERT INTO storage_connection_versions SELECT id,revision,site_id,config FROM settings_storage_providers;
--> statement-breakpoint
CREATE TRIGGER storage_version_insert AFTER INSERT ON settings_storage_providers BEGIN INSERT INTO storage_connection_versions VALUES(NEW.id,NEW.revision,NEW.site_id,NEW.config); END;
--> statement-breakpoint
CREATE TRIGGER storage_version_update AFTER UPDATE OF config ON settings_storage_providers WHEN NEW.config != OLD.config BEGIN UPDATE settings_storage_providers SET revision=OLD.revision+1 WHERE id=NEW.id; INSERT INTO storage_connection_versions VALUES(NEW.id,OLD.revision+1,NEW.site_id,NEW.config); END;
--> statement-breakpoint
CREATE TRIGGER storage_history_immutable BEFORE UPDATE ON storage_connection_versions BEGIN SELECT RAISE(ABORT,'storage history is immutable'); END;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN storage_connection_id INTEGER;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN storage_revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE photos SET storage_connection_id=(SELECT p.id FROM settings_storage_providers p JOIN settings s ON s.site_id=p.site_id AND s.namespace='storage' AND s.key='provider' AND CAST(s.value AS INTEGER)=p.id WHERE p.site_id=photos.site_id LIMIT 1);
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN storage_connection_id INTEGER;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN storage_revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE pipeline_queue SET storage_connection_id=(SELECT p.id FROM settings_storage_providers p JOIN settings s ON s.site_id=p.site_id AND s.namespace='storage' AND s.key='provider' AND CAST(s.value AS INTEGER)=p.id WHERE p.site_id=pipeline_queue.site_id LIMIT 1);
--> statement-breakpoint
CREATE TRIGGER album_photos_same_site_insert BEFORE INSERT ON album_photos WHEN (NEW.album_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM albums WHERE id=NEW.album_id AND site_id=NEW.site_id)) OR (NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER album_photos_same_site_update BEFORE UPDATE ON album_photos WHEN (NEW.album_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM albums WHERE id=NEW.album_id AND site_id=NEW.site_id)) OR (NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER photo_access_keys_same_site_insert BEFORE INSERT ON photo_access_keys WHEN (NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER photo_access_keys_same_site_update BEFORE UPDATE ON photo_access_keys WHEN (NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER photo_reactions_same_site_insert BEFORE INSERT ON photo_reactions WHEN (NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER photo_reactions_same_site_update BEFORE UPDATE ON photo_reactions WHEN (NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER albums_same_site_insert BEFORE INSERT ON albums WHEN (NEW.cover_photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.cover_photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER albums_same_site_update BEFORE UPDATE ON albums WHEN (NEW.cover_photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.cover_photo_id AND site_id=NEW.site_id)) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER photos_same_site_insert BEFORE INSERT ON photos WHEN NEW.storage_connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage_connection_versions WHERE connection_id=NEW.storage_connection_id AND revision=NEW.storage_revision AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER photos_same_site_update BEFORE UPDATE ON photos WHEN NEW.storage_connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage_connection_versions WHERE connection_id=NEW.storage_connection_id AND revision=NEW.storage_revision AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER pipeline_queue_same_site_insert BEFORE INSERT ON pipeline_queue WHEN NEW.storage_connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage_connection_versions WHERE connection_id=NEW.storage_connection_id AND revision=NEW.storage_revision AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER pipeline_queue_same_site_update BEFORE UPDATE ON pipeline_queue WHEN NEW.storage_connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage_connection_versions WHERE connection_id=NEW.storage_connection_id AND revision=NEW.storage_revision AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'cross-site or missing relation'); END;
--> statement-breakpoint
DROP TRIGGER photos_access_keys_insert;
--> statement-breakpoint
DROP TRIGGER photos_access_keys_update;
--> statement-breakpoint
CREATE TRIGGER `photos_access_keys_insert`
AFTER INSERT ON `photos`
BEGIN
  INSERT OR IGNORE INTO `photo_access_keys` (`access_key`, `photo_id`, `site_id`)
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
  SELECT DISTINCT `access_key`, NEW.`id`, NEW.`site_id` FROM `derived`
  WHERE `access_key` IS NOT NULL AND `access_key` != '';
END;
--> statement-breakpoint
CREATE TRIGGER `photos_access_keys_update`
AFTER UPDATE ON `photos`
BEGIN
  DELETE FROM `photo_access_keys` WHERE `photo_id` = OLD.`id`;
  INSERT OR IGNORE INTO `photo_access_keys` (`access_key`, `photo_id`, `site_id`)
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
  SELECT DISTINCT `access_key`, NEW.`id`, NEW.`site_id` FROM `derived`
  WHERE `access_key` IS NOT NULL AND `access_key` != '';
END;
--> statement-breakpoint
CREATE TRIGGER default_user_membership_role AFTER UPDATE OF is_admin ON users BEGIN UPDATE memberships SET role=CASE WHEN NEW.is_admin=1 THEN 'admin' ELSE 'member' END WHERE workspace_id=1 AND user_id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER site_workspace_immutable BEFORE UPDATE OF workspace_id ON sites WHEN NEW.workspace_id != OLD.workspace_id BEGIN SELECT RAISE(ABORT,'site workspace is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER storage_history_delete BEFORE DELETE ON storage_connection_versions BEGIN SELECT RAISE(ABORT,'storage history is immutable'); END;

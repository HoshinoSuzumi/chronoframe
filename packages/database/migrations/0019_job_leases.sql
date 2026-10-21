ALTER TABLE pipeline_queue ADD COLUMN source_hash TEXT;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN resource_id TEXT;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN pipeline_version TEXT NOT NULL DEFAULT '1';
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN attempt_id TEXT;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN worker_id TEXT;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN lease_expires_at INTEGER;
--> statement-breakpoint
ALTER TABLE pipeline_queue ADD COLUMN heartbeat_at INTEGER;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN original_derived_key TEXT;
--> statement-breakpoint
CREATE TABLE resource_versions (
 site_id INTEGER NOT NULL REFERENCES sites(id), resource_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0,
 storage_connection_id INTEGER, storage_revision INTEGER NOT NULL DEFAULT 1, storage_key TEXT,
 PRIMARY KEY(site_id,resource_id)
);
--> statement-breakpoint
CREATE TABLE job_commit_guards (site_id INTEGER NOT NULL,resource_id TEXT NOT NULL,attempt_id TEXT NOT NULL,PRIMARY KEY(site_id,resource_id));
--> statement-breakpoint
INSERT INTO resource_versions(site_id,resource_id,version,storage_connection_id,storage_revision,storage_key)
 SELECT site_id,id,source_version,storage_connection_id,storage_revision,storage_key FROM photos;
--> statement-breakpoint
UPDATE pipeline_queue SET resource_id=json_extract(payload,'$.photoId') WHERE json_extract(payload,'$.photoId') IS NOT NULL;
--> statement-breakpoint
UPDATE pipeline_queue SET resource_id=(SELECT id FROM photos WHERE photos.site_id=pipeline_queue.site_id AND photos.storage_key=json_extract(pipeline_queue.payload,'$.storageKey') LIMIT 1) WHERE resource_id IS NULL AND json_extract(payload,'$.type')='photo';
--> statement-breakpoint
CREATE INDEX idx_pipeline_queue_lease ON pipeline_queue(site_id,status,lease_expires_at);
--> statement-breakpoint
CREATE INDEX idx_pipeline_queue_resource ON pipeline_queue(site_id,resource_id,source_version);
--> statement-breakpoint
CREATE TRIGGER photo_version_insert AFTER INSERT ON photos BEGIN
 INSERT INTO resource_versions(site_id,resource_id,version,deleted,storage_connection_id,storage_revision,storage_key)
 VALUES(NEW.site_id,NEW.id,NEW.source_version,0,NEW.storage_connection_id,NEW.storage_revision,NEW.storage_key)
 ON CONFLICT(site_id,resource_id) DO UPDATE SET
 version=CASE WHEN EXISTS(SELECT 1 FROM job_commit_guards WHERE site_id=NEW.site_id AND resource_id=NEW.id) THEN resource_versions.version ELSE resource_versions.version+1 END,
 deleted=0, storage_connection_id=NEW.storage_connection_id,storage_revision=NEW.storage_revision,storage_key=NEW.storage_key;
 UPDATE photos SET source_version=(SELECT version FROM resource_versions WHERE site_id=NEW.site_id AND resource_id=NEW.id) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER photo_version_update AFTER UPDATE OF title,description,tags,exif,latitude,longitude,country,city,location_name,geocoding,storage_key,storage_connection_id,storage_revision,last_modified,file_size,is_live_photo,live_photo_video_key,original_url,thumbnail_key,original_derived_key ON photos
WHEN NOT EXISTS(SELECT 1 FROM job_commit_guards WHERE site_id=NEW.site_id AND resource_id=NEW.id)
BEGIN
 UPDATE resource_versions SET version=version+1,storage_connection_id=NEW.storage_connection_id,storage_revision=NEW.storage_revision,storage_key=NEW.storage_key WHERE site_id=NEW.site_id AND resource_id=NEW.id;
 UPDATE photos SET source_version=(SELECT version FROM resource_versions WHERE site_id=NEW.site_id AND resource_id=NEW.id) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER photo_version_delete AFTER DELETE ON photos BEGIN
 UPDATE resource_versions SET version=version+1,deleted=1 WHERE site_id=OLD.site_id AND resource_id=OLD.id;
 UPDATE pipeline_queue SET status='failed',error_message='Resource deleted',status_stage=NULL,lease_expires_at=NULL
 WHERE site_id=OLD.site_id AND resource_id=OLD.id AND status IN ('pending','in-stages');
END;
--> statement-breakpoint
CREATE TRIGGER resource_reference_insert BEFORE INSERT ON resource_versions WHEN NEW.storage_connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage_connection_versions WHERE connection_id=NEW.storage_connection_id AND revision=NEW.storage_revision AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'cross-site or missing storage revision'); END;
--> statement-breakpoint
CREATE TRIGGER resource_reference_update BEFORE UPDATE ON resource_versions WHEN NEW.storage_connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage_connection_versions WHERE connection_id=NEW.storage_connection_id AND revision=NEW.storage_revision AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'cross-site or missing storage revision'); END;

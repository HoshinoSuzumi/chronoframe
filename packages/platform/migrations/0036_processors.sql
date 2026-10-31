CREATE TABLE platform_processor_nodes (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 secret_hash TEXT NOT NULL UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 limits_json TEXT NOT NULL,
 version TEXT NOT NULL DEFAULT '',
 instance_id TEXT NOT NULL DEFAULT '',
 hostname TEXT NOT NULL DEFAULT '',
 last_seen_at INTEGER,
 metrics_json TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE platform_processor_settings(id INTEGER PRIMARY KEY CHECK(id=1),encrypted_config TEXT,revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO platform_processor_settings(id) VALUES(1);
ALTER TABLE cloud_processing_jobs ADD COLUMN operation TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE cloud_processing_jobs ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE platform_site_processing(site_id INTEGER PRIMARY KEY REFERENCES platform_sites(id) ON DELETE CASCADE,erase_location INTEGER NOT NULL DEFAULT 0 CHECK(erase_location IN(0,1)),revision INTEGER NOT NULL DEFAULT 1);
CREATE INDEX cloud_jobs_worker_active ON cloud_processing_jobs(worker_id,state,lease_until);
-- Publish sanitized originals atomically without overwriting source objects.
ALTER TABLE cloud_media_assets RENAME TO cloud_media_assets_old;
CREATE TABLE cloud_media_assets (
 site_id INTEGER NOT NULL, photo_id TEXT NOT NULL, source_version TEXT NOT NULL, pipeline_version TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('thumbnail','live-video','display','sanitized-original')),
 connection_id TEXT NOT NULL, object_key TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>0), content_type TEXT NOT NULL,
 connection_revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(site_id,photo_id,source_version,pipeline_version,role),
 FOREIGN KEY(site_id,photo_id) REFERENCES cloud_photos(site_id,id)
);
INSERT INTO cloud_media_assets SELECT site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type,connection_revision FROM cloud_media_assets_old;
DROP TABLE cloud_media_assets_old;
CREATE TABLE platform_processor_geocoding_slots(provider TEXT PRIMARY KEY,next_at INTEGER NOT NULL);
CREATE TABLE cloud_photo_companions(site_id INTEGER NOT NULL,photo_id TEXT NOT NULL,upload_id TEXT NOT NULL,PRIMARY KEY(site_id,photo_id),FOREIGN KEY(site_id,photo_id) REFERENCES cloud_photos(site_id,id),FOREIGN KEY(site_id,upload_id) REFERENCES cloud_uploads(site_id,id));
ALTER TABLE cloud_processing_jobs ADD COLUMN required_pixels INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_processing_jobs ADD COLUMN required_file_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_processing_jobs ADD COLUMN required_metadata_bytes INTEGER NOT NULL DEFAULT 0;

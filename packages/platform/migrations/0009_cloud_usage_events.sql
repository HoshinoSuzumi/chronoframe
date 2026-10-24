ALTER TABLE cloud_uploads ADD COLUMN expected_video_bytes INTEGER NOT NULL DEFAULT 0 CHECK(expected_video_bytes>=0);

CREATE TABLE cloud_usage_events (
 site_id INTEGER NOT NULL,
 upload_id TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(site_id,upload_id),
 FOREIGN KEY(site_id,upload_id) REFERENCES cloud_uploads(site_id,id)
);

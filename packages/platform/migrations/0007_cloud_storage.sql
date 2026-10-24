CREATE TABLE cloud_storage_connections (
 site_id INTEGER NOT NULL REFERENCES platform_sites(id),
 id TEXT NOT NULL,
 current_revision INTEGER NOT NULL,
 checked_at INTEGER,
 healthy INTEGER NOT NULL DEFAULT 0 CHECK(healthy IN (0,1)),
 PRIMARY KEY(site_id,id)
);
CREATE TABLE cloud_storage_versions (
 site_id INTEGER NOT NULL,
 connection_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 public_json TEXT NOT NULL,
 secret_ciphertext TEXT NOT NULL,
 PRIMARY KEY(site_id,connection_id,revision),
 FOREIGN KEY(site_id,connection_id) REFERENCES cloud_storage_connections(site_id,id)
);
ALTER TABLE cloud_uploads ADD COLUMN connection_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cloud_uploads ADD COLUMN content_type TEXT NOT NULL DEFAULT 'image/jpeg';
ALTER TABLE cloud_uploads ADD COLUMN file_name TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE cloud_uploads ADD COLUMN transport_token TEXT;
ALTER TABLE cloud_uploads ADD COLUMN transport_lease_until INTEGER;
ALTER TABLE cloud_media_assets ADD COLUMN connection_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cloud_uploads ADD COLUMN verified_etag TEXT;
ALTER TABLE cloud_uploads ADD COLUMN video_key TEXT;
ALTER TABLE cloud_uploads ADD COLUMN video_etag TEXT;

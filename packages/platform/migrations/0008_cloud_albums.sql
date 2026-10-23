ALTER TABLE cloud_albums ADD COLUMN description TEXT;
ALTER TABLE cloud_albums ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1));
ALTER TABLE cloud_albums ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_albums ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_albums ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_albums ADD COLUMN cover_photo_id TEXT;
CREATE INDEX cloud_album_order ON cloud_albums(site_id,position,created_at);
CREATE TABLE cloud_cleanup_requests (
 site_id INTEGER NOT NULL,
 id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 connection_revision INTEGER NOT NULL,
 object_key TEXT NOT NULL,
 provider_upload_id TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done')),
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,id)
);
ALTER TABLE cloud_album_photos ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_photos ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE INDEX cloud_album_membership_photo ON cloud_album_photos(site_id,photo_id,album_id);
ALTER TABLE cloud_albums ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

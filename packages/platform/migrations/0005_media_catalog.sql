-- Additive cloud catalog; deliberately separate from Self-hosted tables.
CREATE TABLE cloud_photos (
  site_id INTEGER NOT NULL REFERENCES platform_sites(id),
  id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  title TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  PRIMARY KEY (site_id,id)
);
CREATE TABLE cloud_albums (
  site_id INTEGER NOT NULL REFERENCES platform_sites(id),
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  PRIMARY KEY (site_id,id)
);
CREATE TABLE cloud_album_photos (
  site_id INTEGER NOT NULL,
  album_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  PRIMARY KEY (site_id,album_id,photo_id),
  FOREIGN KEY (site_id,album_id) REFERENCES cloud_albums(site_id,id),
  FOREIGN KEY (site_id,photo_id) REFERENCES cloud_photos(site_id,id)
);
CREATE TABLE cloud_uploads (
  site_id INTEGER NOT NULL REFERENCES platform_sites(id),
  id TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES platform_users(id),
  photo_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  provider_upload_id TEXT,
  expected_bytes INTEGER NOT NULL CHECK (expected_bytes > 0),
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','completed','cancelled')),
  PRIMARY KEY (site_id,id),
  UNIQUE (site_id,connection_id,object_key)
);
CREATE TABLE cloud_processing_jobs (
  site_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','retry_wait','succeeded','failed','cancelled')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (site_id,id),
  UNIQUE (site_id,upload_id),
  FOREIGN KEY (site_id,upload_id) REFERENCES cloud_uploads(site_id,id),
  FOREIGN KEY (site_id,photo_id) REFERENCES cloud_photos(site_id,id)
);
CREATE INDEX cloud_jobs_dispatch ON cloud_processing_jobs(site_id,state,created_at,id);
CREATE INDEX cloud_uploads_expiry ON cloud_uploads(site_id,state,expires_at);

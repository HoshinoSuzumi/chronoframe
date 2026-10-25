-- The registry owns both current URLs and permanently reserved historical URLs.
CREATE TABLE cloud_album_slugs (
 site_id INTEGER NOT NULL REFERENCES platform_sites(id),
 slug TEXT NOT NULL,
 album_id TEXT,
 is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
 PRIMARY KEY(site_id,slug),
 FOREIGN KEY(site_id,album_id) REFERENCES cloud_albums(site_id,id),
 CHECK(album_id IS NOT NULL OR is_current=0)
);
CREATE UNIQUE INDEX cloud_album_one_current_slug ON cloud_album_slugs(site_id,album_id) WHERE is_current=1;
CREATE INDEX cloud_album_slug_album ON cloud_album_slugs(site_id,album_id);

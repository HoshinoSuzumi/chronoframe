-- Access policy only. Album/media business repositories are introduced separately.
CREATE TABLE IF NOT EXISTS platform_album_access (
  site_id INTEGER NOT NULL REFERENCES platform_sites(id),
  album_id INTEGER NOT NULL CHECK(album_id > 0),
  revision TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  PRIMARY KEY(site_id, album_id)
);
CREATE TABLE IF NOT EXISTS platform_visitor_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

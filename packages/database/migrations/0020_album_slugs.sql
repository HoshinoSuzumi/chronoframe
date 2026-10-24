CREATE TABLE album_slugs (
  site_id INTEGER NOT NULL REFERENCES sites(id),
  slug TEXT NOT NULL,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  PRIMARY KEY (site_id, slug),
  CHECK (album_id IS NOT NULL OR is_current = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX album_slugs_one_current ON album_slugs(site_id, album_id) WHERE is_current = 1;
--> statement-breakpoint
CREATE INDEX album_slugs_album ON album_slugs(site_id, album_id);
--> statement-breakpoint
CREATE TRIGGER album_slugs_same_site_insert BEFORE INSERT ON album_slugs
WHEN NEW.album_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM albums WHERE id = NEW.album_id AND site_id = NEW.site_id
)
BEGIN SELECT RAISE(ABORT, 'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER album_slugs_same_site_update BEFORE UPDATE OF album_id, site_id ON album_slugs
WHEN NEW.album_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM albums WHERE id = NEW.album_id AND site_id = NEW.site_id
)
BEGIN SELECT RAISE(ABORT, 'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER album_slugs_tombstone BEFORE DELETE ON albums
BEGIN
  UPDATE album_slugs SET album_id = NULL, is_current = 0 WHERE album_id = OLD.id;
END;

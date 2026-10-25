DROP TRIGGER album_slugs_tombstone;
--> statement-breakpoint
CREATE TABLE album_slugs_new (
  site_id INTEGER NOT NULL REFERENCES sites(id),
  slug TEXT NOT NULL,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  PRIMARY KEY (site_id, slug)
);
--> statement-breakpoint
INSERT INTO album_slugs_new (site_id, slug, album_id, is_current)
SELECT s.site_id, s.slug, s.album_id, s.is_current
FROM album_slugs AS s
JOIN albums AS a ON a.id = s.album_id AND a.site_id = s.site_id;
--> statement-breakpoint
DROP TABLE album_slugs;
--> statement-breakpoint
ALTER TABLE album_slugs_new RENAME TO album_slugs;
--> statement-breakpoint
CREATE UNIQUE INDEX album_slugs_one_current ON album_slugs(site_id, album_id) WHERE is_current = 1;
--> statement-breakpoint
CREATE INDEX album_slugs_album ON album_slugs(site_id, album_id);
--> statement-breakpoint
CREATE TRIGGER album_slugs_same_site_insert BEFORE INSERT ON album_slugs
WHEN NOT EXISTS (
  SELECT 1 FROM albums WHERE id = NEW.album_id AND site_id = NEW.site_id
)
BEGIN SELECT RAISE(ABORT, 'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER album_slugs_same_site_update BEFORE UPDATE OF album_id, site_id ON album_slugs
WHEN NOT EXISTS (
  SELECT 1 FROM albums WHERE id = NEW.album_id AND site_id = NEW.site_id
)
BEGIN SELECT RAISE(ABORT, 'cross-site or missing relation'); END;
--> statement-breakpoint
CREATE TRIGGER album_slugs_cleanup BEFORE DELETE ON albums
BEGIN
  DELETE FROM album_slugs WHERE album_id = OLD.id;
END;

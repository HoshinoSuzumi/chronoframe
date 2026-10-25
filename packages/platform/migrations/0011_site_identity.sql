-- Public gallery identity is distinct from the workspace's internal Site name.
ALTER TABLE platform_sites ADD COLUMN gallery_title TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_sites ADD COLUMN gallery_slogan TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_sites ADD COLUMN gallery_author TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_sites ADD COLUMN gallery_avatar TEXT NOT NULL DEFAULT '';

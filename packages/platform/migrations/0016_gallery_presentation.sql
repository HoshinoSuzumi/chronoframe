ALTER TABLE platform_sites ADD COLUMN gallery_presentation TEXT NOT NULL DEFAULT '{"homeHeaderLayout":"embedded","socialLinks":{"links":[]}}' CHECK(json_valid(gallery_presentation));

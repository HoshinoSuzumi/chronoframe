CREATE TABLE platform_photo_reactions (
 site_id INTEGER NOT NULL,
 photo_id TEXT NOT NULL,
 visitor_key TEXT NOT NULL,
 reaction_type TEXT NOT NULL CHECK(reaction_type IN ('like','love','amazing','funny','wow','sad','fire','sparkle')),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(site_id,photo_id,visitor_key),
 FOREIGN KEY(site_id,photo_id) REFERENCES cloud_photos(site_id,id) ON DELETE CASCADE
);
CREATE INDEX platform_photo_reaction_counts ON platform_photo_reactions(site_id,photo_id,reaction_type);

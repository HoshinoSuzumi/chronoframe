CREATE TABLE platform_map_settings(id INTEGER PRIMARY KEY CHECK(id=1),config_json TEXT NOT NULL DEFAULT '{}',revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO platform_map_settings(id) VALUES(1);
CREATE TABLE platform_site_maps(site_id INTEGER PRIMARY KEY REFERENCES platform_sites(id) ON DELETE CASCADE,config_json TEXT,revision INTEGER NOT NULL DEFAULT 1);

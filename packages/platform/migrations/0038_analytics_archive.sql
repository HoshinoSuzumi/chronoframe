CREATE TABLE platform_analytics_archive_state (
 dataset TEXT PRIMARY KEY, start_day TEXT NOT NULL, cursor_day TEXT NOT NULL,
 snapshot TEXT NOT NULL, phase INTEGER NOT NULL DEFAULT 0, page_offset INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE platform_analytics_archive_days (
 dataset TEXT NOT NULL, day TEXT NOT NULL, snapshot TEXT NOT NULL, completed_at INTEGER NOT NULL,
 PRIMARY KEY(dataset,day)
);
CREATE TABLE platform_analytics_archive_rows (
 dataset TEXT NOT NULL, snapshot TEXT NOT NULL, day TEXT NOT NULL,
 kind TEXT NOT NULL, workspace_id INTEGER NOT NULL, site_id INTEGER NOT NULL,
 dimension TEXT NOT NULL, label TEXT NOT NULL, pv REAL NOT NULL, uv REAL NOT NULL, sample_interval REAL NOT NULL,
 PRIMARY KEY(dataset,snapshot,kind,workspace_id,site_id,dimension,label)
);
CREATE INDEX platform_analytics_archive_lookup ON platform_analytics_archive_rows(dataset,day,workspace_id,site_id,kind,dimension);

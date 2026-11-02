CREATE TABLE platform_cloud_analytics (
  id INTEGER PRIMARY KEY CHECK(id=1),
  measurement_id TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO platform_cloud_analytics(id) VALUES (1);

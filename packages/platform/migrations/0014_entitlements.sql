CREATE TABLE platform_plans (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 revision INTEGER NOT NULL DEFAULT 1,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);
INSERT INTO platform_plans(id,name,policy_json) VALUES('free','Free','{"limits":{"byos":0,"storageBytes":1073741824,"fileBytes":20971520,"sites":1,"customDomains":0,"photos":1000,"monthlyBytes":5368709120},"rules":[]}');
CREATE TABLE platform_workspace_plans (
 workspace_id INTEGER PRIMARY KEY REFERENCES platform_workspaces(id),
 plan_id TEXT NOT NULL REFERENCES platform_plans(id),
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE platform_storage_pools (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 current_revision INTEGER NOT NULL DEFAULT 1,
 revision INTEGER NOT NULL DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 checked_at INTEGER NOT NULL
);
CREATE TABLE platform_storage_pool_versions (
 pool_id TEXT NOT NULL REFERENCES platform_storage_pools(id),
 revision INTEGER NOT NULL,
 public_json TEXT NOT NULL CHECK(json_valid(public_json)),
 secret_ciphertext TEXT NOT NULL,
 PRIMARY KEY(pool_id,revision)
);
ALTER TABLE cloud_storage_connections ADD COLUMN pool_id TEXT REFERENCES platform_storage_pools(id);
ALTER TABLE cloud_storage_connections ADD COLUMN pool_revision INTEGER;
CREATE UNIQUE INDEX cloud_site_pool ON cloud_storage_connections(site_id,pool_id) WHERE pool_id IS NOT NULL;
ALTER TABLE cloud_uploads ADD COLUMN reserved_storage_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_processing_jobs ADD COLUMN reserved_output_bytes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE platform_account_controls (
 user_id INTEGER PRIMARY KEY REFERENCES platform_users(id),
 suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE platform_sites ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN(0,1));

ALTER TABLE platform_workspaces ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE platform_workspaces SET created_at=COALESCE((SELECT created_at FROM platform_users WHERE id=owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);

-- Nullable ownership preserves existing workspaces and memberships unchanged.
ALTER TABLE platform_workspaces ADD COLUMN owner_user_id INTEGER REFERENCES platform_users(id);
CREATE UNIQUE INDEX platform_workspace_owner ON platform_workspaces(owner_user_id);
ALTER TABLE platform_sites ADD COLUMN slug TEXT;
ALTER TABLE platform_sites ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_sites ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE platform_sites ADD COLUMN provision_key TEXT;
CREATE UNIQUE INDEX platform_site_slug ON platform_sites(slug);
CREATE UNIQUE INDEX platform_site_provision ON platform_sites(workspace_id, provision_key);

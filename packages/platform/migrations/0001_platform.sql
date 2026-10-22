-- Dedicated platform D1 database. Never run against the Self-hosted database.
CREATE TABLE IF NOT EXISTS platform_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES platform_workspaces(id),
  name TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE TABLE IF NOT EXISTS platform_memberships (
  user_id INTEGER NOT NULL REFERENCES platform_users(id),
  workspace_id INTEGER NOT NULL REFERENCES platform_workspaces(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE TABLE IF NOT EXISTS platform_domains (
  hostname TEXT PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES platform_sites(id),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS platform_email_codes (
  id TEXT PRIMARY KEY,
  email_key TEXT NOT NULL,
  client_key TEXT NOT NULL,
  code_mac TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS platform_email_codes_email_time ON platform_email_codes(email_key, created_at);
CREATE INDEX IF NOT EXISTS platform_email_codes_client_time ON platform_email_codes(client_key, created_at);
CREATE TABLE IF NOT EXISTS platform_sessions (
  token_mac TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES platform_users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_sessions_expiry ON platform_sessions(expires_at);

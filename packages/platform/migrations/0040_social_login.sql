-- OAuth app credentials are encrypted with the platform storage key, never returned publicly.
CREATE TABLE platform_social_login_providers (
  provider TEXT PRIMARY KEY CHECK(provider IN ('github','google','microsoft','discord')),
  client_id TEXT NOT NULL DEFAULT '',
  credentials_ciphertext TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO platform_social_login_providers(provider) VALUES ('github'),('google'),('microsoft'),('discord');

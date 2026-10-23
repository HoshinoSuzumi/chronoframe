-- Add password, verified email, MFA and WebAuthn without changing platform identities.
-- Existing users already proved email ownership through the previous email-code flow.
ALTER TABLE platform_users ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE platform_users ADD COLUMN image TEXT;
ALTER TABLE platform_users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;
UPDATE platform_users SET name = email, updated_at = created_at;
-- A one-time reauthentication is required; old challenge endpoints are retired.
DELETE FROM platform_sessions;
UPDATE platform_email_codes SET active = 0;

CREATE TABLE platform_auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "expires_at" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE
);
CREATE INDEX platform_auth_sessions_user_id_idx ON platform_auth_sessions("user_id");

CREATE TABLE platform_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX platform_accounts_user_id_idx ON platform_accounts("user_id");

CREATE TABLE platform_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
CREATE INDEX platform_verifications_identifier_idx ON platform_verifications("identifier");

CREATE TABLE platform_two_factors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "secret" TEXT NOT NULL,
  "backup_codes" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  "verified" INTEGER DEFAULT 1,
  "failed_verification_count" INTEGER DEFAULT 0,
  "locked_until" INTEGER
);
CREATE INDEX platform_two_factors_secret_idx ON platform_two_factors("secret");
CREATE INDEX platform_two_factors_user_id_idx ON platform_two_factors("user_id");

CREATE TABLE platform_passkeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "public_key" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  "credential_id" TEXT NOT NULL,
  "counter" INTEGER NOT NULL,
  "device_type" TEXT NOT NULL,
  "backed_up" INTEGER NOT NULL,
  "transports" TEXT,
  "created_at" INTEGER,
  "aaguid" TEXT
);
CREATE INDEX platform_passkeys_user_id_idx ON platform_passkeys("user_id");
CREATE INDEX platform_passkeys_credential_id_idx ON platform_passkeys("credential_id");

CREATE TABLE platform_auth_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);

CREATE UNIQUE INDEX platform_accounts_provider_idx ON platform_accounts(provider_id, account_id);
CREATE UNIQUE INDEX platform_two_factors_user_idx ON platform_two_factors(user_id);
CREATE UNIQUE INDEX platform_passkeys_credential_idx ON platform_passkeys(credential_id);
CREATE TABLE platform_auth_attempts (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

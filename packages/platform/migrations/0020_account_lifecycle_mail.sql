ALTER TABLE platform_users ADD COLUMN last_login_at INTEGER;
ALTER TABLE platform_users ADD COLUMN lifecycle_grace_until INTEGER NOT NULL DEFAULT 0;
UPDATE platform_users SET last_login_at=COALESCE((SELECT MAX(CASE WHEN typeof(created_at)='integer' THEN created_at ELSE CAST(strftime('%s',created_at) AS INTEGER)*1000 END) FROM platform_auth_sessions WHERE user_id=platform_users.id),CAST(strftime('%s','now') AS INTEGER)*1000);
CREATE TABLE platform_lifecycle_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),unverified_days INTEGER NOT NULL DEFAULT 14 CHECK(unverified_days BETWEEN 1 AND 3650),inactive_days INTEGER NOT NULL DEFAULT 90 CHECK(inactive_days BETWEEN 1 AND 3650),retention_days INTEGER NOT NULL DEFAULT 15 CHECK(retention_days BETWEEN 1 AND 3650),warning_days_json TEXT NOT NULL DEFAULT '[7,3]' CHECK(json_valid(warning_days_json)),activated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO platform_lifecycle_settings(id,activated_at) VALUES(1,CAST(strftime('%s','now') AS INTEGER)*1000);
CREATE TABLE platform_account_deletions(user_id INTEGER PRIMARY KEY REFERENCES platform_users(id),generation TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'marked' CHECK(state IN('marked','purging')),source TEXT NOT NULL,reason TEXT NOT NULL,marked_at INTEGER NOT NULL,purge_at INTEGER NOT NULL,previous_suspended INTEGER NOT NULL,previous_reason TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,error TEXT,next_attempt_at INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER);
CREATE INDEX platform_deletions_due ON platform_account_deletions(purge_at,next_attempt_at);
CREATE TABLE platform_lifecycle_audit(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,actor_id INTEGER,action TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE platform_mail_templates(kind TEXT PRIMARY KEY,config_json TEXT NOT NULL CHECK(json_valid(config_json)),revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE platform_mail_outbox(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,kind TEXT NOT NULL,cycle TEXT NOT NULL,to_email TEXT NOT NULL,payload_json TEXT NOT NULL,available_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','cancelled')),lease_token TEXT,lease_until INTEGER,error TEXT,UNIQUE(user_id,kind,cycle));
CREATE INDEX platform_mail_pending ON platform_mail_outbox(state,available_at);
CREATE TABLE platform_lifecycle_cursor(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL DEFAULT 0);
INSERT INTO platform_lifecycle_cursor(id) VALUES(1);
CREATE TABLE platform_purge_storage_done(user_id INTEGER NOT NULL,site_id INTEGER NOT NULL,connection_id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(user_id,site_id,connection_id,revision));
CREATE TABLE platform_deletion_sites(user_id INTEGER NOT NULL,site_id INTEGER PRIMARY KEY REFERENCES platform_sites(id),suspended INTEGER NOT NULL,reason TEXT NOT NULL,revision INTEGER NOT NULL);

ALTER TABLE platform_lifecycle_settings ADD COLUMN exemptions_json TEXT NOT NULL DEFAULT '{"enabled":true,"match":"any","rules":[{"kind":"active-subscription","sources":["manual","activation","payment"],"planIds":[]}]}' CHECK(json_valid(exemptions_json));
ALTER TABLE platform_users ADD COLUMN lifecycle_was_exempt INTEGER NOT NULL DEFAULT 0 CHECK(lifecycle_was_exempt IN(0,1));
CREATE TABLE platform_lifecycle_errors(scope TEXT PRIMARY KEY,user_id INTEGER REFERENCES platform_users(id) ON DELETE CASCADE,error TEXT NOT NULL,updated_at INTEGER NOT NULL);

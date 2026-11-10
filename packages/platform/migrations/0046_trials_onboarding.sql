-- Existing accounts keep their current portal experience; only new accounts enter setup.
CREATE TABLE platform_account_onboarding (
 user_id INTEGER PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
 site_request_id TEXT NOT NULL,
 write_token TEXT,
 profile_completed_at INTEGER,
 workspace_completed_at INTEGER,
 site_id INTEGER REFERENCES platform_sites(id) ON DELETE SET NULL,
 completed_at INTEGER,
 created_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO platform_account_onboarding(user_id,site_request_id,profile_completed_at,workspace_completed_at,completed_at,created_at)
 SELECT id,lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),1,1,1,CAST(strftime('%s','now') AS INTEGER)*1000 FROM platform_users;
CREATE TRIGGER platform_new_account_onboarding AFTER INSERT ON platform_users BEGIN
 INSERT INTO platform_account_onboarding(user_id,site_request_id,created_at) VALUES(NEW.id,lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TABLE platform_trial_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 plan_id TEXT REFERENCES platform_plans(id),
 days INTEGER NOT NULL DEFAULT 14 CHECK(days BETWEEN 1 AND 90),
 starts_at INTEGER,
 ends_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 1,
 CHECK(starts_at IS NULL OR ends_at IS NULL OR starts_at<ends_at)
);
INSERT INTO platform_trial_settings(id) VALUES(1);
CREATE TABLE platform_trials (
 user_id INTEGER PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
 workspace_id INTEGER UNIQUE REFERENCES platform_workspaces(id) ON DELETE SET NULL,
 plan_id TEXT NOT NULL REFERENCES platform_plans(id),
 settings_revision INTEGER NOT NULL,
 started_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 first_upload_at INTEGER,
 first_publish_at INTEGER,
 converted_at INTEGER,
 revoked_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 1,
 CHECK(expires_at>started_at)
);
CREATE INDEX platform_trials_expiry ON platform_trials(expires_at,user_id);
CREATE TRIGGER platform_trial_payment_conversion AFTER UPDATE ON platform_workspace_plans
 WHEN NEW.source='payment' BEGIN
 UPDATE platform_trials SET revision=revision+1,converted_at=COALESCE(converted_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE workspace_id=NEW.workspace_id AND revoked_at IS NULL AND converted_at IS NULL;
END;
CREATE TRIGGER platform_trial_upload_activation AFTER INSERT ON cloud_usage_events BEGIN
 UPDATE platform_trials SET first_upload_at=COALESCE(first_upload_at,NEW.created_at) WHERE workspace_id=(SELECT workspace_id FROM platform_sites WHERE id=NEW.site_id) AND started_at<=NEW.created_at AND expires_at>NEW.created_at AND revoked_at IS NULL AND converted_at IS NULL;
END;
CREATE TRIGGER platform_trial_publish_activation AFTER UPDATE OF published ON platform_sites
 WHEN NEW.published=1 AND OLD.published=0 BEGIN
 UPDATE platform_trials SET first_publish_at=COALESCE(first_publish_at,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE workspace_id=NEW.workspace_id AND started_at<=CAST(strftime('%s','now') AS INTEGER)*1000 AND expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND revoked_at IS NULL AND converted_at IS NULL;
END;
CREATE TRIGGER platform_trial_new_site_activation AFTER INSERT ON platform_sites
 WHEN NEW.published=1 BEGIN
 UPDATE platform_trials SET first_publish_at=COALESCE(first_publish_at,NEW.created_at) WHERE workspace_id=NEW.workspace_id AND started_at<=NEW.created_at AND expires_at>NEW.created_at AND revoked_at IS NULL AND converted_at IS NULL;
END;
CREATE TABLE platform_trial_mail (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES platform_trials(user_id) ON DELETE CASCADE,
 cycle INTEGER NOT NULL,
 notice_days INTEGER NOT NULL CHECK(notice_days IN(0,1,3)),
 available_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','cancelled','failed')),
 lease_token TEXT,
 lease_until INTEGER,
 UNIQUE(user_id,cycle,notice_days)
);
CREATE INDEX platform_trial_mail_due ON platform_trial_mail(state,available_at);

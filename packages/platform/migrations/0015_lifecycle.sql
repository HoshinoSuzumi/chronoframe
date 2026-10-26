ALTER TABLE platform_account_controls ADD COLUMN public_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_sites ADD COLUMN suspension_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_custom_domains ADD COLUMN user_paused INTEGER NOT NULL DEFAULT 0 CHECK(user_paused IN(0,1));
ALTER TABLE platform_custom_domains ADD COLUMN hold_reason TEXT;
ALTER TABLE platform_custom_domains ADD COLUMN purge_requested INTEGER NOT NULL DEFAULT 0 CHECK(purge_requested IN(0,1));
ALTER TABLE platform_custom_domains ADD COLUMN restore_primary INTEGER NOT NULL DEFAULT 0 CHECK(restore_primary IN(0,1));
UPDATE platform_custom_domains SET user_paused=1 WHERE state='paused';
CREATE TABLE platform_policy_epoch (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO platform_policy_epoch(id) VALUES(1);
-- Recheck existing domains, including bindings created before plan enforcement.
UPDATE platform_custom_domains SET next_check_at=0 WHERE state<>'deleted';

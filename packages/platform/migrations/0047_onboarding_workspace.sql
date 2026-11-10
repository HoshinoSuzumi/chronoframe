-- Retain the named workspace identity, including after deletion or ownership changes.
ALTER TABLE platform_account_onboarding ADD COLUMN workspace_id INTEGER REFERENCES platform_workspaces(id) ON DELETE SET NULL;
UPDATE platform_account_onboarding SET workspace_id=(SELECT id FROM platform_workspaces WHERE owner_user_id=platform_account_onboarding.user_id) WHERE workspace_completed_at IS NOT NULL;

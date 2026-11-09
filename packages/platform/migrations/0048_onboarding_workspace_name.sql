-- New saves record the user's intent rather than inferring it from the current UI locale.
ALTER TABLE platform_account_onboarding ADD COLUMN workspace_name_customized INTEGER NOT NULL DEFAULT 1 CHECK(workspace_name_customized IN(0,1));
-- Recognize legacy defaults in either supported language; retain other names as custom.
UPDATE platform_account_onboarding SET workspace_name_customized=0
WHERE workspace_completed_at IS NOT NULL AND EXISTS(
 SELECT 1 FROM platform_users u JOIN platform_workspaces w ON w.owner_user_id=u.id
 WHERE u.id=platform_account_onboarding.user_id AND w.id=platform_account_onboarding.workspace_id
 AND w.name IN(substr(u.name,1,68)||'''s workspace',substr(u.name,1,75)||'的工作空间')
);

-- Unreleased migration: retain explicit naming intent rather than the current UI locale.
ALTER TABLE platform_account_onboarding ADD COLUMN workspace_name_customized INTEGER NOT NULL DEFAULT 1 CHECK(workspace_name_customized IN(0,1));
-- Most legacy defaults need no truncation. Leave other names as custom.
UPDATE platform_account_onboarding SET workspace_name_customized=0
WHERE workspace_completed_at IS NOT NULL AND EXISTS(
 SELECT 1 FROM platform_users u JOIN platform_workspaces w ON w.owner_user_id=u.id
 WHERE u.id=platform_account_onboarding.user_id AND w.id=platform_account_onboarding.workspace_id
 AND w.name IN(u.name||'''s workspace',u.name||'的工作空间')
);
-- JS slice counts UTF-16 units; SQLite substr counts Unicode code points.
-- Walk only remaining suffix-matching names, consuming two units for astral characters.
WITH RECURSIVE
 formats(suffix,budget) AS (VALUES('''s workspace',68),('的工作空间',75)),
 prefixes(user_id,name,suffix,budget,pos,units,prefix) AS (
  SELECT u.id,u.name,f.suffix,f.budget,1,0,''
  FROM platform_account_onboarding o JOIN platform_users u ON u.id=o.user_id
  JOIN platform_workspaces w ON w.id=o.workspace_id AND w.owner_user_id=u.id
  JOIN formats f ON substr(w.name,-length(f.suffix))=f.suffix
  WHERE o.workspace_completed_at IS NOT NULL AND o.workspace_name_customized=1
  UNION ALL
  SELECT user_id,name,suffix,budget,pos+1,
   units+CASE WHEN unicode(substr(name,pos,1))>65535 THEN 2 ELSE 1 END,
   prefix||substr(name,pos,1)
  FROM prefixes WHERE pos<=length(name)
   AND units+CASE WHEN unicode(substr(name,pos,1))>65535 THEN 2 ELSE 1 END<=budget
 ),
 -- Materialize once rather than repeating the walk for each updated account.
 defaults(user_id,value) AS MATERIALIZED (
  SELECT user_id,prefix||CASE
   -- A slice ending on a high surrogate is stored by D1 as the replacement character.
   WHEN units=budget-1 AND unicode(substr(name,pos,1))>65535 THEN char(65533)
   ELSE '' END||suffix
  FROM prefixes WHERE pos>length(name) OR units=budget
   OR units+CASE WHEN unicode(substr(name,pos,1))>65535 THEN 2 ELSE 1 END>budget
 )
UPDATE platform_account_onboarding SET workspace_name_customized=0
WHERE workspace_name_customized=1 AND EXISTS(
 SELECT 1 FROM platform_workspaces w JOIN defaults d ON d.user_id=platform_account_onboarding.user_id
 WHERE w.id=platform_account_onboarding.workspace_id AND w.owner_user_id=d.user_id AND w.name=d.value
);

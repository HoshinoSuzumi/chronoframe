import type { PlatformD1 } from './index.ts'
import type { AccountSetup } from '@chronoframe/contracts/platform-setup'
import { createD1Provisioning, ProvisioningError } from './provisioning.ts'
import { parseAccountProfile } from '@chronoframe/contracts/account-profile'
interface SetupRow {
  user_id: number
  site_request_id: string
  profile_completed_at: number | null
  workspace_completed_at: number | null
  workspace_id: number | null
  workspace_name_customized: number
  completed_at: number | null
  site_id: number | null
  revision: number
}
/** Validate names using the same profile rules as account settings. */
function setupName(value: unknown) {
  try {
    return parseAccountProfile({ name: value, image: null }).name
  } catch {
    throw new ProvisioningError(400, 'Invalid name')
  }
}
/** Return the current account’s durable setup progress and available workspace. */
export async function accountSetup(
  db: PlatformD1,
  userId: number,
): Promise<AccountSetup> {
  const user = await db
    .prepare(
      `SELECT u.name,u.email,EXISTS(SELECT 1 FROM platform_accounts a WHERE a.user_id=u.id AND a.provider_id<>'credential') AS social FROM platform_users u WHERE u.id=?`,
    )
    .bind(userId)
    .first<{ name: string | null; email: string; social: number }>()
  if (!user) throw new ProvisioningError(404, 'Account not found')
  const state = await db
    .prepare('SELECT * FROM platform_account_onboarding WHERE user_id=?')
    .bind(userId)
    .first<SetupRow>()
  const workspace = await db
    .prepare(
      "SELECT w.id,w.name FROM platform_workspaces w JOIN platform_memberships m ON m.workspace_id=w.id AND m.user_id=w.owner_user_id AND m.role='admin' WHERE w.owner_user_id=? AND (?=0 OR w.id=?)",
    )
    .bind(
      userId,
      state?.workspace_completed_at ? 1 : 0,
      state?.workspace_id ?? null,
    )
    .first<{ id: number; name: string }>()
  const site = state
    ? await db
        .prepare(
          'SELECT id AS siteId,name,slug FROM platform_sites WHERE (id=? OR provision_key=?) AND workspace_id=? ORDER BY id LIMIT 1',
        )
        .bind(state.site_id, state.site_request_id, workspace?.id ?? 0)
        .first<{ siteId: number; name: string; slug: string | null }>()
    : null
  return {
    required: !!state && !state.completed_at,
    step: !state?.profile_completed_at
      ? 1
      : !state.workspace_completed_at || !workspace
        ? 2
        : 3,
    revision: state?.revision ?? 0,
    name: state?.profile_completed_at
      ? user.name || user.email.split('@')[0]!
      : user.social && user.name
        ? user.name
        : user.email.split('@')[0]!,
    workspace:
      state?.workspace_completed_at && workspace
        ? { ...workspace, customized: !!state.workspace_name_customized }
        : null,
    site,
  }
}
/** Persist one revision-checked step, atomically completing any site provisioning. */
export async function saveAccountSetup(
  db: PlatformD1,
  userId: number,
  input: Record<string, unknown>,
  baseDomain = 'chronoframe.art',
  now = Date.now(),
) {
  if (
    !Number.isSafeInteger(input.revision) ||
    typeof input.step !== 'number' ||
    ![1, 2, 3].includes(input.step) ||
    (input.reconfirmWorkspace !== undefined &&
      typeof input.reconfirmWorkspace !== 'boolean') ||
    (input.workspaceCustomized !== undefined &&
      typeof input.workspaceCustomized !== 'boolean')
  )
    throw new ProvisioningError(400, 'Invalid setup step')
  const state = await db
    .prepare('SELECT * FROM platform_account_onboarding WHERE user_id=?')
    .bind(userId)
    .first<SetupRow>()
  if (!state) throw new ProvisioningError(404, 'Setup not found')
  if (state.completed_at) return accountSetup(db, userId)
  if (state.revision !== input.revision)
    throw new ProvisioningError(409, 'Setup changed; refresh and retry')
  if (
    (input.step > 1 && !state.profile_completed_at) ||
    (input.step === 3 &&
      (!state.workspace_completed_at ||
        !(await accountSetup(db, userId)).workspace))
  )
    throw new ProvisioningError(409, 'Complete the previous step')
  const token = crypto.randomUUID()
  const active =
    'EXISTS(SELECT 1 FROM platform_users u WHERE u.id=platform_account_onboarding.user_id AND u.email_verified=1 AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=u.id AND c.suspended=1) AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=u.id))'
  if (input.step === 1) {
    const name = setupName(input.name)
    await db.batch([
      db
        .prepare(
          `UPDATE platform_account_onboarding SET profile_completed_at=?,workspace_completed_at=CASE WHEN ?=1 THEN NULL ELSE workspace_completed_at END,write_token=?,revision=revision+1 WHERE user_id=? AND revision=? AND completed_at IS NULL AND ${active}`,
        )
        .bind(
          now,
          input.reconfirmWorkspace === true ? 1 : 0,
          token,
          userId,
          state.revision,
        ),
      db
        .prepare(
          'UPDATE platform_users SET name=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM platform_account_onboarding WHERE user_id=? AND revision=? AND write_token=?)',
        )
        .bind(name, now, userId, userId, state.revision + 1, token),
    ])
  } else if (input.step === 2) {
    const name = setupName(input.name)
    const workspace = await createD1Provisioning(
      db,
      baseDomain,
    ).defaultWorkspace(userId)
    await db.batch([
      db
        .prepare(
          `UPDATE platform_account_onboarding SET workspace_completed_at=?,workspace_id=?,workspace_name_customized=CASE WHEN ? IS NOT NULL THEN ? WHEN workspace_id=? AND EXISTS(SELECT 1 FROM platform_workspaces w WHERE w.id=? AND w.owner_user_id=? AND w.name=?) THEN workspace_name_customized ELSE 1 END,write_token=?,revision=revision+1 WHERE user_id=? AND revision=? AND completed_at IS NULL AND ${active} AND EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id=? AND user_id=? AND role='admin')`,
        )
        .bind(
          now,
          workspace.id,
          input.workspaceCustomized === undefined
            ? null
            : input.workspaceCustomized
              ? 1
              : 0,
          input.workspaceCustomized === undefined
            ? null
            : input.workspaceCustomized
              ? 1
              : 0,
          workspace.id,
          workspace.id,
          userId,
          name,
          token,
          userId,
          state.revision,
          workspace.id,
          userId,
        ),
      db
        .prepare(
          'UPDATE platform_workspaces SET name=? WHERE id=? AND owner_user_id=? AND EXISTS(SELECT 1 FROM platform_account_onboarding WHERE user_id=? AND revision=? AND write_token=?)',
        )
        .bind(name, workspace.id, userId, userId, state.revision + 1, token),
    ])
  } else {
    if (input.skip === true) {
      await db
        .prepare(
          `UPDATE platform_account_onboarding SET site_id=NULL,completed_at=?,write_token=?,revision=revision+1 WHERE user_id=? AND revision=? AND completed_at IS NULL AND ${active}`,
        )
        .bind(now, token, userId, state.revision)
        .run()
    } else {
      const workspace = (await accountSetup(db, userId)).workspace
      if (!workspace)
        throw new ProvisioningError(409, 'Complete workspace setup')
      await createD1Provisioning(db, baseDomain).create(
        userId,
        {
          name: input.name,
          slug: input.slug,
          requestId: state.site_request_id,
        },
        { revision: state.revision, token, now, workspaceId: workspace.id },
      )
    }
  }
  const written = await db
    .prepare(
      'SELECT write_token FROM platform_account_onboarding WHERE user_id=?',
    )
    .bind(userId)
    .first<{ write_token: string }>()
  if (written?.write_token !== token)
    throw new ProvisioningError(409, 'Setup changed; refresh and retry')
  const result = await accountSetup(db, userId)
  if (result.revision !== state.revision + 1)
    throw new ProvisioningError(409, 'Setup changed; refresh and retry')
  return result
}

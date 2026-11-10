import type { PlatformD1 } from './index.ts'
import {
  parseWorkspaceSettingsUpdate,
  type WorkspaceSettings,
} from '@chronoframe/contracts/workspace-settings'

export class WorkspaceSettingsError extends Error {
  statusCode: number
  code: string
  constructor(statusCode: number, code: string) {
    super(code)
    this.statusCode = statusCode
    this.code = code
  }
}
// Recheck live membership and account availability for both reads and writes.
const available = `EXISTS(SELECT 1 FROM platform_users u WHERE u.id=? AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=u.id AND c.suspended=1) AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=u.id)) AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=w.owner_user_id AND c.suspended=1) AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=w.owner_user_id)`
/** Read settings for a live member without exposing other workspace metadata. */
export async function workspaceSettings(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
): Promise<WorkspaceSettings> {
  const row = await db
    .prepare(
      `SELECT w.id,w.name,w.revision,m.role FROM platform_workspaces w JOIN platform_memberships m ON m.workspace_id=w.id AND m.user_id=? AND m.role IN('admin','member') WHERE w.id=? AND ${available}`,
    )
    .bind(userId, workspaceId, userId)
    .first<{ id: number; name: string; revision: number; role: string }>()
  if (!row) throw new WorkspaceSettingsError(404, 'workspace_unavailable')
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    canEdit: row.role === 'admin',
  }
}
/** Rename through a revision-checked write, rechecking access and preserving setup naming intent. */
export async function updateWorkspaceSettings(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  input: unknown,
): Promise<WorkspaceSettings> {
  let update
  try {
    update = parseWorkspaceSettingsUpdate(input)
  } catch {
    throw new WorkspaceSettingsError(400, 'workspace_settings_invalid')
  }
  const current = await workspaceSettings(db, userId, workspaceId)
  if (!current.canEdit)
    throw new WorkspaceSettingsError(403, 'workspace_settings_forbidden')
  const result = await db.batch([
    db
      .prepare(
        `UPDATE platform_workspaces AS w SET name=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_memberships m WHERE m.workspace_id=w.id AND m.user_id=? AND m.role='admin') AND ${available}`,
      )
      .bind(update.name, workspaceId, update.revision, userId, userId),
    // Keep explicit naming intent and invalidate any in-flight setup submission.
    db
      .prepare(
        `UPDATE platform_account_onboarding SET workspace_name_customized=1,revision=revision+1 WHERE changes()=1 AND workspace_id=? AND user_id=(SELECT owner_user_id FROM platform_workspaces WHERE id=?)`,
      )
      .bind(workspaceId, workspaceId),
  ])
  if (!result[0]?.meta.changes) {
    const latest = await workspaceSettings(db, userId, workspaceId)
    if (!latest.canEdit)
      throw new WorkspaceSettingsError(403, 'workspace_settings_forbidden')
    throw new WorkspaceSettingsError(409, 'workspace_settings_changed')
  }
  return workspaceSettings(db, userId, workspaceId)
}

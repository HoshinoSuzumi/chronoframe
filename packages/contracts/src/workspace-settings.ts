import { parseAccountProfile } from './account-profile.ts'

/** Workspace details and the current session's ability to edit them. */
export interface WorkspaceSettings {
  id: number
  name: string
  revision: number
  canEdit: boolean
}
export interface WorkspaceSettingsUpdate {
  name: string
  revision: number
}
/** Validate a name-only settings update and its positive optimistic revision. */
export function parseWorkspaceSettingsUpdate(
  value: unknown,
): WorkspaceSettingsUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid workspace settings')
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some((key) => !['name', 'revision'].includes(key)) ||
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1
  )
    throw new Error('Invalid workspace revision')
  return {
    name: parseAccountProfile({ name: input.name, image: null }).name,
    revision: input.revision,
  }
}

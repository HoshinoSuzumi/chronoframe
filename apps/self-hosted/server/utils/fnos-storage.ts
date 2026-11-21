import { access, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'

export function fnosStorageRoot() {
  return process.env.CFRAME_FNOS_STORAGE_ROOT || undefined
}

export async function fnosStorageDirectories() {
  const root = fnosStorageRoot()
  if (!root) return null

  const candidates = new Set([
    root,
    ...(process.env.TRIM_DATA_ACCESSIBLE_PATHS || '').split(':'),
  ])
  const directories: string[] = []
  for (const path of candidates) {
    if (!isAbsolute(path)) continue
    try {
      const resolved = await realpath(path)
      if (!(await stat(resolved)).isDirectory()) continue
      await access(resolved, constants.R_OK | constants.W_OK | constants.X_OK)
      directories.push(path)
    } catch {
      // Revoked access and offline volumes cannot be selected.
    }
  }
  return directories
}

export async function validateFnosStorageDirectory(path: string | undefined) {
  const directories = await fnosStorageDirectories()
  if (directories && (!path || !directories.includes(path))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Select a writable directory authorized in fnOS',
    })
  }
}

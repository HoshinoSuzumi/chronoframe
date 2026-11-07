import { randomBytes } from 'node:crypto'
import {
  linkSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname } from 'node:path'
import { validateAppSecret } from './app-secret-validation.mjs'

function validate(secret, name) {
  return validateAppSecret(
    secret,
    `${name} must contain at least 32 characters.`,
  )
}

function readSecret(file) {
  try {
    return validate(readFileSync(file, 'utf8').trim(), file)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function environmentSecret(value, name) {
  let parsed = value
  try {
    parsed = JSON.parse(value)
  } catch {
    // Unquoted ordinary strings are also supported by Nitro's env parser.
  }
  if (typeof parsed !== 'string')
    throw new Error(`${name} must be a string with at least 32 characters.`)
  return validate(parsed, name)
}

/** Standalone Node utility: resolve the app secret before Nitro freezes runtime config. */
export function ensureAppSecret(file, env = process.env) {
  if (env.NITRO_APP_SECRET !== undefined)
    return {
      secret: environmentSecret(env.NITRO_APP_SECRET, 'NITRO_APP_SECRET'),
      source: 'env',
    }
  if (env.NUXT_APP_SECRET)
    return {
      secret: environmentSecret(env.NUXT_APP_SECRET, 'NUXT_APP_SECRET'),
      source: 'env',
    }
  if (env.NUXT_OG_IMAGE_SECRET)
    return {
      secret: validate(env.NUXT_OG_IMAGE_SECRET, 'NUXT_OG_IMAGE_SECRET'),
      source: 'legacy',
    }

  const existing = readSecret(file)
  if (existing) return { secret: existing, source: 'file' }
  mkdirSync(dirname(file), { recursive: true })
  const secret = 'cf_' + randomBytes(48).toString('base64url')
  const candidate = `${file}.${randomBytes(8).toString('hex')}.key`
  writeFileSync(candidate, secret, { mode: 0o600, flag: 'wx' })
  let keepTarget = false
  try {
    // Publish the complete key atomically without replacing a concurrent key.
    try {
      linkSync(candidate, file)
    } catch (error) {
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(error.code))
        throw error
      // A symlink publishes the finished private file with the same no-overwrite
      // guarantee. Keep its relative target so the data volume remains portable.
      symlinkSync(basename(candidate), file, 'file')
      keepTarget = true
    }
    return { secret, source: 'generated' }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const concurrent = readSecret(file)
    if (!concurrent) throw error
    return { secret: concurrent, source: 'file' }
  } finally {
    if (!keepTarget) unlinkSync(candidate)
  }
}

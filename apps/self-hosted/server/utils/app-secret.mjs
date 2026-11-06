import { randomBytes } from 'node:crypto'
import {
  linkSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
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

function environmentSecret(value) {
  let parsed = value
  try {
    parsed = JSON.parse(value)
  } catch {
    // Unquoted ordinary strings are also supported by Nitro's env parser.
  }
  if (typeof parsed !== 'string')
    throw new Error(
      'NUXT_APP_SECRET must be a string with at least 32 characters.',
    )
  return validate(parsed, 'NUXT_APP_SECRET')
}

/** Standalone Node utility: resolve the app secret before Nitro freezes runtime config. */
export function ensureAppSecret(file, env = process.env) {
  if (env.NUXT_APP_SECRET)
    return {
      secret: environmentSecret(env.NUXT_APP_SECRET),
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
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`
  writeFileSync(temporary, secret, { mode: 0o600, flag: 'wx' })
  try {
    // Publish the complete key atomically without replacing a concurrent key.
    linkSync(temporary, file)
    return { secret, source: 'generated' }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const concurrent = readSecret(file)
    if (!concurrent) throw error
    return { secret: concurrent, source: 'file' }
  } finally {
    unlinkSync(temporary)
  }
}

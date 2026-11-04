import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const SESSION_PASSWORD_ENV_KEY = 'NUXT_SESSION_PASSWORD'
export const MIN_SESSION_PASSWORD_LENGTH = 32

export type SessionPasswordSource = 'env' | 'file' | 'generated'

export interface EnsureSessionPasswordResult {
  source: SessionPasswordSource
  replacedInvalidFile: boolean
}

function isValid(password: string | undefined): password is string {
  return Boolean(password && password.length >= MIN_SESSION_PASSWORD_LENGTH)
}

function readPasswordFile(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Synchronously guarantees a usable session password in `env`.
 * It must stay synchronous: Nitro does not await plugins, so any async work
 * would let early requests make nuxt-auth-utils cache an empty password.
 */
export function ensureSessionPassword(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
): EnsureSessionPasswordResult {
  if (isValid(env[SESSION_PASSWORD_ENV_KEY])) {
    return { source: 'env', replacedInvalidFile: false }
  }

  mkdirSync(dirname(file), { recursive: true })

  const existing = readPasswordFile(file)
  if (isValid(existing)) {
    env[SESSION_PASSWORD_ENV_KEY] = existing
    return { source: 'file', replacedInvalidFile: false }
  }

  const generated = randomBytes(48).toString('base64url')
  const replacedInvalidFile = existing !== undefined
  try {
    // 'wx' avoids clobbering a key written concurrently by another process.
    writeFileSync(file, generated, {
      encoding: 'utf8',
      mode: 0o600,
      flag: replacedInvalidFile ? 'w' : 'wx',
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const concurrent = readPasswordFile(file)
    if (!isValid(concurrent)) throw error
    env[SESSION_PASSWORD_ENV_KEY] = concurrent
    return { source: 'file', replacedInvalidFile: false }
  }

  env[SESSION_PASSWORD_ENV_KEY] = generated
  return { source: 'generated', replacedInvalidFile }
}

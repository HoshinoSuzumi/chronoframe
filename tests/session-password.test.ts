import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ensureSessionPassword,
  SESSION_PASSWORD_ENV_KEY,
} from '../apps/self-hosted/server/utils/session-password.ts'

function withTempFile(run: (file: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'chrono-session-'))
  try {
    run(join(dir, 'data', '.session-password'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('generates and persists a password synchronously when none exists', () => {
  withTempFile((file) => {
    const env: NodeJS.ProcessEnv = {}
    const result = ensureSessionPassword(file, env)
    assert.equal(result.source, 'generated')
    const stored = readFileSync(file, 'utf8')
    assert.ok(stored.length >= 32)
    assert.equal(env[SESSION_PASSWORD_ENV_KEY], stored)
  })
})

test('reuses a persisted password across restarts', () => {
  withTempFile((file) => {
    const first: NodeJS.ProcessEnv = {}
    ensureSessionPassword(file, first)
    const second: NodeJS.ProcessEnv = {}
    const result = ensureSessionPassword(file, second)
    assert.equal(result.source, 'file')
    assert.equal(
      second[SESSION_PASSWORD_ENV_KEY],
      first[SESSION_PASSWORD_ENV_KEY],
    )
  })
})

test('keeps a valid environment password and writes no file', () => {
  withTempFile((file) => {
    const password = 'x'.repeat(40)
    const env: NodeJS.ProcessEnv = { [SESSION_PASSWORD_ENV_KEY]: password }
    assert.equal(ensureSessionPassword(file, env).source, 'env')
    assert.equal(env[SESSION_PASSWORD_ENV_KEY], password)
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
  })
})

test('replaces an invalid password file', () => {
  withTempFile((file) => {
    ensureSessionPassword(file, {})
    writeFileSync(file, 'short')
    const env: NodeJS.ProcessEnv = {}
    const result = ensureSessionPassword(file, env)
    assert.equal(result.source, 'generated')
    assert.equal(result.replacedInvalidFile, true)
    assert.equal(readFileSync(file, 'utf8'), env[SESSION_PASSWORD_ENV_KEY])
  })
})

test('surfaces unexpected filesystem errors instead of swallowing them', () => {
  withTempFile((file) => {
    ensureSessionPassword(file, {})
    // The password path is now a file, so using it as a directory must fail.
    assert.throws(() => ensureSessionPassword(join(file, 'nested'), {}))
  })
})

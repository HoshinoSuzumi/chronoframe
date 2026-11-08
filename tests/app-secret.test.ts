import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAppSecret } from '../apps/self-hosted/server/utils/app-secret-validation.mjs'

test('validateAppSecret accepts strings of at least 32 characters', () => {
  const secret = 'a'.repeat(32)
  assert.equal(validateAppSecret(secret, 'unused'), secret)
  assert.equal(validateAppSecret('n'.repeat(48), 'unused'), 'n'.repeat(48))
})

test('validateAppSecret rejects missing, short, or non-string values without echoing them', () => {
  for (const value of [
    undefined,
    null,
    '',
    'short',
    'x'.repeat(31),
    123,
    ['array-secret'.repeat(4)],
  ]) {
    assert.throws(
      () => validateAppSecret(value as never, 'NUXT_APP_SECRET must be valid'),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /NUXT_APP_SECRET must be valid/)
        if (typeof value === 'string' && value)
          assert.ok(!error.message.includes(value))
        return true
      },
    )
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveAppSecretCandidate,
  validateAppSecret,
} from '../scripts/app-secret-validation.mjs'

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

test('numeric-looking NITRO_APP_SECRET keeps the original env string over coerced runtimeConfig', () => {
  const digits = '1'.repeat(40)
  const secret = resolveAppSecretCandidate(Number(digits), {
    NITRO_APP_SECRET: digits,
  })
  assert.equal(secret, digits)
  assert.equal(typeof secret, 'string')
  assert.equal(validateAppSecret(secret, 'unused'), digits)
})

test('JSON-quoted env secrets decode to the inner string and NITRO precedes NUXT', () => {
  const secret = 'quoted-app-secret-value'.repeat(2)
  assert.equal(
    resolveAppSecretCandidate(undefined, {
      NITRO_APP_SECRET: JSON.stringify(secret),
      NUXT_APP_SECRET: 'ignored-lower-priority'.repeat(2),
    }),
    secret,
  )
})

test('legacy NUXT_OG_IMAGE_SECRET remains the empty-app-secret fallback', () => {
  const legacy = 'legacy-og-image-secret-value'.repeat(2)
  assert.equal(
    resolveAppSecretCandidate('', { NUXT_OG_IMAGE_SECRET: legacy }),
    legacy,
  )
  assert.equal(
    resolveAppSecretCandidate(Number('1'.repeat(40)), {
      NITRO_APP_SECRET: '1'.repeat(40),
      NUXT_OG_IMAGE_SECRET: legacy,
    }),
    '1'.repeat(40),
  )
})

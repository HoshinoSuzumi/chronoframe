import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { ref } from 'vue'
import { accountError } from '../apps/cloud/app/utils/account-error.ts'

async function security(
  fetcher: (url: string) => Promise<unknown>,
  refresh = async () => {},
) {
  const source = readFileSync(
    'apps/cloud/app/components/CloudSecuritySettings.vue',
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
    .replace(/^import[^\n]*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const deps = {
    ref,
    accountError,
    watch: () => {},
    useI18n: () => ({ t: (key: string) => key }),
    useFetch: async () => ({ data: ref({ hasPassword: true }), refresh }),
    useToast: () => ({ add: () => {} }),
    $fetch: fetcher,
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return new AsyncFunction(
    ...Object.keys(deps),
    code +
      ';return {code,error,authenticatorError,busy,totpURI,changePassword,confirmAuthenticator}',
  )(...Object.values(deps))
}

test('unrelated security failures do not invalidate the pending authenticator code', async () => {
  const p = await security(async () => {
    throw { data: { code: 'INVALID_PASSWORD' } }
  })
  p.totpURI.value = 'otpauth://totp/local-test'
  p.code.value = '123'
  await p.changePassword()
  assert.ok(p.error.value)
  assert.equal(p.authenticatorError.value, '')
  assert.equal(p.code.value, '123')
  assert.equal(p.busy.value, false)
})

test('only authenticator verification rejection marks the code invalid', async () => {
  const p = await security(async (url) => {
    assert.equal(url, '/api/auth/two-factor/verify-totp')
    throw { data: { code: 'INVALID_TOTP' } }
  })
  p.code.value = '123456'
  await p.confirmAuthenticator()
  assert.ok(p.authenticatorError.value)
  assert.equal(p.error.value, p.authenticatorError.value)
  assert.equal(p.busy.value, false)
})

test('refresh failures after successful verification are not reported as invalid codes', async () => {
  const p = await security(
    async () => ({}),
    async () => {
      throw new Error('refresh failed')
    },
  )
  p.code.value = '123456'
  await p.confirmAuthenticator()
  assert.equal(p.authenticatorError.value, '')
  assert.equal(p.code.value, '')
  assert.ok(p.error.value)
})

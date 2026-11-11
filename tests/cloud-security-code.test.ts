import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { accountError } from '../apps/cloud/app/utils/account-error.ts'

/** Execute the settings controller with isolated API, toast and refresh adapters. */
async function security(
  fetcher: (
    url: string,
    options?: { body?: Record<string, unknown> },
  ) => Promise<unknown>,
  refresh = async () => {},
  component = 'CloudTwoFactorSettings',
) {
  const source = readFileSync(
    `apps/cloud/app/components/${component}.vue`,
    'utf8',
  )
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const props = {
    security: {
      hasPassword: true,
      methods: ['totp', 'otp'],
      preferredMethod: null,
    },
    refresh,
  }
  const deps = {
    ref,
    computed,
    accountError,
    defineProps: () => props,
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
      ';return {' +
      (component === 'CloudTwoFactorSettings'
        ? 'code,error,authenticatorError,busy,totpURI,confirmAuthenticator,requestAction,submitAction,password,modal,backupCodes'
        : 'changePassword,error,busy') +
      '}',
  )(...Object.values(deps))
}

test('unrelated security failures do not invalidate the pending authenticator code', async () => {
  const p = await security(async () => ({}))
  const account = await security(
    async () => {
      throw { data: { code: 'INVALID_PASSWORD' } }
    },
    async () => {},
    'CloudSecuritySettings',
  )
  p.totpURI.value = 'otpauth://totp/local-test'
  p.code.value = '123'
  await account.changePassword()
  assert.ok(account.error.value)
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

test('changing a preference waits for explicit confirmation and clears its password', async () => {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  let refreshed = 0
  const p = await security(
    async (url, options) => {
      calls.push({ url, body: options?.body })
      return {}
    },
    async () => {
      refreshed++
    },
  )
  p.requestAction('primary', 'otp')
  assert.equal(calls.length, 0)
  assert.equal(p.modal.value, 'confirm')
  p.password.value = 'current-password'
  await p.submitAction()
  assert.equal(calls[0]?.url, '/api/auth/two-factor/preferred')
  assert.equal(calls[0]?.body?.method, 'otp')
  assert.equal(p.password.value, '')
  assert.equal(p.modal.value, null)
  assert.equal(refreshed, 1)
})

test('email enrollment displays recovery codes and removing one of several factors does not authorize disabling 2FA', async () => {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  const p = await security(async (url, options) => {
    calls.push({ url, body: options?.body })
    return url.endsWith('/enable')
      ? { backupCodes: ['one-use-recovery'] }
      : { methods: [] }
  })
  p.requestAction('enable', 'otp')
  p.password.value = 'current-password'
  await p.submitAction()
  assert.equal(p.modal.value, 'recovery')
  assert.deepEqual(p.backupCodes.value, ['one-use-recovery'])
  p.totpURI.value = 'otpauth://pending-enrollment'
  p.requestAction('remove', 'otp')
  p.password.value = 'current-password'
  await p.submitAction()
  assert.equal(calls.at(-1)?.url, '/api/auth/two-factor/remove-method')
  assert.equal(calls.at(-1)?.body?.confirmDisable, false)
  assert.equal(p.totpURI.value, '')
  assert.deepEqual(p.backupCodes.value, [])
})

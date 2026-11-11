import { defaultTwoFactorMethod } from '../packages/contracts/src/account-security.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { ref, nextTick } from 'vue'
import { accountError } from '../apps/cloud/app/utils/account-error.ts'

type Request = { method: string; body: Record<string, unknown> }
async function page(
  name: 'signin' | 'signup',
  fetcher: (url: string, options: Request) => Promise<unknown>,
) {
  const source = readFileSync(`apps/cloud/app/pages/${name}.vue`, 'utf8')
    .split('<script setup lang="ts">')[1]!
    .split('</script>')[0]!
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText
  let navigations = 0
  const remaining = ref(0)
  const deps = {
    ref,
    nextTick,
    accountError,
    defaultTwoFactorMethod,
    useI18n: () => ({ t: (key: string) => key }),
    useCloudAuthDestination: () => ({
      destination: ref('/workspace'),
      authLink: (path: string) => path,
    }),
    useFetch: async () => ({
      data: ref({ enabled: true, emailEnabled: true }),
    }),
    useSeoMeta: () => {},
    useRoute: () => ({ query: {} }),
    onMounted: () => {},
    useCloudCodeCooldown: () => ({
      remaining,
      start: () => {
        remaining.value = 60
      },
    }),
    $fetch: fetcher,
    navigateTo: async () => {
      navigations++
    },
    setTimeout: (callback: () => void) => {
      callback()
      return 0
    },
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const result = await new AsyncFunction(
    ...Object.keys(deps),
    code +
      `;return { submit, resend, email, password, code, busy, error, codeInput, codeStatus, ${name === 'signin' ? 'step, mode, factor, availableMethods, hasRecoveryCodes, choosingFactor, preferredFactor, chooseFactor, startChallenge, editEmail' : 'sent, emailInput'} }`,
  )(...Object.values(deps))
  return { ...result, remaining, navigations: () => navigations }
}

test('email sign-in moves to code entry, limits resend, and navigates only after verification', async () => {
  const calls: string[] = []
  const p = await page('signin', async (url) => {
    calls.push(url)
    return {}
  })
  p.email.value = 'user@example.com'
  p.mode.value = 'email'
  await p.submit()
  assert.equal(p.step.value, 'code')
  assert.equal(p.remaining.value, 60)
  await p.resend()
  assert.equal(calls.length, 1)
  p.code.value = '12'
  await p.submit()
  assert.equal(calls.length, 1)
  p.code.value = '123456'
  await p.submit()
  assert.equal(calls.at(-1), '/api/auth/sign-in/email-otp')
  assert.equal(p.navigations(), 1)
  assert.equal(p.codeStatus.value, 'success')
})

test('password sign-in with an authenticator cannot skip the second factor; recovery remains text', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const p = await page('signin', async (url, options) => {
    calls.push({ url, body: options.body })
    return url === '/api/auth/sign-in/email'
      ? {
          twoFactorRedirect: true,
          twoFactorMethods: ['totp'],
          hasRecoveryCodes: true,
        }
      : {}
  })
  await p.submit()
  assert.equal(p.factor.value, 'totp')
  assert.equal(p.navigations(), 0)
  assert.equal(calls.length, 1)
  await p.chooseFactor('recovery')
  p.code.value = 'backup-code-with-letters'
  await p.submit()
  assert.equal(calls.at(-1)?.url, '/api/auth/two-factor/verify-backup-code')
  assert.equal(calls.at(-1)?.body.code, 'backup-code-with-letters')
  assert.equal(p.navigations(), 1)
})

test('rejected codes do not navigate or leave the form busy', async () => {
  const p = await page('signin', async () => {
    throw { data: { code: 'INVALID_OTP' } }
  })
  p.step.value = 'code'
  p.mode.value = 'email'
  p.code.value = '123456'
  await p.submit()
  assert.equal(p.navigations(), 0)
  assert.equal(p.codeStatus.value, 'error')
  assert.equal(p.busy.value, false)
  assert.ok(p.error.value)
})

test('signup prevents duplicate requests and clears the password before verifying email', async () => {
  let resolve: ((value: unknown) => void) | undefined
  let count = 0
  const p = await page('signup', async () => {
    count++
    if (count === 1)
      return new Promise((done) => {
        resolve = done
      })
    return {}
  })
  p.email.value = 'user@example.com'
  p.password.value = 'a-long-enough-passphrase'
  const request = p.submit()
  await p.submit()
  assert.equal(count, 1)
  resolve!({})
  await request
  assert.equal(p.sent.value, true)
  assert.equal(p.password.value, '')
  assert.equal(p.navigations(), 0)
  p.code.value = '123456'
  await p.submit()
  assert.equal(p.navigations(), 1)
})

test('authenticator codes use verify-totp before navigating to the destination', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const p = await page('signin', async (url, options) => {
    calls.push({ url, body: options.body })
    return url === '/api/auth/sign-in/email'
      ? {
          twoFactorRedirect: true,
          twoFactorMethods: ['totp'],
          hasRecoveryCodes: true,
        }
      : {}
  })
  await p.submit()
  p.code.value = '123456'
  await p.submit()
  assert.equal(p.factor.value, 'totp')
  assert.deepEqual(calls[1], {
    url: '/api/auth/two-factor/verify-totp',
    body: { code: '123456', trustDevice: false },
  })
  assert.equal(calls.length, 2)
  assert.equal(p.navigations(), 1)
  assert.equal(p.codeStatus.value, 'success')
})

test('signup resend focuses the enabled code input both when opening verification and when retrying', async () => {
  const p = await page('signup', async () => ({}))
  const focusedWhileBusy: boolean[] = []
  p.email.value = 'user@example.com'
  p.emailInput.value = { inputRef: { reportValidity: () => true } }
  p.codeInput.value = { focus: () => focusedWhileBusy.push(p.busy.value) }
  await p.resend()
  assert.equal(p.sent.value, true)
  assert.equal(p.remaining.value, 60)
  assert.deepEqual(focusedWhileBusy, [false])
  p.remaining.value = 0
  p.code.value = '123'
  await p.resend()
  assert.equal(p.code.value, '')
  assert.deepEqual(focusedWhileBusy, [false, false])
  assert.equal(p.navigations(), 0)
})

test('preferred email factor can switch to a configured authenticator without reusing a code', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const p = await page('signin', async (url, options) => {
    calls.push({ url, body: options.body })
    return url === '/api/auth/sign-in/email'
      ? {
          twoFactorRedirect: true,
          twoFactorMethods: ['totp', 'otp'],
          preferredTwoFactorMethod: 'otp',
          hasRecoveryCodes: true,
        }
      : {}
  })
  await p.submit()
  assert.equal(p.factor.value, 'email')
  assert.equal(calls.at(-1)?.url, '/api/auth/two-factor/send-otp')
  p.code.value = '123456'
  p.choosingFactor.value = true
  await p.chooseFactor('totp')
  assert.equal(p.code.value, '')
  assert.equal(p.choosingFactor.value, false)
  p.code.value = '654321'
  await p.submit()
  assert.equal(calls.at(-1)?.url, '/api/auth/two-factor/verify-totp')
  assert.equal(calls.at(-1)?.body.code, '654321')
  assert.equal(p.navigations(), 1)
})

test('unconfigured alternatives cannot be selected or send an email', async () => {
  const calls: string[] = []
  const p = await page('signin', async (url) => {
    calls.push(url)
    return { twoFactorRedirect: true, twoFactorMethods: ['totp'] }
  })
  await p.submit()
  await p.chooseFactor('email')
  await p.chooseFactor('recovery')
  assert.equal(p.factor.value, 'totp')
  assert.equal(calls.length, 1)
})

test('email-code login waits for an authenticator challenge when the account has TOTP', async () => {
  const calls: string[] = []
  const p = await page('signin', async (url) => {
    calls.push(url)
    return url === '/api/auth/sign-in/email-otp'
      ? {
          twoFactorRedirect: true,
          twoFactorMethods: ['totp'],
          preferredTwoFactorMethod: 'totp',
          hasRecoveryCodes: true,
        }
      : {}
  })
  p.mode.value = 'email'
  p.email.value = 'user@example.com'
  await p.submit()
  p.code.value = '123456'
  await p.submit()
  assert.equal(p.step.value, 'second')
  assert.equal(p.factor.value, 'totp')
  assert.equal(p.code.value, '')
  assert.equal(p.navigations(), 0)
  p.code.value = '654321'
  await p.submit()
  assert.equal(calls.at(-1), '/api/auth/two-factor/verify-totp')
  assert.equal(p.navigations(), 1)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolveCloudLocale } from '../apps/cloud/i18n/locale.ts'
import { accountError } from '../apps/cloud/app/utils/account-error.ts'

const messages = Object.fromEntries(
  ['en', 'zh-Hans'].map((locale) => [
    locale,
    JSON.parse(readFileSync(`apps/cloud/i18n/locales/${locale}.json`, 'utf8')),
  ]),
)
const translate =
  (locale: string) =>
  (key: string): string => {
    const value = key
      .split('.')
      .reduce((result, part) => result?.[part], messages[locale])
    assert.equal(
      typeof value,
      'string',
      `Missing ${locale} translation: ${key}`,
    )
    return value
  }

test('Cloud negotiates English and simplified Chinese by browser preference and quality', () => {
  for (const header of [
    'zh-CN,zh;q=0.9,en;q=0.8',
    'zh-Hans',
    'ZH-sg',
    'zh-TW,en;q=0.8',
    'fr,zh-HK;q=0.8',
  ])
    assert.equal(resolveCloudLocale(header), 'zh-Hans', header)
  for (const header of [
    '',
    'ja,fr;q=0.8',
    'en-GB,zh;q=0.5',
    'zh;q=0,en-US;q=0.1',
    'zh;Q=0,en;q=0.8',
    'zh;Q=0.1,en;Q=0.9',
    'zh;q=invalid,en',
    'zh;q=2,en',
    'zh;q=0.5,en;q=0.9',
  ])
    assert.equal(resolveCloudLocale(header), 'en', header)
  assert.equal(resolveCloudLocale('en;q=0.5,zh;q=0.5'), 'en')
  assert.equal(resolveCloudLocale('zh;q=0.5,en;q=0.5'), 'zh-Hans')
})

test('Cloud catalogs have matching keys and interpolation parameters', () => {
  function flatten(
    object: Record<string, unknown>,
    prefix = '',
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(object).flatMap(([key, value]) =>
        typeof value === 'string'
          ? [[prefix + key, value]]
          : Object.entries(
              flatten(value as Record<string, unknown>, prefix + key + '.'),
            ),
      ),
    )
  }
  const en = flatten(messages.en),
    zh = flatten(messages['zh-Hans'])
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const [key, value] of Object.entries(en)) {
    assert.ok(zh[key]?.trim(), key)
    const parameters = (s: string) =>
      [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
    assert.deepEqual(parameters(value), parameters(zh[key]!), key)
  }
})

test('Authentication failures are localized without reflecting provider messages', () => {
  for (const locale of ['en', 'zh-Hans']) {
    const t = translate(locale)
    for (const code of [
      'AUTHENTICATOR_REQUIRED',
      'PASSWORD_TOO_SHORT',
      'EMAIL_NOT_VERIFIED',
      'USER_ALREADY_EXISTS',
      'INVALID_OTP',
      'INVALID_PASSWORD',
      'INVALID_TOKEN',
      'FRESH_SESSION',
      'UNKNOWN_PROVIDER_ERROR',
    ]) {
      const message = accountError(
        { data: { code, message: 'PRIVATE PROVIDER DETAIL' } },
        t,
      )
      assert.ok(message.length > 5)
      assert.ok(!message.includes('PRIVATE PROVIDER DETAIL'))
      assert.equal(/[\u3400-\u9fff]/.test(message), locale === 'zh-Hans')
    }
    assert.match(
      accountError({ statusCode: 429 }, t),
      locale === 'en' ? /Too many attempts/ : /尝试次数过多/,
    )
  }
})

test('Sensitive-operation freshness errors remain actionable in native and H3 response shapes', () => {
  for (const locale of ['en', 'zh-Hans']) {
    const t = translate(locale)
    for (const cause of [
      { data: { code: 'SESSION_NOT_FRESH' } },
      { data: { data: { code: 'SESSION_IS_NOT_FRESH' } } },
      { code: 'FRESH_SESSION_REQUIRED' },
    ])
      assert.equal(
        accountError(cause, t),
        t('cloud.messages.pleaseSignOutAndSignInAgainBeforeChanging'),
      )
  }
})

test('An expired session is distinguished from freshness and browser numeric error codes stay safe', () => {
  const t = translate('zh-Hans')
  assert.equal(
    accountError({ statusCode: 401 }, t),
    t('cloud.messages.sessionExpiredSignInAgain'),
  )
  assert.equal(
    accountError({ code: 20 }, t),
    t('cloud.messages.weCouldNotCompleteThisRequestPleaseTryAgain'),
  )
})

test('passkey counts use correct English plurals and retain Chinese count interpolation', () => {
  const require = createRequire(import.meta.url)
  const i18nRequire = createRequire(
    require.resolve('@nuxtjs/i18n/package.json'),
  )
  const { createI18n } = i18nRequire('vue-i18n')
  for (const locale of ['en', 'zh-Hans']) {
    const i18n = createI18n({ legacy: false, locale, messages })
    for (const count of [0, 1, 2]) {
      const text = i18n.global.t(
        'cloud.security.passkeyCount',
        { count },
        count,
      )
      assert.equal(
        text,
        locale === 'en'
          ? `${count} ${count === 1 ? 'passkey' : 'passkeys'} configured`
          : `已配置 ${count} 个通行密钥`,
      )
    }
    i18n.dispose()
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { splitSqlQuery } from './helpers/sql.ts'
import { defaultTwoFactorMethod } from '../packages/contracts/src/account-security.ts'
import { accountTwoFactorPolicy } from '../packages/platform/src/account-security.ts'

const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')

test('2FA chooses configured user preference, then authenticator, then email', () => {
  assert.equal(defaultTwoFactorMethod([], null), null)
  assert.equal(defaultTwoFactorMethod(['otp'], null), 'otp')
  assert.equal(defaultTwoFactorMethod(['otp', 'totp'], null), 'totp')
  assert.equal(defaultTwoFactorMethod(['totp', 'otp'], 'otp'), 'otp')
  assert.equal(defaultTwoFactorMethod(['totp'], 'otp'), 'totp')
  assert.equal(defaultTwoFactorMethod(['otp'], 'totp'), 'otp')
})

test('D1 migration preserves legacy enrollment and independently resolves factor preferences', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-22',
      script: 'export default {fetch(){return new Response("test")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    const directory = new URL(
      '../packages/platform/migrations/',
      import.meta.url,
    )
    const files = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort()
    /** Apply the canonical SQL in D1, with the final migration separated for upgrade assertions. */
    async function migrate(name: string) {
      const sql = await readFile(new URL(name, directory), 'utf8')
      for (const statement of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run()
    }
    for (const file of files.filter((file) => file < '0051_'))
      await migrate(file)
    await db
      .prepare(`INSERT INTO platform_users(id,email,name,email_verified,two_factor_enabled,created_at)
      VALUES(900,'email@example.test','Email',1,1,1),(901,'totp@example.test','TOTP',1,1,1),(902,'off@example.test','Off',1,0,1)`)
      .run()
    await db
      .prepare(`INSERT INTO platform_two_factors(user_id,secret,backup_codes,verified)
      VALUES(901,'legacy-encrypted-secret','legacy-encrypted-codes',1),(902,'pending-secret','pending-codes',0)`)
      .run()
    await migrate('0051_account_two_factor_methods.sql')
    const email = await accountTwoFactorPolicy(db, 900)
    assert.deepEqual(email.methods, ['otp'])
    assert.equal(email.defaultMethod, 'otp')
    const authenticator = await accountTwoFactorPolicy(db, 901)
    assert.deepEqual(authenticator.methods, ['totp'])
    assert.equal(authenticator.defaultMethod, 'totp')
    assert.deepEqual((await accountTwoFactorPolicy(db, 902)).methods, [])
    await db
      .prepare(
        'UPDATE platform_users SET email_two_factor_enabled=1 WHERE id=901',
      )
      .run()
    assert.equal((await accountTwoFactorPolicy(db, 901)).defaultMethod, 'totp')
    await db
      .prepare(
        "UPDATE platform_users SET preferred_two_factor_method='otp' WHERE id=901",
      )
      .run()
    assert.equal((await accountTwoFactorPolicy(db, 901)).defaultMethod, 'otp')
    await db
      .prepare(
        'UPDATE platform_users SET email_two_factor_enabled=0 WHERE id=901',
      )
      .run()
    assert.equal((await accountTwoFactorPolicy(db, 901)).preferredMethod, null)
    assert.equal((await accountTwoFactorPolicy(db, 901)).defaultMethod, 'totp')
    assert.equal(
      (
        await db
          .prepare('SELECT secret FROM platform_two_factors WHERE user_id=901')
          .first()
      ).secret,
      'legacy-encrypted-secret',
    )
  } finally {
    await mf.dispose()
  }
})

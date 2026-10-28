import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { createAccountAuth } from '../apps/cloud/server/utils/account-auth.ts'

const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')

test('Cloud account migration preserves identities and enforces verified registration, MFA and reset tokens', async () => {
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
    async function migration(name: string) {
      const sql = await readFile(
        new URL('../packages/platform/migrations/' + name, import.meta.url),
        'utf8',
      )
      for (const statement of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run()
    }
    await migration('0001_platform.sql')
    await db
      .prepare(
        "INSERT INTO platform_users (id,email,created_at) VALUES(42,'existing@example.com',1)",
      )
      .run()
    await db
      .prepare("INSERT INTO platform_workspaces VALUES(1,'Existing workspace')")
      .run()
    await db
      .prepare("INSERT INTO platform_memberships VALUES(42,1,'admin')")
      .run()
    await migration('0002_visitor_access.sql')
    await migration('0003_account_security.sql')
    for (const name of (
      await readdir(
        new URL('../packages/platform/migrations/', import.meta.url),
      )
    )
      .filter((n) => n.endsWith('.sql') && n > '0003_account_security.sql')
      .sort())
      await migration(name)
    assert.equal(
      (await db.prepare('SELECT user_id FROM platform_memberships').first())
        .user_id,
      42,
    )
    assert.equal(
      (
        await db
          .prepare('SELECT email_verified FROM platform_users WHERE id=42')
          .first()
      ).email_verified,
      1,
    )
    const messages: { to: string; subject: string; text: string }[] = []
    const auth = createAccountAuth(
      db,
      {
        portalOrigin: 'https://app.chronoframe.art',
        emailFrom: 'verify@example.com',
        secret: crypto.randomUUID() + crypto.randomUUID(),
      },
      {
        send: async (message) => {
          messages.push(message)
          return { messageId: crypto.randomUUID() }
        },
      },
    )
    let cookies = new Map<string, string>()
    let requestId = 1
    async function call(path: string, body?: unknown, csrf = true) {
      const response = await auth.handler(
        new Request('https://app.chronoframe.art/api/auth' + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            ...(csrf
              ? { origin: 'https://app.chronoframe.art' }
              : { origin: 'https://evil.example.com' }),
            'content-type': 'application/json',
            'cf-connecting-ip': `192.0.2.${requestId++}`,
            cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0]!
        const i = pair.indexOf('=')
        cookies.set(pair.slice(0, i), pair.slice(i + 1))
      }
      const text = await response.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
      return { response, data }
    }
    const email = 'new@example.com',
      password = 'A!' + crypto.randomUUID()
    assert.equal(
      (
        await call(
          '/sign-up/email',
          { email, password, name: 'New photographer' },
          false,
        )
      ).response.status,
      403,
    )
    const signup = await call('/sign-up/email', {
      email,
      password,
      name: 'New photographer',
    })
    assert.equal(signup.response.status, 200, JSON.stringify(signup.data))
    assert.equal((await call('/get-session')).data, null)
    assert.ok(
      (await call('/sign-in/email', { email, password })).response.status >=
        400,
      'unverified password cannot create a session',
    )
    const otp = messages.at(-1)!.text.match(/\b[0-9]{6}\b/)![0]
    const verified = await call('/email-otp/verify-email', { email, otp })
    assert.equal(verified.response.status, 200, JSON.stringify(verified.data))
    assert.equal((await call('/get-session')).data.user.emailVerified, true)
    const sessionCookie = verified.response.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-chronoframe-auth='))
    assert.ok(
      sessionCookie,
      'session uses the browser-enforced host prefix without a double prefix',
    )
    assert.match(sessionCookie, /Secure/)
    assert.match(sessionCookie, /HttpOnly/)
    assert.match(sessionCookie, /SameSite=Lax/i)
    assert.doesNotMatch(sessionCookie, /Domain=/i)
    assert.ok(
      (await call('/email-otp/verify-email', { email, otp })).response.status >=
        400,
    )
    const passkey = await call('/passkey/generate-register-options')
    assert.equal(passkey.response.status, 200, JSON.stringify(passkey.data))
    assert.equal(passkey.data.rp.id, 'app.chronoframe.art')
    assert.equal(
      passkey.data.authenticatorSelection.userVerification,
      'required',
    )
    assert.equal(
      (await call('/two-factor/enable', { password, method: 'otp' })).response
        .status,
      200,
    )
    await call('/sign-out', {})
    const login = await call('/sign-in/email', { email, password })
    assert.equal(login.response.status, 200, JSON.stringify(login.data))
    assert.equal(login.data.twoFactorRedirect, true)
    assert.equal(
      (await call('/get-session')).data,
      null,
      'password alone must not issue an authenticated session',
    )
    assert.equal((await call('/two-factor/send-otp', {})).response.status, 200)
    const second = messages.at(-1)!.text.match(/\b[0-9]{6}\b/)![0]
    const secondVerified = await call('/two-factor/verify-otp', {
      code: second,
    })
    assert.equal(
      secondVerified.response.status,
      200,
      JSON.stringify(secondVerified.data),
    )
    assert.ok((await call('/get-session')).data.user)
    assert.equal(
      (await call('/two-factor/disable', { password })).response.status,
      200,
    )
    const setup = await call('/two-factor/enable', { password, method: 'totp' })
    assert.equal(setup.response.status, 200, JSON.stringify(setup.data))
    assert.ok(setup.data.totpURI.startsWith('otpauth://'))
    assert.ok(setup.data.backupCodes.length >= 8)
    function totp(uri: string) {
      const secret = new URL(uri).searchParams.get('secret')!
      let bits = ''
      for (const c of secret.replace(/=+$/, ''))
        bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
          .indexOf(c.toUpperCase())
          .toString(2)
          .padStart(5, '0')
      const key = Buffer.from(
        (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
      )
      const counter = Buffer.alloc(8)
      counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
      const h = createHmac('sha1', key).update(counter).digest(),
        offset = h[19]! & 15
      return ((h.readUInt32BE(offset) & 0x7fffffff) % 1000000)
        .toString()
        .padStart(6, '0')
    }
    const storedFactor = await db
      .prepare('SELECT secret, backup_codes FROM platform_two_factors')
      .first()
    assert.ok(
      !storedFactor.secret.includes(
        new URL(setup.data.totpURI).searchParams.get('secret'),
      ),
      'authenticator seed is encrypted at rest',
    )
    assert.ok(
      !storedFactor.backup_codes.includes(setup.data.backupCodes[0]),
      'recovery codes are protected at rest',
    )
    const enrollmentCode = totp(setup.data.totpURI)
    assert.equal(
      (await call('/two-factor/verify-totp', { code: enrollmentCode })).response
        .status,
      200,
    )
    await call('/sign-out', {})
    for (const type of ['sign-in', 'email-verification']) {
      await call('/email-otp/send-verification-otp', { email, type })
      const emailCode = messages.at(-1)!.text.match(/\b[0-9]{6}\b/)![0]
      const entry = await call(
        type === 'sign-in' ? '/sign-in/email-otp' : '/email-otp/verify-email',
        { email, otp: emailCode },
      )
      assert.equal(
        entry.data.twoFactorRedirect,
        true,
        JSON.stringify(entry.data),
      )
      assert.equal(
        (await call('/get-session')).data,
        null,
        'email proof must not create a session before TOTP',
      )
      assert.equal(
        (await call('/two-factor/send-otp', {})).response.status,
        403,
      )
      assert.equal(
        (await call('/two-factor/verify-otp', { code: emailCode })).response
          .status,
        403,
        'email cannot substitute for the authenticator',
      )
      assert.equal(
        (
          await call('/two-factor/verify-totp', {
            code: totp(setup.data.totpURI),
            trustDevice: true,
          })
        ).response.status,
        200,
      )
      assert.ok((await call('/get-session')).data.user)
      await call('/sign-out', {})
    }
    await call('/sign-out', {})
    assert.equal(
      (await call('/sign-in/email', { email, password })).data
        .twoFactorRedirect,
      true,
    )
    assert.equal((await call('/get-session')).data, null)
    assert.ok(
      (await call('/two-factor/verify-totp', { code: 'invalid' })).response
        .status >= 400,
    )
    for (let attempt = 0; attempt < 5; attempt++) {
      await call('/sign-in/email', { email, password })
      assert.ok(
        (await call('/two-factor/verify-totp', { code: 'invalid' })).response
          .status >= 400,
      )
    }
    assert.ok(
      (
        await call('/two-factor/verify-backup-code', {
          code: setup.data.backupCodes[0],
        })
      ).response.status >= 400,
      'account lockout survives fresh challenges and changing IPs',
    )
    // Reset only the local fixture lock so the independent recovery lifecycle can continue.
    await db
      .prepare(
        'UPDATE platform_two_factors SET failed_verification_count = 0, locked_until = NULL',
      )
      .run()
    await call('/sign-in/email', { email, password })
    assert.equal(
      (
        await call('/two-factor/verify-backup-code', {
          code: setup.data.backupCodes[0],
        })
      ).response.status,
      200,
    )
    await call('/sign-out', {})
    assert.equal(
      (await call('/sign-in/email', { email, password })).data
        .twoFactorRedirect,
      true,
    )
    assert.ok(
      (
        await call('/two-factor/verify-backup-code', {
          code: setup.data.backupCodes[0],
        })
      ).response.status >= 400,
      'recovery codes are one use',
    )
    assert.equal(
      (
        await call('/two-factor/verify-backup-code', {
          code: setup.data.backupCodes[1],
        })
      ).response.status,
      200,
    )
    await call('/two-factor/disable', { password })
    assert.ok(
      (
        await call('/request-password-reset', {
          email,
          redirectTo: 'https://evil.example.com/reset',
        })
      ).response.status >= 400,
    )

    const reset = await call('/request-password-reset', {
      email,
      redirectTo: 'https://app.chronoframe.art/reset-password',
    })
    assert.equal(reset.response.status, 200, JSON.stringify(reset.data))
    const link = messages.at(-1)!.text.match(/https:\/\/\S+/)![0]
    const token = new URL(link).pathname.split('/').at(-1)
    const newPassword = 'B!' + crypto.randomUUID()
    const changed = await call('/reset-password', { token, newPassword })
    assert.equal(changed.response.status, 200, JSON.stringify(changed.data))
    assert.equal(
      (await call('/get-session')).data,
      null,
      'password reset revokes prior sessions',
    )
    assert.ok(
      (await call('/reset-password', { token, newPassword })).response.status >=
        400,
    )
    cookies = new Map()
    assert.ok(
      (await call('/sign-in/email', { email, password })).response.status >=
        400,
    )
    assert.equal(
      (await call('/sign-in/email', { email, password: newPassword })).response
        .status,
      200,
    )
    assert.ok(
      (
        await call('/change-password', {
          currentPassword: password,
          newPassword: 'Changed!' + crypto.randomUUID(),
          revokeOtherSessions: true,
        })
      ).response.status >= 400,
    )
    assert.equal(
      (
        await call('/change-password', {
          currentPassword: newPassword,
          newPassword: 'Changed!' + crypto.randomUUID(),
          revokeOtherSessions: true,
        })
      ).response.status,
      200,
    )
    await call('/sign-out', {})
    // Existing verified code-only users retain their original numeric identity.
    await call('/email-otp/send-verification-otp', {
      email: 'existing@example.com',
      type: 'sign-in',
    })
    const existingCode = messages.at(-1)!.text.match(/\b[0-9]{6}\b/)![0]
    assert.equal(
      (
        await call('/sign-in/email-otp', {
          email: 'existing@example.com',
          otp: existingCode,
        })
      ).response.status,
      200,
    )
    assert.equal(Number((await call('/get-session')).data.user.id), 42)
    await call('/sign-out', {})
    assert.ok(
      (
        await call('/sign-in/email-otp', {
          email: 'existing@example.com',
          otp: existingCode,
        })
      ).response.status >= 400,
    )
    await call('/request-password-reset', {
      email: 'existing@example.com',
      redirectTo: 'https://app.chronoframe.art/reset-password',
    })
    const existingResetLink = messages.at(-1)!.text.match(/https:\/\/\S+/)![0]
    const existingPassword = 'Existing!' + crypto.randomUUID()
    const setFirstPassword = await call('/reset-password', {
      token: new URL(existingResetLink).pathname.split('/').at(-1),
      newPassword: existingPassword,
    })
    assert.equal(
      setFirstPassword.response.status,
      200,
      JSON.stringify(setFirstPassword.data),
    )
    assert.equal(
      (
        await call('/sign-in/email', {
          email: 'existing@example.com',
          password: existingPassword,
        })
      ).response.status,
      200,
    )
    assert.equal(
      Number((await call('/get-session')).data.user.id),
      42,
      'setting a first password does not replace a migrated identity',
    )
    await call('/sign-out', {})
    await db
      .prepare(
        "INSERT INTO platform_account_controls(user_id,suspended,public_reason) VALUES(42,1,'Account suspended for review. Contact support.')",
      )
      .run()
    const wrong = await call('/sign-in/email', {
      email: 'existing@example.com',
      password: 'wrong-password',
    })
    assert.ok(wrong.response.status >= 400)
    assert.ok(!JSON.stringify(wrong.data).includes('suspended for review'))
    const banned = await call('/sign-in/email', {
      email: 'existing@example.com',
      password: existingPassword,
    })
    assert.equal(banned.response.status, 403)
    assert.equal(banned.data.code, 'ACCOUNT_SUSPENDED')
    assert.match(banned.data.message, /suspended for review/)
    await call('/email-otp/send-verification-otp', {
      email: 'existing@example.com',
      type: 'sign-in',
    })
    const bannedCode = messages.at(-1)!.text.match(/\b[0-9]{6}\b/)![0]
    const bannedOtp = await call('/sign-in/email-otp', {
      email: 'existing@example.com',
      otp: bannedCode,
    })
    assert.equal(bannedOtp.response.status, 403)
    assert.equal((await call('/get-session')).data, null)
    await db
      .prepare(
        'UPDATE platform_account_controls SET suspended=0 WHERE user_id=42',
      )
      .run()
    const before = messages.length
    await call('/email-otp/send-verification-otp', {
      email: 'unknown@example.com',
      type: 'sign-in',
    })
    assert.equal(
      messages.length,
      before,
      'unknown accounts cannot silently register through email sign-in',
    )
    let finishDelivery!: () => void
    const delivery = new Promise<void>((resolve) => {
      finishDelivery = resolve
    })
    let delivered = false
    const background: Promise<unknown>[] = []
    const deferredAuth = createAccountAuth(
      db,
      {
        portalOrigin: 'https://app.chronoframe.art',
        emailFrom: 'verify@example.com',
        secret: crypto.randomUUID() + crypto.randomUUID(),
      },
      {
        send: async () => {
          await delivery
          delivered = true
          return { messageId: 'local-background-test' }
        },
      },
      (task) => {
        background.push(task)
      },
    )
    try {
      const queued = await Promise.race([
        deferredAuth.handler(
          new Request(
            'https://app.chronoframe.art/api/auth/email-otp/send-verification-otp',
            {
              method: 'POST',
              headers: {
                origin: 'https://app.chronoframe.art',
                'content-type': 'application/json',
                'cf-connecting-ip': '203.0.113.25',
              },
              body: JSON.stringify({
                email: 'existing@example.com',
                type: 'sign-in',
              }),
            },
          ),
        ),
        new Promise<never>((_, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Email provider delayed the auth response')),
            1500,
          )
          timeout.unref()
        }),
      ])
      assert.equal(queued.status, 200)
      assert.equal(delivered, false)
      assert.ok(
        background.length > 0,
        'delivery is attached to the platform background task handler',
      )
    } finally {
      finishDelivery()
      await Promise.all(background)
    }
    assert.equal(delivered, true)
  } finally {
    await mf.dispose()
  }
})

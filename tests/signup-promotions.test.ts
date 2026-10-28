import { splitSqlQuery } from './helpers/sql.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createAccountAuth } from '../apps/cloud/server/utils/account-auth.ts'
import { createD1Provisioning } from '../packages/platform/src/index.ts'
import {
  signupOfferForRegistration,
  resolveSubscription,
  validateSignupPromotion,
} from '../packages/platform/src/subscriptions.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
test('Signup promotions snapshot eligibility at actual registration, grant once and expire from registration', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    for (const file of (
      await readdir(
        new URL('../packages/platform/migrations/', import.meta.url),
      )
    )
      .filter((n) => n.endsWith('.sql'))
      .sort())
      for (const sql of splitSqlQuery(
        (
          await readFile(
            new URL('../packages/platform/migrations/' + file, import.meta.url),
            'utf8',
          )
        ).replace(/^--.*$/gm, ''),
      ).filter((s) => s.trim()))
        await db.prepare(sql).run()
    const now = Date.now(),
      day = 86400000
    const free = await db
      .prepare("SELECT policy_json FROM platform_plans WHERE id='free'")
      .first()
    await db
      .prepare(
        "INSERT INTO platform_plans(id,name,policy_json) VALUES('trial','Trial',?)",
      )
      .bind(free.policy_json)
      .run()
    for (const [unit, value] of [
      ['days', null],
      ['days', 0],
      ['days', -1],
      ['days', 36501],
      ['days', 1.5],
      ['months', null],
      ['months', 1201],
      ['permanent', 14],
    ]) {
      await assert.rejects(
        db
          .prepare(
            "INSERT INTO platform_signup_promotions(id,name,plan_id,ends_at,duration_unit,duration_value,created_at) VALUES('invalid','Invalid','trial',?,?,?,?)",
          )
          .bind(now + day, unit, value, now)
          .run(),
        /CHECK constraint failed/,
      )
    }
    await db
      .prepare(
        "INSERT INTO platform_signup_promotions(id,name,plan_id,starts_at,ends_at,duration_unit,duration_value,priority,enabled,created_at) VALUES('before','Before cutoff','trial',NULL,?,'days',7,0,1,?),('trial14','14-day Trial','trial',?,?,'days',14,10,1,?),('off','Disabled','trial',NULL,?,'days',99,100,0,?)",
      )
      .bind(
        now + 100000,
        now - 20 * day,
        now,
        now + 100000,
        now - 20 * day,
        now + 100000,
        now - 20 * day,
      )
      .run()
    assert.equal(
      JSON.parse(await signupOfferForRegistration(db, now - 1)).promotionId,
      'before',
    )
    assert.equal(
      JSON.parse(await signupOfferForRegistration(db, now)).promotionId,
      'trial14',
    )
    assert.equal(
      JSON.parse(await signupOfferForRegistration(db, now + 100000 - 1))
        .promotionId,
      'trial14',
    )
    assert.equal(
      JSON.parse(await signupOfferForRegistration(db, now + 100000))
        .promotionId,
      null,
    )
    assert.throws(() =>
      validateSignupPromotion({
        name: 'x',
        planId: 'trial',
        enabled: true,
        startsAt: now,
        endsAt: now,
        priority: 0,
        duration: { unit: 'days', value: 14 },
      }),
    )
    const sent: string[] = []
    const auth = createAccountAuth(
      db,
      {
        portalOrigin: 'https://app.chronoframe.art',
        secret: 'signup-test-secret-'.repeat(4),
        emailFrom: 'verify@example.com',
      },
      {
        send: async (m) => {
          sent.push(m.text)
          return { messageId: crypto.randomUUID() }
        },
      },
    )
    const call = async (path: string, body: any, cookie = '') =>
      auth.handler(
        new Request('https://app.chronoframe.art/api/auth' + path, {
          method: 'POST',
          headers: {
            origin: 'https://app.chronoframe.art',
            'content-type': 'application/json',
            'cf-connecting-ip': '192.0.2.10',
            cookie,
          },
          body: JSON.stringify(body),
        }),
      )
    const forged = await call('/sign-up/email', {
      email: 'forged@example.com',
      password: 'Strong-password-12345',
      name: 'Forged',
      signupOffer: '{"planId":"trial"}',
    })
    assert.equal(forged.status, 400)
    assert.equal(
      await db
        .prepare(
          "SELECT id FROM platform_users WHERE email='forged@example.com'",
        )
        .first(),
      null,
    )
    const response = await call('/sign-up/email', {
      email: 'trial@example.com',
      password: 'Strong-password-12345',
      name: 'Trial user',
      createdAt: new Date(now - 40 * day).toISOString(),
    })
    assert.equal(response.status, 200, await response.clone().text())
    assert.ok(!(await response.text()).includes('signupOffer'))
    const registered = await db
      .prepare("SELECT * FROM platform_users WHERE email='trial@example.com'")
      .first()
    const registeredAt = new Date(registered.created_at).getTime()
    const snapshot = JSON.parse(registered.signup_offer)
    assert.equal(snapshot.promotionId, 'trial14')
    assert.equal(snapshot.startsAt, registeredAt)
    assert.equal(snapshot.expiresAt, registeredAt + 14 * day)
    const otp = sent.at(-1)!.match(/\b[0-9]{6}\b/)![0]
    const verification = await call('/email-otp/verify-email', {
      email: 'trial@example.com',
      otp,
    })
    assert.equal(verification.status, 200, await verification.clone().text())
    assert.ok(!(await verification.clone().text()).includes('signupOffer'))
    const automatic = await db
      .prepare(
        'SELECT wp.plan_id,wp.expires_at FROM platform_workspaces w JOIN platform_workspace_plans wp ON wp.workspace_id=w.id WHERE w.owner_user_id=?',
      )
      .bind(registered.id)
      .first()
    assert.equal(
      automatic.plan_id,
      'trial',
      'verified registration automatically activates the owned workspace before returning its session',
    )
    assert.equal(automatic.expires_at, registeredAt + 14 * day)
    const cookie = verification.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    await call('/update-user', { signupOffer: '{"planId":"free"}' }, cookie)
    assert.equal(
      (
        await db
          .prepare('SELECT signup_offer FROM platform_users WHERE id=?')
          .bind(registered.id)
          .first()
      ).signup_offer,
      registered.signup_offer,
    )
    await db
      .prepare(
        'UPDATE platform_signup_promotions SET enabled=0,revision=revision+1',
      )
      .run()
    const store = createD1Provisioning(db)
    const [first, second] = await Promise.all([
      store.defaultWorkspace(registered.id),
      store.defaultWorkspace(registered.id),
    ])
    assert.equal(first.id, second.id)
    const grant = await resolveSubscription(db, first.id)
    assert.equal(grant.id, 'trial')
    assert.equal(grant.subscription.source, 'promotion')
    assert.equal(grant.subscription.expiresAt, registeredAt + 14 * day)
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_subscription_events WHERE workspace_id=?',
          )
          .bind(first.id)
          .first()
      ).n,
      1,
    )
    assert.equal(
      (await resolveSubscription(db, first.id, registeredAt + 14 * day)).id,
      'free',
    )
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='free',source='manual',expires_at=NULL,revision=revision+1 WHERE workspace_id=?",
      )
      .bind(first.id)
      .run()
    await store.defaultWorkspace(registered.id)
    assert.equal(
      (await resolveSubscription(db, first.id)).subscription.source,
      'manual',
      'signup provisioning never replaces a subsequent assignment',
    )
    await db
      .prepare(
        "INSERT INTO platform_users(email,email_verified,created_at,updated_at,signup_offer) VALUES('late@example.com',1,?,?,?)",
      )
      .bind(
        now - 15 * day,
        now,
        JSON.stringify({
          ...snapshot,
          startsAt: now - 15 * day,
          expiresAt: now - day,
        }),
      )
      .run()
    const late = await db
      .prepare("SELECT id FROM platform_users WHERE email='late@example.com'")
      .first()
    const lateWorkspace = await store.defaultWorkspace(late.id)
    assert.equal(
      (await resolveSubscription(db, lateWorkspace.id)).id,
      'free',
      'delayed verification cannot restart a trial',
    )
    await db.prepare('UPDATE platform_signup_promotions SET enabled=1').run()
    await db
      .prepare("UPDATE platform_plans SET active=0 WHERE id='trial'")
      .run()
    assert.equal(
      JSON.parse(await signupOfferForRegistration(db, Date.now())).planId,
      'free',
      'inactive target tiers cannot be awarded',
    )
    await db
      .prepare("UPDATE platform_plans SET active=1 WHERE id='trial'")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_users(email,email_verified,created_at,updated_at) VALUES('legacy@example.com',1,?,?)",
      )
      .bind(now - 100, now)
      .run()
    const legacy = await db
      .prepare("SELECT id FROM platform_users WHERE email='legacy@example.com'")
      .first()
    assert.equal(
      (
        await resolveSubscription(
          db,
          (await store.defaultWorkspace(legacy.id)).id,
        )
      ).id,
      'free',
      'legacy accounts never pick up retrospective promotions',
    )
  } finally {
    await mf.dispose()
  }
})

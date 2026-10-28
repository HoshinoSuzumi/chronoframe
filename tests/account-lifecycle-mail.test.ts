import { splitSqlQuery } from './helpers/sql.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  DAY,
  scanAccounts,
  markAccount,
  restoreAccount,
  deliverLifecycleMail,
  lifecycleSettings,
  validateLifecycleSettings,
  deletionDeadline,
} from '../packages/platform/src/account-lifecycle.ts'
import { purgeAccounts } from '../packages/platform/src/account-purge.ts'
import {
  defaultMailTemplate,
  renderMail,
  validateMailTemplate,
} from '../packages/platform/src/mail.ts'
import { createAccountAuth } from '../apps/cloud/server/utils/account-auth.ts'
const require = createRequire(import.meta.url),
  { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve('wrangler/package.json'),
  )('miniflare')
async function fixture() {
  const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-10-26',
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ['DB'],
      }),
    ),
    db = await mf.getD1Database('DB')
  try {
    for (const file of (
      await readdir(
        new URL('../packages/platform/migrations/', import.meta.url),
      )
    )
      .filter((f) => f.endsWith('.sql'))
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
  } catch (error) {
    await mf.dispose()
    throw error
  }
  return { mf, db }
}
test('Lifecycle notices, current-login race, restore, retained deadline and retryable external purge', async () => {
  const { mf, db } = await fixture()
  try {
    const now = Date.now(),
      messages: any[] = [],
      binding = {
        send: async (m: any) => {
          messages.push(m)
          return { messageId: 'id' }
        },
      }
    await db
      .prepare('UPDATE platform_lifecycle_settings SET activated_at=?')
      .bind(now - 200 * DAY)
      .run()
    for (const [id, verified, age] of [
      [1, 0, 7],
      [2, 1, 83],
      [3, 1, 90],
      [4, 1, 10],
      [5, 0, 11],
    ])
      await db
        .prepare(
          'INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          `user${id}@example.com`,
          'User',
          verified,
          now - age * DAY,
          now - age * DAY,
          now - age * DAY,
        )
        .run()
    await db
      .prepare(
        "INSERT INTO platform_auth_sessions(token,user_id,created_at,updated_at,expires_at) VALUES('old',3,?,?,?)",
      )
      .bind(now - DAY, now - DAY, now + DAY)
      .run()
    await scanAccounts(db, now)
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_account_deletions')
          .first()
      ).n,
      1,
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_auth_sessions WHERE user_id=3',
          )
          .first()
      ).n,
      0,
    )
    await deliverLifecycleMail(db, binding, 'https://app.chronoframe.art', now)
    assert.equal(messages.length, 4)
    assert.ok(
      messages.every(
        (m) =>
          m.from.startsWith('ChronoFrame Cloud <') &&
          m.html.includes('<!doctype html>') &&
          m.text.includes('support@chronoframe.art'),
      ),
    )
    assert.equal(
      messages.filter((m) => m.subject.includes('scheduled')).length,
      3,
    )
    await scanAccounts(db, now)
    await deliverLifecycleMail(db, binding, 'https://app.chronoframe.art', now)
    assert.equal(messages.length, 4)
    // Resolved verification and new login invalidate queued warnings before sending.
    await scanAccounts(db, now + 4 * DAY)
    await db
      .prepare(
        'UPDATE platform_users SET email_verified=1,last_login_at=? WHERE id IN(1,2)',
      )
      .bind(now + 4 * DAY)
      .run()
    const prior = messages.length
    await deliverLifecycleMail(
      db,
      binding,
      'https://app.chronoframe.art',
      now + 4 * DAY,
    )
    assert.ok(
      messages
        .slice(prior)
        .every(
          (m) => !['user1@example.com', 'user2@example.com'].includes(m.to),
        ),
    )
    assert.equal(
      await markAccount(
        db,
        2,
        'Outdated inactivity scan',
        'inactive',
        null,
        now + 4 * DAY,
        { login: now - 83 * DAY, verified: 1, settingsRevision: 1 },
      ),
      false,
    )
    const deletion = await db
      .prepare('SELECT * FROM platform_account_deletions WHERE user_id=3')
      .first()
    await db
      .prepare(
        'UPDATE platform_lifecycle_settings SET retention_days=1,revision=revision+1',
      )
      .run()
    assert.equal(
      (
        await db
          .prepare(
            'SELECT purge_at FROM platform_account_deletions WHERE user_id=3',
          )
          .first()
      ).purge_at,
      deletion.purge_at,
    )
    assert.equal(
      await restoreAccount(
        db,
        3,
        deletion.revision,
        4,
        'Customer requested restoration',
        now + DAY,
      ),
      true,
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT suspended FROM platform_account_controls WHERE user_id=3',
          )
          .first()
      ).suspended,
      0,
    )
    // Existing suspension is retained when restoring a deletion mark.
    await db
      .prepare(
        "INSERT INTO platform_account_controls(user_id,suspended,public_reason) VALUES(4,1,'Existing suspension')",
      )
      .run()
    assert.equal(
      await markAccount(db, 4, 'Manual cleanup request', 'manual', 2, now),
      true,
    )
    const d4 = await db
      .prepare('SELECT * FROM platform_account_deletions WHERE user_id=4')
      .first()
    assert.equal(
      await restoreAccount(
        db,
        4,
        d4.revision,
        2,
        'Restore original account status',
        now + 100,
      ),
      true,
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT public_reason FROM platform_account_controls WHERE user_id=4',
          )
          .first()
      ).public_reason,
      'Existing suspension',
    )
    // Clean two owned sites; retain shared spaces owned by another user and their files.
    await db.prepare('DELETE FROM platform_account_deletions').run()
    await db
      .prepare(
        "INSERT INTO platform_workspaces(id,name,owner_user_id) VALUES(1,'Owned',3),(2,'Other',4)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name,slug,published) VALUES(1,1,'Site','mine',1),(2,2,'Other','other',1)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_memberships VALUES(3,1,'admin'),(3,2,'member'),(4,2,'admin')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_storage_connections(site_id,id,current_revision) VALUES(1,'s3',1)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_storage_versions VALUES(1,'s3',1,'{}','encrypted')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_photos(site_id,id,source_version,title) VALUES(1,'p','1','P'),(2,'p','1','Other')",
      )
      .run()
    await db
      .prepare("INSERT INTO cloud_albums(site_id,id,title) VALUES(1,'a','A')")
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_album_photos(site_id,album_id,photo_id) VALUES(1,'a','p')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_domains(hostname,site_id,verified,active) VALUES('mine.example.com',1,1,1)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at,state) VALUES(1,'processing-upload',3,'p','1','s3','chronoframe/1/original.jpg',10,?,'completed')",
      )
      .bind(now + DAY)
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_processing_jobs(site_id,id,upload_id,photo_id,source_version,pipeline_version,state,created_at,attempt_id,worker_id,lease_until) VALUES(1,'processing-job','processing-upload','p','1','1','running',?,'attempt','worker',?)",
      )
      .bind(now, now + 120000)
      .run()
    assert.equal(
      await markAccount(
        db,
        3,
        'Manual cleanup after recovery',
        'manual',
        2,
        now,
      ),
      true,
    )
    assert.equal(
      (
        await db
          .prepare('SELECT suspended FROM platform_sites WHERE id=1')
          .first()
      ).suspended,
      1,
    )
    assert.equal(
      (
        await db
          .prepare(
            "SELECT lease_until FROM cloud_processing_jobs WHERE id='processing-job'",
          )
          .first()
      ).lease_until,
      now,
    )
    await db
      .prepare(
        "INSERT INTO platform_verifications(identifier,value,expires_at,created_at,updated_at) VALUES('sign-in-otp-user3@example.com','own',?,?,?),('sign-in-otp-xuser3@example.com','other',?,?,?)",
      )
      .bind(now + DAY, now, now, now + DAY, now, now)
      .run()
    await db
      .prepare(
        "INSERT INTO platform_verifications(identifier,value,expires_at,created_at,updated_at) VALUES('reset-password:own','3',9999999999999,0,0),('reset-password:other','13',9999999999999,0,0),('2fa-own','3',9999999999999,0,0),('2fa-attempts-2fa-own','0',9999999999999,0,0),('2fa-otp-2fa-own','hash',9999999999999,0,0),('trust-device-own','3',9999999999999,0,0)",
      )
      .run()
    let domainReady = false,
      storageReady = false,
      storageCalls = 0
    const cleanup = {
      domains: async () => domainReady,
      storage: async () => {
        storageCalls++
        if (!storageReady) throw new Error('Provider unavailable')
        return true
      },
    }
    await purgeAccounts(db, cleanup, now + DAY - 1)
    assert.equal(storageCalls, 0)
    await purgeAccounts(db, cleanup, now + DAY)
    assert.equal(storageCalls, 0)
    domainReady = true
    await purgeAccounts(db, cleanup, now + DAY + 60000)
    assert.equal(
      (
        await db
          .prepare(
            'SELECT error FROM platform_account_deletions WHERE user_id=3',
          )
          .first()
      ).error,
      'resource_cleanup_failed',
    )
    assert.ok(
      await db.prepare('SELECT id FROM platform_users WHERE id=3').first(),
    )
    assert.ok(await db.prepare('SELECT * FROM cloud_storage_versions').first())
    assert.equal(
      await restoreAccount(db, 3, 1, 2, 'Too late to restore', now + 2 * DAY),
      false,
    )
    storageReady = true
    await purgeAccounts(db, cleanup, now + 2 * DAY)
    await purgeAccounts(db, cleanup, now + 2 * DAY + 60000)
    assert.equal(
      await db.prepare('SELECT id FROM platform_users WHERE id=3').first(),
      null,
    )
    assert.equal(
      await db.prepare('SELECT id FROM platform_workspaces WHERE id=1').first(),
      null,
    )
    assert.ok(
      await db.prepare('SELECT id FROM cloud_photos WHERE site_id=2').first(),
    )
    assert.ok(
      await db
        .prepare(
          "SELECT id FROM platform_verifications WHERE identifier='sign-in-otp-xuser3@example.com'",
        )
        .first(),
    )
    assert.equal(
      await db
        .prepare(
          "SELECT id FROM platform_verifications WHERE identifier='sign-in-otp-user3@example.com'",
        )
        .first(),
      null,
    )

    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_verifications WHERE identifier IN('reset-password:own','2fa-own','2fa-attempts-2fa-own','2fa-otp-2fa-own','trust-device-own')",
          )
          .first()
      ).n,
      0,
    )
    assert.ok(
      await db
        .prepare(
          "SELECT id FROM platform_verifications WHERE identifier='reset-password:other'",
        )
        .first(),
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_memberships WHERE user_id=3',
          )
          .first()
      ).n,
      0,
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_mail_outbox WHERE user_id=3',
          )
          .first()
      ).n,
      0,
    )
  } finally {
    await mf.dispose()
  }
})
test('Templates escape content, validate headers, preserve auth requirements and retry notifications', async () => {
  const template = defaultMailTemplate('verification'),
    m = renderMail(template, {
      code: '<script>123456</script>',
      purpose: 'verify',
      minutes: '10',
    })
  assert.ok(m.html.includes('&lt;script&gt;'))
  assert.ok(!m.html.includes('<script>'))
  assert.match(m.text, /123456/)
  assert.throws(() =>
    validateMailTemplate({
      ...template,
      from: 'a@example.com\r\nBcc:x@example.com',
    }),
  )
  assert.throws(() =>
    validateMailTemplate({ ...template, body: '{{unknown}}' }),
  )
  assert.throws(() => renderMail(template, {}, 'javascript:alert(1)'))
  assert.throws(() =>
    renderMail(template, {}, 'http://localhost:3001/reset-password'),
  )
  assert.doesNotThrow(() =>
    renderMail(template, {}, 'http://localhost:3001/reset-password', true),
  )
  for (const url of [
    'http://example.com/reset',
    'http://localhost.example.com/reset',
    'http://user@localhost/reset',
    'javascript:alert(1)',
  ])
    assert.throws(() => renderMail(template, {}, url, true))
  assert.throws(() =>
    validateLifecycleSettings({
      enabled: true,
      unverifiedDays: 14,
      inactiveDays: 90,
      retentionDays: 15,
      warningDays: [14, 3],
    }),
  )
  const { mf, db } = await fixture()
  try {
    const now = Date.now()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at,last_login_at,email_verified) VALUES(1,'notify@example.com',?,?,1)",
      )
      .bind(now, now)
      .run()
    await markAccount(db, 1, 'Manual deletion example', 'manual', null, now)
    let calls = 0
    const failing = {
      send: async () => {
        calls++
        throw new Error('SMTP secret must not be persisted')
      },
    }
    await deliverLifecycleMail(db, failing, 'https://app.chronoframe.art', now)
    assert.equal(calls, 1)
    assert.equal(
      (await db.prepare('SELECT error FROM platform_mail_outbox').first())
        .error,
      'email_delivery_failed',
    )
    await deliverLifecycleMail(
      db,
      failing,
      'https://app.chronoframe.art',
      now + 59999,
    )
    assert.equal(calls, 1)
    await deliverLifecycleMail(
      db,
      failing,
      'https://app.chronoframe.art',
      now + 60000,
    )
    assert.equal(calls, 2)
    assert.equal(
      (
        await db
          .prepare('SELECT available_at FROM platform_mail_outbox')
          .first()
      ).available_at,
      now + 180000,
    )
    await deliverLifecycleMail(
      db,
      failing,
      'https://app.chronoframe.art',
      now + 179999,
    )
    assert.equal(calls, 2)
    await deliverLifecycleMail(
      db,
      failing,
      'https://app.chronoframe.art',
      now + 180000,
    )
    assert.equal(calls, 3)
    const exhausted = await db
      .prepare('SELECT attempts,state,error FROM platform_mail_outbox')
      .first()
    assert.deepEqual(exhausted, {
      attempts: 3,
      state: 'failed',
      error: 'email_delivery_exhausted',
    })
    await deliverLifecycleMail(
      db,
      failing,
      'https://app.chronoframe.art',
      now + DAY,
    )
    assert.equal(calls, 3)
    const auth = createAccountAuth(
      db,
      {
        portalOrigin: 'https://app.chronoframe.art',
        secret: 'secret'.repeat(8),
        emailFrom: 'verify@noreply.chronoframe.art',
      },
      failing,
    )
    // Live suspension reason blocks creating a session, including all auth methods.
    const options = (
      await import('../apps/cloud/server/utils/account-auth.ts')
    ).accountAuthOptions(
      db as any,
      {
        portalOrigin: 'https://app.chronoframe.art',
        secret: 'secret'.repeat(8),
        emailFrom: '',
      },
      failing,
    )
    await assert.rejects(
      options.databaseHooks.session.create.before({ userId: '1' } as any),
      /Account deleted/,
    )
    assert.ok(auth)
    const settings = await lifecycleSettings(db)
    assert.ok(
      deletionDeadline(
        { email_verified: 0, created_at: now - 100 * DAY },
        settings,
      ) >=
        settings.activatedAt + 7 * DAY,
    )
  } finally {
    await mf.dispose()
  }
})
test('S3 cleanup lists and deletes only the exact tenant prefix, including unfinished multiparts', async () => {
  const { createCloudS3 } = await import('../packages/storage/src/s3-edge.ts')
  let objects = true,
    multipart = true
  const removed: string[] = [],
    aborted: string[] = []
  const s3 = createCloudS3(
    {
      endpoint:
        'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'photos',
      accessKeyId: 'fake',
      secretAccessKey: 'fake',
    },
    {
      fetch: (async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
          ),
          method =
            init?.method ?? (input instanceof Request ? input.method : 'GET')
        if (url.searchParams.has('versioning'))
          return new Response('<VersioningConfiguration/>', {
            headers: { 'content-type': 'application/xml' },
          })
        if (url.searchParams.has('uploads')) {
          assert.equal(url.searchParams.get('prefix'), 'chronoframe/7/')
          return new Response(
            `<ListMultipartUploadsResult>${multipart ? '<Upload><Key>chronoframe/7/pending</Key><UploadId>pending-id</UploadId></Upload>' : ''}<IsTruncated>false</IsTruncated></ListMultipartUploadsResult>`,
            { headers: { 'content-type': 'application/xml' } },
          )
        }
        if (url.searchParams.has('list-type')) {
          assert.equal(url.searchParams.get('prefix'), 'chronoframe/7/')
          return new Response(
            `<ListBucketResult>${objects ? '<Contents><Key>chronoframe/7/original.jpg</Key><Size>10</Size></Contents>' : ''}<IsTruncated>false</IsTruncated></ListBucketResult>`,
            { headers: { 'content-type': 'application/xml' } },
          )
        }
        if (url.searchParams.has('delete')) {
          assert.equal(method, 'POST')
          const body =
            input instanceof Request
              ? await input.clone().text()
              : await new Response(init?.body as BodyInit).text()
          assert.ok(body.includes('<Key>chronoframe/7/original.jpg</Key>'))
          removed.push('chronoframe/7/original.jpg')
          objects = false
          return new Response('<DeleteResult/>', {
            headers: { 'content-type': 'application/xml' },
          })
        }
        assert.equal(method, 'DELETE')
        assert.ok(url.pathname.startsWith('/photos/chronoframe/7/'))
        if (url.searchParams.has('uploadId')) {
          aborted.push(url.pathname)
          multipart = false
        } else {
          removed.push(url.pathname)
          objects = false
        }
        return new Response(null, { status: 204 })
      }) as typeof fetch,
    },
  )
  assert.equal(await s3.purgeTenant(7), true)
  assert.equal(await s3.purgeTenant(7), true)
  assert.equal(removed.length, 1)
  assert.equal(aborted.length, 1)
  await assert.rejects(s3.purgeTenant(0))
})
test('Subscription exemptions match live/expired history, sources, tiers and combinations; manual marks remain possible', async () => {
  const { accountExemption, validateExemptions, DEFAULT_EXEMPTIONS } =
    await import('../packages/platform/src/lifecycle-exemptions.ts')
  const { mf, db } = await fixture()
  try {
    const now = Date.now(),
      policy = (
        await db
          .prepare("SELECT policy_json FROM platform_plans WHERE id='free'")
          .first()
      ).policy_json
    await db
      .prepare('UPDATE platform_lifecycle_settings SET activated_at=?')
      .bind(now - 200 * DAY)
      .run()
    await db
      .prepare(
        "INSERT INTO platform_plans(id,name,policy_json) VALUES('pro','Pro',?),('trial','Trial',?)",
      )
      .bind(policy, policy)
      .run()
    for (let id = 1; id <= 4; id++) {
      await db
        .prepare(
          'INSERT INTO platform_users(id,email,created_at,last_login_at,email_verified) VALUES(?,?,?,?,1)',
        )
        .bind(id, `exempt${id}@example.com`, now - 100 * DAY, now - 100 * DAY)
        .run()
      await db
        .prepare(
          "INSERT INTO platform_workspaces(id,name,owner_user_id) VALUES(?,'Space',?)",
        )
        .bind(id, id)
        .run()
    }
    await db
      .prepare(
        "INSERT INTO platform_workspace_plans(workspace_id,plan_id,source,starts_at,expires_at) VALUES(1,'pro','activation',?,?),(2,'pro','manual',?,?),(3,'trial','promotion',?,?),(4,'free','default',?,NULL)",
      )
      .bind(
        now - DAY,
        now + DAY,
        now - 20 * DAY,
        now - DAY,
        now - DAY,
        now + DAY,
        now - 100 * DAY,
      )
      .run()
    assert.equal(await accountExemption(db, 1, DEFAULT_EXEMPTIONS, now), true)
    assert.equal(
      await accountExemption(db, 1, DEFAULT_EXEMPTIONS, now + DAY),
      false,
    )
    assert.equal(await accountExemption(db, 2, DEFAULT_EXEMPTIONS, now), false)
    assert.equal(await accountExemption(db, 3, DEFAULT_EXEMPTIONS, now), false)
    assert.equal(await accountExemption(db, 4, DEFAULT_EXEMPTIONS, now), false)
    const ever = validateExemptions({
      enabled: true,
      match: 'any',
      rules: [
        {
          kind: 'ever-subscribed',
          sources: ['manual', 'activation'],
          planIds: ['pro'],
        },
      ],
    })
    assert.equal(await accountExemption(db, 2, ever, now), true)
    // Prior snapshots survive replacement with the expiry default.
    await db
      .prepare(
        "INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) VALUES('history',2,'expired',?, ?,?)",
      )
      .bind(
        JSON.stringify({ plan_id: 'pro', source: 'manual' }),
        JSON.stringify({ planId: 'free', source: 'expired_default' }),
        now,
      )
      .run()
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='free',source='expired_default' WHERE workspace_id=2",
      )
      .run()
    assert.equal(await accountExemption(db, 2, ever, now), true)
    const all = validateExemptions({
      enabled: true,
      match: 'all',
      rules: [
        ...ever.rules,
        {
          kind: 'active-subscription',
          sources: ['activation'],
          planIds: ['pro'],
        },
      ],
    })
    assert.equal(await accountExemption(db, 1, all, now), true)
    assert.equal(await accountExemption(db, 2, all, now), false)
    const trial = validateExemptions({
      enabled: true,
      match: 'any',
      rules: [
        {
          kind: 'active-subscription',
          sources: ['promotion'],
          planIds: ['trial'],
        },
      ],
    })
    assert.equal(await accountExemption(db, 3, trial, now), true)
    await db
      .prepare("INSERT INTO platform_memberships VALUES(4,1,'member')")
      .run()
    assert.equal(await accountExemption(db, 4, DEFAULT_EXEMPTIONS, now), false)
    await scanAccounts(db, now)
    assert.equal(
      await db
        .prepare(
          'SELECT user_id FROM platform_account_deletions WHERE user_id=1',
        )
        .first(),
      null,
    )
    assert.ok(
      await db
        .prepare(
          'SELECT user_id FROM platform_account_deletions WHERE user_id=2',
        )
        .first(),
    )
    await scanAccounts(db, now + DAY)
    assert.equal(
      await db
        .prepare(
          'SELECT user_id FROM platform_account_deletions WHERE user_id=1',
        )
        .first(),
      null,
    )
    const transitioned = await db
      .prepare(
        'SELECT lifecycle_grace_until,lifecycle_was_exempt FROM platform_users WHERE id=1',
      )
      .first()
    assert.equal(transitioned.lifecycle_grace_until, now + 8 * DAY)
    assert.equal(transitioned.lifecycle_was_exempt, 0)
    assert.equal(
      await markAccount(
        db,
        1,
        'Manual removal bypasses automatic exemptions',
        'manual',
        4,
        now,
      ),
      true,
    )
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at,last_login_at,email_verified) VALUES(5,'concurrent@example.com',?,?,1)",
      )
      .bind(now - 100 * DAY, now - 100 * DAY)
      .run()
    await db
      .prepare(
        "INSERT INTO platform_workspaces(id,name,owner_user_id) VALUES(5,'Concurrent',5)",
      )
      .run()
    const raced = {
      prepare: db.prepare.bind(db),
      batch: async (statements: any[]) => {
        await db.batch([
          db
            .prepare(
              "INSERT INTO platform_workspace_plans(workspace_id,plan_id,source,starts_at,expires_at) VALUES(5,'pro','activation',?,?)",
            )
            .bind(now, now + DAY),
          db.prepare(
            'UPDATE platform_policy_epoch SET revision=revision+1 WHERE id=1',
          ),
        ])
        return db.batch(statements)
      },
    }
    assert.equal(
      await markAccount(
        raced as any,
        5,
        'Stale scan racing an upgrade',
        'inactive',
        null,
        now,
        { login: now - 100 * DAY, verified: 1, settingsRevision: 1 },
      ),
      false,
    )
    assert.equal(
      await db
        .prepare(
          'SELECT user_id FROM platform_account_deletions WHERE user_id=5',
        )
        .first(),
      null,
    )
    assert.throws(() =>
      validateExemptions({ enabled: true, match: 'any', rules: [] }),
    )
    assert.throws(() =>
      validateExemptions({
        enabled: true,
        match: 'any',
        rules: [
          { kind: 'ever-subscribed', sources: ['arbitrary'], planIds: [] },
        ],
      }),
    )
  } finally {
    await mf.dispose()
  }
})
test('Migration retains known sign-in timestamps and safely enrolls existing accounts with unknown history', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB'),
      now = Date.now()
    for (const name of (
      await readdir(
        new URL('../packages/platform/migrations/', import.meta.url),
      )
    )
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (name.startsWith('0020')) {
        await db
          .prepare(
            "INSERT INTO platform_users(id,email,created_at) VALUES(1,'unknown@example.com',?),(2,'known@example.com',?)",
          )
          .bind(now - 200 * DAY, now - 200 * DAY)
          .run()
        await db
          .prepare(
            "INSERT INTO platform_auth_sessions(token,user_id,created_at,updated_at,expires_at) VALUES('known',2,?,?,?)",
          )
          .bind(new Date(now - 20 * DAY).toISOString(), now, now + DAY)
          .run()
      }
      for (const sql of splitSqlQuery(
        (
          await readFile(
            new URL('../packages/platform/migrations/' + name, import.meta.url),
            'utf8',
          )
        ).replace(/^--.*$/gm, ''),
      ).filter((s) => s.trim()))
        await db.prepare(sql).run()
    }
    const known = await db
        .prepare('SELECT last_login_at FROM platform_users WHERE id=2')
        .first(),
      unknown = await db
        .prepare('SELECT last_login_at FROM platform_users WHERE id=1')
        .first()
    assert.ok(Math.abs(known.last_login_at - (now - 20 * DAY)) < 1000)
    assert.ok(
      unknown.last_login_at >= now - 1000 &&
        unknown.last_login_at <= Date.now(),
    )
  } finally {
    await mf.dispose()
  }
})
test('Malformed subscription history cannot starve scanning or independent lifecycle stages', async () => {
  const { lifecycleStages } =
    await import('../packages/platform/src/account-lifecycle.ts')
  const { mf, db } = await fixture()
  try {
    const now = Date.now(),
      exemptions = {
        enabled: true,
        match: 'any',
        rules: [{ kind: 'ever-subscribed', sources: ['manual'], planIds: [] }],
      }
    await db
      .prepare(
        'UPDATE platform_lifecycle_settings SET activated_at=?,exemptions_json=?',
      )
      .bind(now - 200 * DAY, JSON.stringify(exemptions))
      .run()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,email_verified,created_at,last_login_at) VALUES(1,'bad@example.com',1,?,?),(2,'good@example.com',1,?,?)",
      )
      .bind(now - 100 * DAY, now - 100 * DAY, now - 100 * DAY, now - 100 * DAY)
      .run()
    await db
      .prepare(
        "INSERT INTO platform_workspaces(id,name,owner_user_id) VALUES(1,'Bad history',1)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) VALUES('invalid',1,'assigned','not-json','null',?)",
      )
      .bind(now)
      .run()
    await scanAccounts(db, now, 1)
    assert.equal(
      (await db.prepare('SELECT value FROM platform_lifecycle_cursor').first())
        .value,
      1,
    )
    assert.ok(
      await db
        .prepare(
          "SELECT scope FROM platform_lifecycle_errors WHERE scope='scan-user:1'",
        )
        .first(),
    )
    await scanAccounts(db, now, 1)
    assert.ok(
      await db
        .prepare(
          'SELECT user_id FROM platform_account_deletions WHERE user_id=2',
        )
        .first(),
    )
    const ran: string[] = []
    await lifecycleStages(
      db,
      {
        scan: async () => {
          throw new Error('sensitive failure must not be logged')
        },
        mail: async () => {
          ran.push('mail')
        },
        purge: async () => {
          ran.push('purge')
        },
        outbox: async () => {
          ran.push('outbox')
        },
      },
      now,
    )
    assert.deepEqual(ran, ['mail', 'purge', 'outbox'])
    assert.equal(
      (
        await db
          .prepare(
            "SELECT error FROM platform_lifecycle_errors WHERE scope='scan'",
          )
          .first()
      ).error,
      'lifecycle_stage_failed',
    )
  } finally {
    await mf.dispose()
  }
})
test('Actual rolling session refresh records activity and prevents an active account from aging out', async () => {
  const { mf, db } = await fixture()
  try {
    const now = Date.now(),
      messages: string[] = [],
      portal = 'https://app.chronoframe.art'
    const auth = createAccountAuth(
      db,
      {
        portalOrigin: portal,
        secret:
          '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_',
        emailFrom: 'verify@noreply.chronoframe.art',
      },
      {
        send: async (m: any) => {
          messages.push(m.text)
          return { messageId: 'test' }
        },
      },
    )
    const call = (path: string, body?: any, cookie?: string) =>
      auth.handler(
        new Request(portal + '/api/auth' + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            origin: portal,
            'content-type': 'application/json',
            'cf-connecting-ip': '192.0.2.51',
            ...(cookie ? { cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
    assert.equal(
      (
        await call('/sign-up/email', {
          email: 'active@example.com',
          name: 'Active',
          password: 'Strong-example-password-123',
        })
      ).status,
      200,
    )
    const verified = await call('/email-otp/verify-email', {
      email: 'active@example.com',
      otp: messages.at(-1)!.match(/\b\d{6}\b/)![0],
    })
    assert.equal(verified.status, 200)
    const cookie = verified.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-chronoframe-auth='))!
      .split(';')[0]!
    const user = await db
      .prepare("SELECT id FROM platform_users WHERE email='active@example.com'")
      .first()
    await db
      .prepare('UPDATE platform_users SET last_login_at=? WHERE id=?')
      .bind(now - 100 * DAY, user.id)
      .run()
    await db
      .prepare(
        'UPDATE platform_auth_sessions SET updated_at=?,expires_at=? WHERE user_id=?',
      )
      .bind(
        new Date(now - 2 * DAY).toISOString(),
        new Date(now + 5 * DAY).toISOString(),
        user.id,
      )
      .run()
    const response = await call('/get-session', undefined, cookie)
    assert.equal(response.status, 200, await response.clone().text())
    assert.ok(
      (
        await db
          .prepare('SELECT last_login_at FROM platform_users WHERE id=?')
          .bind(user.id)
          .first()
      ).last_login_at >= now,
    )
    await db
      .prepare('UPDATE platform_lifecycle_settings SET activated_at=?')
      .bind(now - 200 * DAY)
      .run()
    await scanAccounts(db, now + 1000)
    assert.equal(
      await db
        .prepare(
          'SELECT user_id FROM platform_account_deletions WHERE user_id=?',
        )
        .bind(user.id)
        .first(),
      null,
    )
  } finally {
    await mf.dispose()
  }
})
test('Versioned S3 cleanup batches 1000 scoped versions and surfaces partial deletion errors', async () => {
  const { createCloudS3 } = await import('../packages/storage/src/s3-edge.ts')
  let remaining = true,
    batches = 0,
    fail = false
  const keys = Array.from({ length: 1000 }, (_, i) => `chronoframe/8/p${i}`)
  const s3 = createCloudS3(
    {
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'photos',
      accessKeyId: 'fake',
      secretAccessKey: 'fake',
    },
    {
      fetch: (async (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        )
        if (url.searchParams.has('versioning'))
          return new Response(
            '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
            { headers: { 'content-type': 'application/xml' } },
          )
        if (url.searchParams.has('versions')) {
          assert.equal(url.searchParams.get('max-keys'), '1000')
          return new Response(
            '<ListVersionsResult>' +
              (remaining
                ? keys
                    .map(
                      (k, i) =>
                        `<Version><Key>${k}</Key><VersionId>v${i}</VersionId></Version>`,
                    )
                    .join('')
                : '') +
              '<IsTruncated>false</IsTruncated></ListVersionsResult>',
            { headers: { 'content-type': 'application/xml' } },
          )
        }
        if (url.searchParams.has('delete')) {
          const body =
            input instanceof Request
              ? await input.clone().text()
              : await new Response(init?.body as BodyInit).text()
          assert.equal((body.match(/<Object>/g) ?? []).length, 1000)
          assert.equal((body.match(/<VersionId>/g) ?? []).length, 1000)
          assert.ok(body.includes('<Key>chronoframe/8/p999</Key>'))
          batches++
          remaining = false
          return new Response(
            fail
              ? '<DeleteResult><Error><Key>chronoframe/8/p0</Key><Code>AccessDenied</Code><Message>blocked</Message></Error></DeleteResult>'
              : '<DeleteResult/>',
            { headers: { 'content-type': 'application/xml' } },
          )
        }
        if (url.searchParams.has('uploads'))
          return new Response(
            '<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>',
            { headers: { 'content-type': 'application/xml' } },
          )
        return new Response(
          '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
          { headers: { 'content-type': 'application/xml' } },
        )
      }) as typeof fetch,
    },
  )
  assert.equal(await s3.purgeTenant(8), true)
  assert.equal(batches, 1)
  remaining = true
  fail = true
  await assert.rejects(s3.purgeTenant(8), /batch removal incomplete/)
})
test('Delivery attempts are reserved atomically, capped across worker crashes and counted on success', async () => {
  const { mf, db } = await fixture()
  try {
    const now = Date.now()
    for (let id = 1; id <= 4; id++)
      await db
        .prepare(
          'INSERT INTO platform_users(id,email,created_at,last_login_at,email_verified) VALUES(?,?,?,?,1)',
        )
        .bind(id, `budget${id}@example.com`, now, now)
        .run()
    await markAccount(
      db,
      1,
      'Concurrent delivery attempt budget',
      'manual',
      null,
      now,
    )
    let calls = 0
    const failure = {
      send: async () => {
        calls++
        throw new Error('failed')
      },
    }
    for (const delta of [0, 60000, 180000])
      await Promise.all(
        Array.from({ length: 4 }, () =>
          deliverLifecycleMail(
            db,
            failure,
            'https://app.chronoframe.art',
            now + delta,
          ),
        ),
      )
    assert.equal(calls, 3)
    assert.equal(
      (
        await db
          .prepare('SELECT state FROM platform_mail_outbox WHERE user_id=1')
          .first()
      ).state,
      'failed',
    )
    await markAccount(
      db,
      2,
      'Interrupted final delivery attempt',
      'manual',
      null,
      now,
    )
    await db
      .prepare(
        "UPDATE platform_mail_outbox SET attempts=3,lease_token='interrupted',lease_until=? WHERE user_id=2",
      )
      .bind(now + 120000)
      .run()
    await deliverLifecycleMail(
      db,
      failure,
      'https://app.chronoframe.art',
      now + 60000,
    )
    assert.equal(
      (
        await db
          .prepare('SELECT state FROM platform_mail_outbox WHERE user_id=2')
          .first()
      ).state,
      'pending',
    )
    await deliverLifecycleMail(
      db,
      failure,
      'https://app.chronoframe.art',
      now + 120001,
    )
    assert.equal(
      (
        await db
          .prepare('SELECT state FROM platform_mail_outbox WHERE user_id=2')
          .first()
      ).state,
      'failed',
    )
    assert.equal(calls, 3)
    await markAccount(
      db,
      3,
      'Successful final delivery attempt',
      'manual',
      null,
      now,
    )
    let successCalls = 0
    const eventually = {
      send: async () => {
        if (++successCalls < 3) throw new Error('failed')
        return { messageId: 'delivered' }
      },
    }
    for (const delta of [0, 60000, 180000])
      await deliverLifecycleMail(
        db,
        eventually,
        'https://app.chronoframe.art',
        now + delta,
      )
    assert.deepEqual(
      await db
        .prepare(
          'SELECT state,attempts FROM platform_mail_outbox WHERE user_id=3',
        )
        .first(),
      { state: 'sent', attempts: 3 },
    )
    await deliverLifecycleMail(
      db,
      eventually,
      'https://app.chronoframe.art',
      now + DAY,
    )
    assert.equal(successCalls, 3)
    await markAccount(
      db,
      4,
      'Stale concurrent worker respects backoff',
      'manual',
      null,
      now,
    )
    let reads = 0,
      claims = 0,
      raceCalls = 0
    let releaseReads!: () => void, releaseFailure!: () => void
    const bothRead = new Promise<void>((resolve) => {
        releaseReads = resolve
      }),
      firstFailed = new Promise<void>((resolve) => {
        releaseFailure = resolve
      })
    const wrap = (statement: any, sql: string): any => ({
      bind(...values: any[]) {
        return wrap(statement.bind(...values), sql)
      },
      async all() {
        const result = await statement.all()
        if (
          sql.startsWith(
            "SELECT * FROM platform_mail_outbox WHERE state='pending'",
          )
        ) {
          if (++reads === 2) releaseReads()
          await bothRead
        }
        return result
      },
      async first() {
        if (sql.includes('attempts=attempts+1') && ++claims === 2)
          await firstFailed
        return statement.first()
      },
      async run() {
        const result = await statement.run()
        if (sql.includes('SET state=?,available_at=?')) releaseFailure()
        return result
      },
    })
    const raced = {
      prepare: (sql: string) => wrap(db.prepare(sql), sql),
      batch: db.batch.bind(db),
    }
    const raceFailure = {
      send: async () => {
        raceCalls++
        throw new Error('failed')
      },
    }
    await Promise.all([
      deliverLifecycleMail(
        raced as any,
        raceFailure,
        'https://app.chronoframe.art',
        now,
      ),
      deliverLifecycleMail(
        raced as any,
        raceFailure,
        'https://app.chronoframe.art',
        now,
      ),
    ])
    assert.equal(raceCalls, 1)
    assert.deepEqual(
      await db
        .prepare(
          'SELECT attempts,available_at FROM platform_mail_outbox WHERE user_id=4',
        )
        .first(),
      { attempts: 1, available_at: now + 60000 },
    )
  } finally {
    await mf.dispose()
  }
})
test('Retry-budget migration preserves delivery history and terminates already-exhausted messages', async () => {
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
    for (const name of (
      await readdir(
        new URL('../packages/platform/migrations/', import.meta.url),
      )
    )
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (name.startsWith('0021')) {
        await db
          .prepare(
            "INSERT INTO platform_mail_outbox(id,user_id,kind,cycle,to_email,payload_json,available_at,attempts,state) VALUES('old-pending',1,'account-deleted','a','legacy@example.com','{}',0,5,'pending'),('old-sent',1,'account-deleted','b','legacy@example.com','{}',0,2,'sent'),('old-retry',1,'account-deleted','c','legacy@example.com','{}',0,2,'pending')",
          )
          .run()
        await db
          .prepare(
            "INSERT INTO platform_mail_outbox(id,user_id,kind,cycle,to_email,payload_json,available_at,attempts,state,lease_token,lease_until) VALUES('old-inflight',1,'account-deleted','d','legacy@example.com','{}',0,2,'pending','worker',9999999999999)",
          )
          .run()
      }
      for (const sql of splitSqlQuery(
        (
          await readFile(
            new URL('../packages/platform/migrations/' + name, import.meta.url),
            'utf8',
          )
        ).replace(/^--.*$/gm, ''),
      ).filter((s) => s.trim()))
        await db.prepare(sql).run()
    }
    assert.deepEqual(
      await db
        .prepare(
          "SELECT state,attempts,error FROM platform_mail_outbox WHERE id='old-pending'",
        )
        .first(),
      { state: 'failed', attempts: 5, error: 'email_delivery_exhausted' },
    )
    assert.deepEqual(
      await db
        .prepare(
          "SELECT state,attempts FROM platform_mail_outbox WHERE id='old-sent'",
        )
        .first(),
      { state: 'sent', attempts: 3 },
    )
    assert.deepEqual(
      await db
        .prepare(
          "SELECT state,attempts FROM platform_mail_outbox WHERE id='old-retry'",
        )
        .first(),
      { state: 'pending', attempts: 2 },
    )
    assert.deepEqual(
      await db
        .prepare(
          "SELECT state,attempts,lease_token FROM platform_mail_outbox WHERE id='old-inflight'",
        )
        .first(),
      { state: 'failed', attempts: 3, lease_token: null },
    )
  } finally {
    await mf.dispose()
  }
})

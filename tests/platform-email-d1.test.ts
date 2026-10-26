import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { createEmailCodeSignIn } from '../packages/core/src/email-auth.ts'
import { createPlatformAccess } from '../packages/core/src/platform.ts'
import {
  createD1Directory,
  createD1EmailCodeStore,
  createD1Sessions,
} from '../packages/platform/src/index.ts'
import type { PlatformD1, D1Statement } from '../packages/platform/src/index.ts'
import { createEmailCodeCrypto } from '../apps/shared/platform/crypto.ts'

/** Actual SQLite SQL/transactions behind the D1 statement API; no storage mock. */
async function database() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(
    await readFile(
      new URL(
        '../packages/platform/migrations/0001_platform.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  class Statement implements D1Statement {
    values: (string | number | null)[] = []
    readonly sql: string
    constructor(sql: string) {
      this.sql = sql
    }
    bind(...values: (string | number | null)[]) {
      this.values = values
      return this
    }
    async first<T>() {
      return (
        (sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null
      )
    }
    execute() {
      return {
        meta: { changes: sqlite.prepare(this.sql).run(...this.values).changes },
      }
    }
    async run() {
      return this.execute()
    }
  }
  const db: PlatformD1 = {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      return sqlite.transaction(() =>
        statements.map((s) => (s as Statement).execute()),
      )()
    },
  }
  return { sqlite, db }
}
const status = (n: number) => (e: unknown) =>
  (e as { statusCode?: number }).statusCode === n

test('D1 email SQL enforces cooldown, replacement, expiry, attempt limit and one-time concurrent consumption', async () => {
  const { sqlite, db } = await database()
  try {
    let now = 100_000
    let id = 0
    const sent: { email: string; code: string }[] = []
    const secure = await createEmailCodeCrypto(
      'this-test-secret-has-at-least-32-bytes',
    )
    const auth = createEmailCodeSignIn(
      createD1EmailCodeStore(db),
      {
        ...secure,
        randomId: () => `challenge-${++id}`,
        randomCode: () => '012345',
      },
      {
        async send(input) {
          sent.push(input)
        },
      },
      () => now,
    )
    const first = await auth.request(' User@Example.com ', 'client-one')
    assert.equal(sent[0]!.email, 'user@example.com')
    const rows = sqlite.prepare('SELECT * FROM platform_email_codes').all()
    assert.ok(!JSON.stringify(rows).includes('012345'))
    assert.ok(!JSON.stringify(rows).includes('user@example.com'))
    await assert.rejects(
      auth.request('user@example.com', 'client-one'),
      status(429),
    )
    now += 60_000
    const second = await auth.request('user@example.com', 'client-one')
    await assert.rejects(
      auth.verify('user@example.com', first.challengeId, '012345'),
      status(401),
    )
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        auth.verify('user@example.com', second.challengeId, '999999'),
        status(401),
      )
    await assert.rejects(
      auth.verify('user@example.com', second.challengeId, '012345'),
      status(401),
    )
    now += 60_000
    const third = await auth.request('user@example.com', 'client-one')
    const results = await Promise.allSettled([
      auth.verify('user@example.com', third.challengeId, '012345'),
      auth.verify('user@example.com', third.challengeId, '012345'),
    ])
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
    now += 60_000
    const fourth = await auth.request('user@example.com', 'client-one')
    now += 10 * 60_000
    await assert.rejects(
      auth.verify('user@example.com', fourth.challengeId, '012345'),
      status(401),
    )
  } finally {
    sqlite.close()
  }
})

test('email delivery failures preserve the rate ledger and reveal no provider error or code', async () => {
  const { sqlite, db } = await database()
  try {
    const secure = await createEmailCodeCrypto(
      'this-test-secret-has-at-least-32-bytes',
    )
    const auth = createEmailCodeSignIn(
      createD1EmailCodeStore(db),
      secure,
      {
        async send() {
          throw new Error('secret provider response')
        },
      },
      () => 100_000,
    )
    await assert.rejects(
      auth.request('user@example.com', 'one'),
      (error: unknown) => (error as Error).message === 'Sign-in unavailable',
    )
    await assert.rejects(auth.request('user@example.com', 'one'), status(429))
    assert.equal(
      (
        sqlite.prepare('SELECT active FROM platform_email_codes').get() as {
          active: number
        }
      ).active,
      0,
    )
  } finally {
    sqlite.close()
  }
})

test('D1 session creation preserves the email identity and revocation takes effect immediately', async () => {
  const { sqlite, db } = await database()
  try {
    const sessions = createD1Sessions(db)
    await sessions.create('user@example.com', 'first-token-mac', 100, 200)
    await sessions.create('user@example.com', 'second-token-mac', 100, 200)
    assert.equal(
      (
        sqlite.prepare('SELECT COUNT(*) AS n FROM platform_users').get() as {
          n: number
        }
      ).n,
      1,
    )
    assert.equal((await sessions.get('first-token-mac', 100))?.userId, 1)
    assert.equal(await sessions.get('first-token-mac', 200), null)
    await sessions.revoke('second-token-mac')
    assert.equal(await sessions.get('second-token-mac', 100), null)
  } finally {
    sqlite.close()
  }
})

test('D1 directory never maps unverified/inactive domains or unrelated Workspace memberships', async () => {
  const { sqlite, db } = await database()
  try {
    sqlite.exec(`INSERT INTO platform_users VALUES(1,'user@example.com',0);
      INSERT INTO platform_workspaces VALUES(10,'one'),(20,'two');
      INSERT INTO platform_sites VALUES(1,10,'one',1),(2,20,'two',1);
      INSERT INTO platform_memberships VALUES(1,10,'admin');
      INSERT INTO platform_domains VALUES('one.example.com',1,1,1),('two.example.com',2,0,1),('inactive.example.com',1,1,0);`)
    for (const migration of [
      '0002_visitor_access.sql',
      '0003_account_security.sql',
      '0004_workspace_sites.sql',
      '0013_custom_domains.sql',
    ])
      sqlite.exec(
        await readFile(
          new URL(
            '../packages/platform/migrations/' + migration,
            import.meta.url,
          ),
          'utf8',
        ),
      )
    sqlite.exec(
      'ALTER TABLE platform_sites ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0',
    )
    sqlite.exec(
      'CREATE TABLE platform_account_controls(user_id INTEGER,suspended INTEGER)',
    )
    const access = createPlatformAccess(createD1Directory(db), () => 100)
    const session = { userId: 1, expiresAt: 200 }
    assert.equal((await access.authorizeSite(session, 1, 'manage')).site.id, 1)
    await assert.rejects(access.authorizeSite(session, 2, 'read'), status(404))
    assert.equal((await access.resolvePublicSite('one.example.com')).site.id, 1)
    await assert.rejects(
      access.resolvePublicSite('two.example.com'),
      status(404),
    )
    await assert.rejects(
      access.resolvePublicSite('inactive.example.com'),
      status(404),
    )
    sqlite.exec('DELETE FROM platform_memberships')
    await assert.rejects(access.authorizeSite(session, 1, 'read'), status(404))
  } finally {
    sqlite.close()
  }
})

test('Web Crypto MACs separate challenge, email, session and environment and generate six-digit codes', async () => {
  const one = await createEmailCodeCrypto(
    'this-test-secret-has-at-least-32-bytes',
  )
  const two = await createEmailCodeCrypto(
    'another-test-secret-has-at-least-32-bytes',
  )
  assert.notEqual(await one.mac(['a', 'bc']), await one.mac(['ab', 'c']))
  assert.notEqual(
    await one.mac(['email-code', 'id', 'user@example.com', '012345']),
    await two.mac(['email-code', 'id', 'user@example.com', '012345']),
  )
  assert.notEqual(
    await one.mac(['platform-session', 'token']),
    await one.mac(['email-code', 'token']),
  )
  for (let i = 0; i < 100; i++) assert.match(one.randomCode(), /^[0-9]{6}$/)
  await assert.rejects(createEmailCodeCrypto('short'))
})

test('actual workerd D1 serializes reservations and one-time verification', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const wranglerRequire = createRequire(
    require.resolve('wrangler/package.json'),
  )
  const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      compatibilityDate: '2026-10-22',
      d1Databases: { DB: 'platform-test' },
    }),
  )
  try {
    const db: PlatformD1 = await mf.getD1Database('DB')
    const migration = await readFile(
      new URL(
        '../packages/platform/migrations/0001_platform.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await db.batch(
      migration
        .split(';')
        .map((sql) => sql.trim())
        .filter(Boolean)
        .map((sql) => db.prepare(sql)),
    )
    const secure = await createEmailCodeCrypto(
      'this-test-secret-has-at-least-32-bytes',
    )
    let now = 100_000
    let sent = 0
    const service = createEmailCodeSignIn(
      createD1EmailCodeStore(db),
      { ...secure, randomCode: () => '012345' },
      {
        async send() {
          sent++
        },
      },
      () => now,
    )
    const reservations = await Promise.allSettled([
      service.request('user@example.com', 'same-client'),
      service.request('user@example.com', 'same-client'),
    ])
    assert.equal(sent, 1)
    const accepted = reservations.find(
      (x) => x.status === 'fulfilled',
    ) as PromiseFulfilledResult<{ challengeId: string }>
    assert.ok(accepted)
    const verified = await Promise.allSettled([
      service.verify('user@example.com', accepted.value.challengeId, '012345'),
      service.verify('user@example.com', accepted.value.challengeId, '012345'),
    ])
    assert.equal(verified.filter((x) => x.status === 'fulfilled').length, 1)
    now += 60_000
    const next = await service.request('user@example.com', 'same-client')
    assert.ok(next.challengeId)
    const sessions = createD1Sessions(db)
    await sessions.create('user@example.com', 'session-mac', now, now + 1000)
    assert.equal((await sessions.get('session-mac', now))?.userId, 1)
    await sessions.revoke('session-mac')
    assert.equal(await sessions.get('session-mac', now), null)
  } finally {
    await mf.dispose()
  }
})

test('email and client hourly limits are enforced across distinct challenges', async () => {
  const { sqlite, db } = await database()
  try {
    let now = 100_000
    let sent = 0
    const secure = await createEmailCodeCrypto(
      'this-test-secret-has-at-least-32-bytes',
    )
    const auth = createEmailCodeSignIn(
      createD1EmailCodeStore(db),
      secure,
      {
        async send() {
          sent++
        },
      },
      () => now,
    )
    for (let i = 0; i < 10; i++) {
      await auth.request('limited@example.com', 'email-client')
      now += 60_000
    }
    await assert.rejects(
      auth.request('limited@example.com', 'different-client'),
      status(429),
    )
    for (let i = 0; i < 30; i++)
      await auth.request(`user${i}@example.com`, 'client-limit')
    await assert.rejects(
      auth.request('another@example.com', 'client-limit'),
      status(429),
    )
    assert.equal(sent, 40)
    for (const email of [
      'bad\n@example.com',
      'a..b@example.com',
      'user@localhost',
      '.user@example.com',
    ]) {
      await assert.rejects(auth.request(email, 'client'), status(400))
    }
    assert.equal(sent, 40)
  } finally {
    sqlite.close()
  }
})

test('D1 Site catalog lists only current memberships, including unpublished owned sites', async () => {
  const { createD1SiteCatalog } =
    await import('../packages/platform/src/index.ts')
  const { sqlite, db } = await database()
  try {
    sqlite.exec(`INSERT INTO platform_users VALUES(1,'one@example.com',1),(2,'two@example.com',1);
      INSERT INTO platform_workspaces VALUES(1,'one'),(2,'two');
      INSERT INTO platform_sites VALUES(1,1,'one-public',1),(2,2,'two-private',0),(3,1,'one-draft',0);
      INSERT INTO platform_memberships VALUES(1,1,'admin'),(2,2,'member');`)
    sqlite.exec(
      "ALTER TABLE platform_sites ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;ALTER TABLE platform_sites ADD COLUMN suspension_reason TEXT NOT NULL DEFAULT '';",
    )
    assert.deepEqual(
      (await createD1SiteCatalog(db).list(1)).map((s) => s.siteId),
      [1, 3],
    )
    assert.deepEqual(
      (await createD1SiteCatalog(db).list(2)).map((s) => s.siteId),
      [2],
    )
    sqlite.exec('DELETE FROM platform_memberships WHERE user_id = 1')
    assert.deepEqual(await createD1SiteCatalog(db).list(1), [])
  } finally {
    sqlite.close()
  }
})

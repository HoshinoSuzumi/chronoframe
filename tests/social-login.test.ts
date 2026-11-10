import {
  accountConnections,
  unlinkLoginAccount,
} from '../packages/platform/src/account-connections.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { splitSqlQuery } from './helpers/sql.ts'
import { createAccountAuth } from '../apps/cloud/server/utils/account-auth.ts'
import { accountRouteAllowed } from '../apps/cloud/server/utils/account-routes.ts'
import { socialLoginCipher } from '../packages/contracts/src/social-login.ts'
import {
  socialLoginProviders,
  socialLoginSettings,
  saveSocialLoginProvider,
} from '../packages/platform/src/social-login.ts'
import { parseAccountProfile } from '../packages/contracts/src/account-profile.ts'
type TestEvent = { path: string; origin?: string; raw?: string }
type TestError = { statusMessage?: string; statusCode?: number }
type TestSession = {
  user: { id: string; email: string; emailVerified: boolean }
} | null
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

test('OAuth callbacks expose only the supported provider surface', () => {
  for (const provider of ['github', 'google', 'discord']) {
    assert(accountRouteAllowed(`/api/auth/callback/${provider}`, 'GET'))
    assert(accountRouteAllowed(`/api/auth/callback/${provider}`, 'POST'))
    assert(!accountRouteAllowed(`/api/auth/callback/${provider}`, 'DELETE'))
  }
  assert(accountRouteAllowed('/api/auth/sign-in/social', 'POST'))
  assert(accountRouteAllowed('/api/auth/link-social', 'POST'))
  assert(!accountRouteAllowed('/api/auth/link-social', 'GET'))
  for (const path of [
    '/api/auth/callback/unknown',
    '/api/auth/callback/microsoft',
    '/api/auth/callback/github/extra',
    '/api/auth/update-user',
    '/api/auth/get-access-token',
  ])
    assert(!accountRouteAllowed(path, 'POST'))
})

test('profile updates accept bounded nicknames/images and reject identity changes and active content', () => {
  assert.deepEqual(parseAccountProfile({ name: '  New name  ', image: null }), {
    name: 'New name',
    image: null,
  })
  assert.equal(
    parseAccountProfile({
      name: 'Name',
      image: 'https://avatars.githubusercontent.com/u/123',
    }).image,
    'https://avatars.githubusercontent.com/u/123',
  )
  for (const profile of [
    { name: '', image: null },
    { name: 'x'.repeat(81), image: null },
    { name: 'ok', image: 'javascript:alert(1)' },
    { name: 'ok', image: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { name: 'ok', image: 'data:image/png;base64,bm90LWFuLWltYWdl' },
    { name: 'ok', image: 'https://user:password@example.com/a' },
    { name: 'ok', image: null, userId: 2 },
    { name: 'ok', image: null, email: 'other@example.com' },
  ])
    assert.throws(() => parseAccountProfile(profile))
})

test('credentials are root-only, encrypted, redacted, revision fenced and disabled immediately on removal; OAuth preserves identities and MFA', async () => {
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
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(
        new URL('../packages/platform/migrations/' + file, import.meta.url),
        'utf8',
      )
      for (const statement of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run()
    }
    await db
      .prepare(
        'CREATE TABLE platform_admin_roles(user_id INTEGER PRIMARY KEY,role TEXT)',
      )
      .run()
    await db
      .prepare(
        'CREATE TABLE platform_admin_audit(id TEXT PRIMARY KEY,actor_id INTEGER,action TEXT,target TEXT,reason TEXT,before_json TEXT,after_json TEXT,created_at INTEGER)',
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,name,email_verified,two_factor_enabled,created_at) VALUES(42,'existing@example.com','Existing',1,0,1),(43,'mfa@example.com','MFA',1,1,1)",
      )
      .run()
    await db.prepare("INSERT INTO platform_admin_roles VALUES(42,'root')").run()
    await db
      .prepare(
        "INSERT INTO platform_two_factors(user_id,secret,backup_codes,verified) VALUES(43,'test','[]',1)",
      )
      .run()
    const secret = crypto.randomUUID() + crypto.randomUUID(),
      actor = { userId: 42, role: 'root' }
    const input = {
      provider: 'github',
      revision: 0,
      operation: 'save',
      clientId: 'client-test',
      clientSecret: 'secret-test',
      reason: 'Enable GitHub login',
    }
    assert.deepEqual(await socialLoginProviders(db, secret), {})
    await assert.rejects(
      saveSocialLoginProvider(db, secret, { ...actor, role: 'admin' }, input),
      { status: 403 },
    )
    await assert.rejects(
      saveSocialLoginProvider(db, secret, actor, {
        ...input,
        clientSecret: '',
      }),
      { status: 400 },
    )
    const settings = await saveSocialLoginProvider(db, secret, actor, input)
    assert(!JSON.stringify(settings).includes('secret-test'))
    assert.equal(settings.find((p) => p.id === 'github')?.configured, true)
    const row = await db
      .prepare(
        "SELECT * FROM platform_social_login_providers WHERE provider='github'",
      )
      .first()
    assert(!row.credentials_ciphertext.includes('secret-test'))
    const cipher = await socialLoginCipher(secret)
    await assert.rejects(cipher.open(row.credentials_ciphertext, 'google:1'))
    await assert.rejects(cipher.open(row.credentials_ciphertext, 'github:2'))
    assert.equal(
      (await socialLoginProviders(db, secret)).github?.clientSecret,
      'secret-test',
    )
    await assert.rejects(saveSocialLoginProvider(db, secret, actor, input), {
      status: 409,
    })
    await saveSocialLoginProvider(db, secret, actor, {
      ...input,
      revision: 1,
      clientId: ' client-test ',
      clientSecret: '',
    })
    // Wrong/malformed application IDs are rejected before opening an unreadable secret.
    for (const clientId of ['another-client', null]) {
      await assert.rejects(
        saveSocialLoginProvider(db, 'wrong-key'.repeat(5), actor, {
          ...input,
          revision: 2,
          clientId,
          clientSecret: '',
        }),
        {
          status: 400,
          message: 'Provide a new secret when changing the client ID',
        },
      )
    }
    await assert.rejects(
      saveSocialLoginProvider(db, 'wrong-key'.repeat(5), actor, {
        ...input,
        revision: 2,
        clientSecret: '',
      }),
      {
        status: 400,
        message: 'Stored secret is unreadable; provide a new secret',
      },
    )
    const beforeFailure = await db
      .prepare(
        "SELECT revision,credentials_ciphertext FROM platform_social_login_providers WHERE provider='github'",
      )
      .first()
    assert.equal(beforeFailure.revision, 2)
    for (const key of ['', 'short'])
      await assert.rejects(
        saveSocialLoginProvider(db, key, actor, {
          ...input,
          revision: 2,
          clientSecret: '',
        }),
        {
          status: 400,
          message: 'Stored secret is unreadable; provide a new secret',
        },
      )
    await db
      .prepare(
        "UPDATE platform_social_login_providers SET credentials_ciphertext='corrupt' WHERE provider='github'",
      )
      .run()
    await assert.rejects(
      saveSocialLoginProvider(db, secret, actor, {
        ...input,
        revision: 2,
        clientSecret: '',
      }),
      {
        status: 400,
        message: 'Stored secret is unreadable; provide a new secret',
      },
    )
    await db
      .prepare(
        "UPDATE platform_social_login_providers SET credentials_ciphertext=? WHERE provider='github'",
      )
      .bind(beforeFailure.credentials_ciphertext)
      .run()
    assert.equal(
      (await cipher.open(beforeFailure.credentials_ciphertext, 'github:2'))
        .clientSecret,
      'secret-test',
    )
    // Unsupported providers cannot be configured, even by root.
    await assert.rejects(
      saveSocialLoginProvider(db, secret, actor, {
        ...input,
        provider: 'microsoft',
      }),
      { status: 400 },
    )
    const audit = await db
      .prepare(
        "SELECT json_group_array(json_object('before',before_json,'after',after_json)) AS rows FROM platform_admin_audit",
      )
      .first()
    assert(!audit.rows.includes('secret-test'))
    assert(!audit.rows.includes('client-test'))
    assert.deepEqual(await socialLoginProviders(db, 'wrong-key'.repeat(5)), {})

    const ts = require('typescript')
    const source = (
      await readFile(
        new URL(
          '../apps/cloud/server/api/account/profile.put.ts',
          import.meta.url,
        ),
        'utf8',
      )
    ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const deps = {
      definePlatformHandler: (f: unknown) => f,
      setResponseHeader: () => {},
      useRuntimeConfig: () => ({
        platform: { portalOrigin: 'https://app.chronoframe.art' },
      }),
      platformPortalOrigin: () => {},
      requirePlatformSession: async () => ({ userId: 42 }),
      platformDatabase: () => db,
      siteManagementBody: async (event: { body: unknown }) => event.body,
      parseAccountProfile,
      createError: (value: TestError) =>
        Object.assign(new Error(value.statusMessage), value),
    }
    const profileHandler = new Function(
      'exports',
      ...Object.keys(deps),
      code + ';return exports.default',
    )({}, ...Object.values(deps))
    const profile = await profileHandler({
      body: {
        name: 'Updated nickname',
        image: 'https://example.com/avatar.png',
      },
    })
    assert.equal(profile.user.id, 42)
    assert.equal(profile.user.name, 'Updated nickname')
    assert.equal(
      (await db.prepare('SELECT name FROM platform_users WHERE id=43').first())
        .name,
      'MFA',
    )
    await assert.rejects(
      profileHandler({ body: { name: 'Intruder', image: null, userId: 43 } }),
      { statusCode: 400 },
    )
    const providers = await socialLoginProviders(db, secret)
    const auth = createAccountAuth(
      db,
      {
        portalOrigin: 'https://app.chronoframe.art',
        secret,
        emailFrom: 'test@example.com',
        socialProviders: {
          github: { ...providers.github!, requireEmailVerification: true },
        },
      },
      { send: async () => ({ messageId: 'test' }) },
    )
    let email = 'existing@example.com',
      githubId = 101,
      githubLogin = 'test-user',
      verified = true
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url === 'https://github.com/login/oauth/access_token')
        return Response.json({
          access_token: 'oauth-token',
          token_type: 'bearer',
          scope: 'read:user,user:email',
        })
      if (url === 'https://api.github.com/user')
        return Response.json({
          id: githubId,
          login: githubLogin,
          name: 'OAuth name',
          email,
          avatar_url: 'https://example.com/avatar.png',
        })
      if (url === 'https://api.github.com/user/emails')
        return Response.json([{ email, verified, primary: true }])
      return originalFetch(input, init)
    }
    try {
      let attempt = 0
      let loginCookies = new Map<string, string>()
      async function login(expectedRedirect: string) {
        const ip = `192.0.2.${++attempt}`
        const cookies = new Map<string, string>()
        const capture = (response: Response) => {
          for (const cookie of response.headers.getSetCookie()) {
            const pair = cookie.split(';')[0]!,
              i = pair.indexOf('=')
            cookies.set(pair.slice(0, i), pair.slice(i + 1))
          }
        }
        const headers = () => ({
          'content-type': 'application/json',
          origin: 'https://app.chronoframe.art',
          'cf-connecting-ip': ip,
          cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        })
        const start = await auth.handler(
          new Request('https://app.chronoframe.art/api/auth/sign-in/social', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({
              provider: 'github',
              callbackURL: 'https://app.chronoframe.art/workspace',
              errorCallbackURL:
                'https://app.chronoframe.art/signin?oauthError=1',
            }),
          }),
        )
        assert.equal(start.status, 200)
        capture(start)
        const { url } = (await start.json()) as { url: string }
        const state = new URL(url).searchParams.get('state')!
        assert(state)
        assert.equal(
          new URL(url).searchParams.get('redirect_uri'),
          'https://app.chronoframe.art/api/auth/callback/github',
        )
        const callback = await auth.handler(
          new Request(
            `https://app.chronoframe.art/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state)}`,
            { headers: headers() },
          ),
        )
        capture(callback)
        if (expectedRedirect.includes('second=')) {
          assert(
            [...cookies].some(
              ([key, value]) => key.endsWith('.two_factor') && !!value,
            ),
            'MFA challenge cookie must survive the redirect',
          )
          const otp = await auth.handler(
            new Request(
              'https://app.chronoframe.art/api/auth/two-factor/send-otp',
              { method: 'POST', headers: headers(), body: '{}' },
            ),
          )
          assert.equal(otp.status, 403)
          assert.equal(
            ((await otp.json()) as { code: string }).code,
            'AUTHENTICATOR_REQUIRED',
          )
        }
        assert.equal(callback.status, 302)
        assert(
          callback.headers.get('location')?.includes(expectedRedirect),
          callback.headers.get('location') || (await callback.text()),
        )
        const session = await auth.handler(
          new Request('https://app.chronoframe.art/api/auth/get-session', {
            headers: headers(),
          }),
        )
        loginCookies = cookies
        return (await session.json()) as TestSession
      }
      const session = await login('/workspace')
      assert(session)
      assert.equal(Number(session.user.id), 42)
      assert.equal(
        (
          await db
            .prepare(
              "SELECT user_id FROM platform_accounts WHERE provider_id='github' AND account_id='101'",
            )
            .first()
        ).user_id,
        42,
      )
      const token = await db
        .prepare(
          "SELECT access_token FROM platform_accounts WHERE provider_id='github'",
        )
        .first()
      assert.notEqual(token.access_token, 'oauth-token')

      const captureConnectionCookies = (response: Response) => {
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0]!,
            index = pair.indexOf('=')
          loginCookies.set(pair.slice(0, index), pair.slice(index + 1))
        }
      }
      const connectionHeaders = () => ({
        'content-type': 'application/json',
        origin: 'https://app.chronoframe.art',
        'cf-connecting-ip': `192.0.2.${++attempt}`,
        cookie: [...loginCookies].map(([k, v]) => `${k}=${v}`).join('; '),
      })
      assert.equal(
        (
          await auth.handler(
            new Request('https://app.chronoframe.art/api/auth/link-social', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                origin: 'https://app.chronoframe.art',
              },
              body: JSON.stringify({
                provider: 'github',
                callbackURL:
                  'https://app.chronoframe.art/account?connection=updated',
              }),
            }),
          )
        ).status,
        401,
      )
      async function connect(expected: string) {
        const response = await auth.handler(
          new Request('https://app.chronoframe.art/api/auth/link-social', {
            method: 'POST',
            headers: connectionHeaders(),
            body: JSON.stringify({
              provider: 'github',
              callbackURL:
                'https://app.chronoframe.art/account?connection=updated',
            }),
          }),
        )
        assert.equal(response.status, 200)
        captureConnectionCookies(response)
        const url = new URL(((await response.json()) as { url: string }).url)
        const result = await auth.handler(
          new Request(
            `https://app.chronoframe.art/api/auth/callback/github?code=link-code&state=${encodeURIComponent(url.searchParams.get('state')!)}`,
            { headers: connectionHeaders() },
          ),
        )
        captureConnectionCookies(result)
        assert.equal(result.status, 302)
        assert(
          result.headers.get('location')?.includes(expected),
          result.headers.get('location') ?? '',
        )
      }
      githubId = 201
      await connect('connection=updated')
      const linked = await db
        .prepare(
          "SELECT id,user_id FROM platform_accounts WHERE provider_id='github' AND account_id='201'",
        )
        .first()
      assert.equal(linked.user_id, 42)
      assert.equal(
        (
          await db
            .prepare('SELECT name FROM platform_users WHERE id=42')
            .first()
        ).name,
        'Updated nickname',
      )
      const listing = await accountConnections(db, secret, 42)
      assert.equal(listing.providers.length, 1)
      assert.equal(listing.providers[0]?.id, 'github')
      assert.equal(
        listing.accounts.find((account) => account.id === String(linked.id))
          ?.username,
        'test-user',
      )
      githubLogin = 'renamed-user'
      await connect('connection=updated')
      assert.equal(
        (await accountConnections(db, secret, 42)).accounts.find(
          (account) => account.id === String(linked.id),
        )?.username,
        'renamed-user',
      )
      assert.equal(
        (
          await db
            .prepare('SELECT name FROM platform_users WHERE id=42')
            .first()
        ).name,
        'Updated nickname',
      )
      assert(!JSON.stringify(listing).includes('oauth-token'))
      assert.equal(
        (await accountConnections(db, secret, 43)).accounts.length,
        0,
      )
      assert.equal(
        await unlinkLoginAccount(db, secret, 43, String(linked.id)),
        false,
      )
      assert.equal(
        await unlinkLoginAccount(db, secret, 42, String(linked.id)),
        true,
      )
      assert.equal(
        await unlinkLoginAccount(
          db,
          secret,
          42,
          String(
            (
              await db
                .prepare(
                  "SELECT id FROM platform_accounts WHERE provider_id='github' AND account_id='101'",
                )
                .first()
            ).id,
          ),
        ),
        false,
      )
      githubId = 202
      email = 'different@example.com'
      await connect('connection=updated')
      assert.equal(
        (
          await db
            .prepare(
              "SELECT user_id FROM platform_accounts WHERE account_id='202' AND provider_id='github'",
            )
            .first()
        ).user_id,
        42,
      )
      assert.equal(
        (
          await db
            .prepare('SELECT email FROM platform_users WHERE id=42')
            .first()
        ).email,
        'existing@example.com',
      )
      assert.equal(
        await db
          .prepare(
            "SELECT id FROM platform_users WHERE email='different@example.com'",
          )
          .first(),
        null,
      )
      const alternateEmailSession = await login('/workspace')
      assert(alternateEmailSession)
      assert.equal(Number(alternateEmailSession.user.id), 42)
      assert.equal(alternateEmailSession.user.email, 'existing@example.com')
      // A verified third-party account owned by someone else cannot be reassigned.
      await db
        .prepare(
          "INSERT INTO platform_accounts(account_id,provider_id,user_id,created_at,updated_at) VALUES('204','github',43,1,1)",
        )
        .run()
      githubId = 204
      await connect('connection=failed')
      assert.equal(
        (
          await db
            .prepare(
              "SELECT user_id FROM platform_accounts WHERE account_id='204' AND provider_id='github'",
            )
            .first()
        ).user_id,
        43,
      )
      githubId = 203
      email = 'existing@example.com'
      verified = false
      await connect('connection=failed')
      assert.equal(
        await db
          .prepare(
            "SELECT id FROM platform_accounts WHERE account_id='203' AND provider_id='github'",
          )
          .first(),
        null,
      )
      verified = true
      email = 'mfa@example.com'
      githubId = 102
      const pending = await login('second=totp')
      assert.equal(
        pending,
        null,
        'OAuth must not leave an authenticated session before MFA',
      )
      email = 'new@example.com'
      githubId = 103
      const newUser = await login('/workspace')
      assert(newUser)
      assert(newUser.user.emailVerified)
      assert(
        await db
          .prepare('SELECT id FROM platform_workspaces WHERE owner_user_id=?')
          .bind(Number(newUser.user.id))
          .first(),
      )
      email = 'unverified@example.com'
      githubId = 104
      verified = false
      assert.equal(await login('oauthError=1'), null)
    } finally {
      globalThis.fetch = originalFetch
    }
    // Simultaneous disconnects cannot remove both available login methods.
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,name,email_verified,created_at) VALUES(900,'concurrent@example.com','Concurrent',1,1)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_accounts(account_id,provider_id,user_id,created_at,updated_at) VALUES('900','github',900,1,1),('900','google',900,1,1)",
      )
      .run()
    await db
      .prepare(
        "UPDATE platform_social_login_providers SET client_id='google-test',credentials_ciphertext=?,revision=1 WHERE provider='google'",
      )
      .bind(
        await cipher.seal(
          { clientId: 'google-test', clientSecret: 'test-google-secret' },
          'google:1',
        ),
      )
      .run()
    const concurrent = JSON.parse(
      (
        await db
          .prepare(
            'SELECT json_group_array(id) AS ids FROM platform_accounts WHERE user_id=900',
          )
          .first()
      ).ids,
    ) as number[]
    const results = await Promise.all(
      concurrent.map((id) => unlinkLoginAccount(db, secret, 900, String(id))),
    )
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS count FROM platform_accounts WHERE user_id=900',
          )
          .first()
      ).count,
      1,
    )
    await db
      .prepare(
        "UPDATE platform_social_login_providers SET client_id='',credentials_ciphertext='' WHERE provider='google'",
      )
      .run()
    await saveSocialLoginProvider(db, secret, actor, {
      ...input,
      revision: 2,
      operation: 'remove',
    })
    assert.deepEqual(await socialLoginProviders(db, secret), {})
    assert(
      !(await socialLoginSettings(db)).find((p) => p.id === 'github')
        ?.configured,
    )
    await db
      .prepare("UPDATE platform_admin_roles SET role='admin' WHERE user_id=42")
      .run()
    await assert.rejects(
      saveSocialLoginProvider(db, secret, actor, { ...input, revision: 3 }),
      { status: 409 },
    )
    assert.deepEqual(await socialLoginProviders(db, secret), {})
  } finally {
    await mf.dispose()
  }
})

test('auth forwarding checks web origins and rejects ID-token entry while accepting state-validated OAuth callback transport', async () => {
  const ts = require('typescript')
  const source = (
    await readFile(
      new URL('../apps/cloud/server/utils/account-handler.ts', import.meta.url),
      'utf8',
    )
  ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  let calls = 0
  let authenticated = false
  const deps = {
    useRuntimeConfig: () => ({
      platform: { portalOrigin: 'https://app.chronoframe.art' },
    }),
    getRequestURL: (e: TestEvent) =>
      new URL(e.path, 'https://app.chronoframe.art'),
    platformRequestURL: () => new URL('https://app.chronoframe.art'),
    platformPortalOrigin: (
      e: TestEvent,
      _origin: string,
      required: boolean,
    ) => {
      if (required && e.origin !== 'https://app.chronoframe.art')
        throw Object.assign(new Error('Origin'), { statusCode: 403 })
    },
    requirePlatformSession: async () => {
      if (!authenticated)
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
      return { userId: 42 }
    },
    accountRouteAllowed,
    socialLoginCallback: (path: string) =>
      /^\/api\/auth\/callback\/(github|google|discord)$/.test(path),
    isSocialLoginProvider: (id: string) =>
      ['github', 'google', 'discord'].includes(id),
    getHeader: () => undefined,
    readRawBody: async (e: TestEvent) => e.raw,
    getRequestHeaders: () => ({}),
    cloudAccount: async () => ({
      handler: async () => {
        calls++
        return new Response('ok')
      },
    }),
    sendWebResponse: (_e: TestEvent, r: Response) => r,
    createError: (v: TestError) => Object.assign(new Error(v.statusMessage), v),
  }
  const { forwardAccountRequest } = new Function(
    'exports',
    ...Object.keys(deps),
    code + ';return exports',
  )({}, ...Object.values(deps))
  const event = {
    method: 'POST',
    path: '/api/auth/sign-in/social',
    origin: 'https://app.chronoframe.art',
    raw: JSON.stringify({ provider: 'github' }),
  }
  await assert.rejects(
    forwardAccountRequest({ ...event, origin: 'https://evil.example.com' }),
    { statusCode: 403 },
  )
  await assert.rejects(
    forwardAccountRequest({
      ...event,
      raw: JSON.stringify({
        provider: 'google',
        idToken: { token: 'unwanted-entry' },
      }),
    }),
    { statusCode: 400 },
  )
  await assert.rejects(
    forwardAccountRequest({
      ...event,
      raw: JSON.stringify({ provider: 'unknown' }),
    }),
    { statusCode: 400 },
  )
  await assert.rejects(
    forwardAccountRequest({ ...event, path: '/api/auth/link-social' }),
    { statusCode: 401 },
  )
  assert.equal(calls, 0)
  authenticated = true
  assert.equal(
    (await forwardAccountRequest({ ...event, path: '/api/auth/link-social' }))
      .status,
    200,
  )
  assert.equal((await forwardAccountRequest(event)).status, 200)
  assert.equal(
    (
      await forwardAccountRequest({
        ...event,
        path: '/api/auth/callback/github',
        origin: undefined,
        raw: '{"code":"test","state":"test"}',
      })
    ).status,
    200,
  )
  await assert.rejects(
    forwardAccountRequest({ ...event, path: '/api/auth/callback/unknown' }),
    { statusCode: 404 },
  )
})

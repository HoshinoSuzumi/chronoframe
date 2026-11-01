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
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

test('OAuth callbacks expose only the supported provider surface', () => {
  for (const provider of ['github', 'google', 'microsoft', 'discord']) {
    assert(accountRouteAllowed(`/api/auth/callback/${provider}`, 'GET'))
    assert(accountRouteAllowed(`/api/auth/callback/${provider}`, 'POST'))
    assert(!accountRouteAllowed(`/api/auth/callback/${provider}`, 'DELETE'))
  }
  assert(accountRouteAllowed('/api/auth/sign-in/social', 'POST'))
  for (const path of [
    '/api/auth/callback/unknown',
    '/api/auth/callback/github/extra',
    '/api/auth/update-user',
    '/api/auth/link-social',
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
      clientSecret: '',
    })
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
      siteManagementBody: async (event: any) => event.body,
      parseAccountProfile,
      createError: (value: any) =>
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
          login: 'test-user',
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
        return (await session.json()) as any
      }
      const session = await login('/workspace')
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
  const deps = {
    useRuntimeConfig: () => ({
      platform: { portalOrigin: 'https://app.chronoframe.art' },
    }),
    getRequestURL: (e: any) => new URL(e.path, 'https://app.chronoframe.art'),
    platformRequestURL: () => new URL('https://app.chronoframe.art'),
    platformPortalOrigin: (e: any, _origin: string, required: boolean) => {
      if (required && e.origin !== 'https://app.chronoframe.art')
        throw Object.assign(new Error('Origin'), { statusCode: 403 })
    },
    accountRouteAllowed,
    socialLoginCallback: (path: string) =>
      /^\/api\/auth\/callback\/(github|google|microsoft|discord)$/.test(path),
    isSocialLoginProvider: (id: string) =>
      ['github', 'google', 'microsoft', 'discord'].includes(id),
    getHeader: () => undefined,
    readRawBody: async (e: any) => e.raw,
    getRequestHeaders: () => ({}),
    cloudAccount: async () => ({
      handler: async () => {
        calls++
        return new Response('ok')
      },
    }),
    sendWebResponse: (_e: any, r: Response) => r,
    createError: (v: any) => Object.assign(new Error(v.statusMessage), v),
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
  assert.equal(calls, 0)
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

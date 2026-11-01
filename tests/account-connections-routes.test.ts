import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url),
  ts = require('typescript')
type Event = { origin?: string; body?: unknown }
async function handler(name: string, deps: Record<string, unknown>) {
  const source = (
    await readFile(
      new URL(
        `../apps/cloud/server/api/account/connections.${name}.ts`,
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
  return new Function(
    'exports',
    ...Object.keys(deps),
    code + ';return exports.default',
  )({}, ...Object.values(deps)) as (event: Event) => Promise<unknown>
}
test('connected-account routes use session ownership, canonical origins and fresh sessions for disconnects', async () => {
  let authenticated = true,
    authUserId = 42,
    createdAt = Date.now(),
    reads = 0,
    writes = 0
  const config = {
    portalOrigin: 'https://app.chronoframe.art',
    storageSecret: 'fixture-secret',
  }
  const deps = {
    definePlatformHandler: (f: unknown) => f,
    useRuntimeConfig: () => ({ platform: config }),
    setResponseHeader: () => {},
    platformPortalOrigin: (event: Event, _origin: string, mutation = false) => {
      if (mutation && event.origin !== config.portalOrigin)
        throw Object.assign(new Error('Origin'), { statusCode: 403 })
    },
    requirePlatformSession: async () => {
      if (!authenticated)
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
      return { userId: 42 }
    },
    platformDatabase: () => ({}),
    accountConnections: async (
      _db: unknown,
      _secret: string,
      userId: number,
    ) => {
      assert.equal(userId, 42)
      reads++
      return { providers: [], accounts: [] }
    },
    cloudAccount: async () => ({
      api: {
        getSession: async () => ({
          user: { id: String(authUserId) },
          session: { createdAt: new Date(createdAt) },
        }),
      },
    }),
    getRequestHeaders: () => ({}),
    siteManagementBody: async (event: Event) => event.body,
    unlinkLoginAccount: async (
      _db: unknown,
      _secret: string,
      userId: number,
      id: unknown,
    ) => {
      assert.equal(userId, 42)
      assert.equal(id, '5')
      writes++
      return true
    },
    createError: (value: { statusCode: number; data?: unknown }) =>
      Object.assign(new Error('Request rejected'), value),
  }
  const read = await handler('get', deps),
    remove = await handler('delete', deps)
  authenticated = false
  await assert.rejects(read({}), { statusCode: 401 })
  await assert.rejects(
    remove({ origin: config.portalOrigin, body: { id: '5' } }),
    { statusCode: 401 },
  )
  assert.equal(reads, 0)
  assert.equal(writes, 0)
  authenticated = true
  assert.deepEqual(await read({ body: { userId: 99 } }), {
    providers: [],
    accounts: [],
  })
  await assert.rejects(
    remove({ origin: 'https://evil.example.com', body: { id: '5' } }),
    { statusCode: 403 },
  )
  createdAt = Date.now() - 11 * 60_000
  await assert.rejects(
    remove({ origin: config.portalOrigin, body: { id: '5' } }),
    { statusCode: 401, data: { code: 'SESSION_IS_NOT_FRESH' } },
  )
  createdAt = Date.now()
  authUserId = 99
  await assert.rejects(
    remove({ origin: config.portalOrigin, body: { id: '5' } }),
    { statusCode: 401 },
  )
  assert.equal(writes, 0)
  authUserId = 42
  assert.deepEqual(
    await remove({
      origin: config.portalOrigin,
      body: { id: '5', userId: 99 },
    }),
    { success: true },
  )
  assert.equal(writes, 1)
})

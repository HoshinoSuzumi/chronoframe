import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { ACCOUNT_ACTIVITY_INTERVAL } from '../packages/platform/src/account-activity.ts'

const require = createRequire(import.meta.url)
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript')
const source = await readFile(
  new URL(
    '../apps/cloud/server/middleware/00-account-session.ts',
    import.meta.url,
  ),
  'utf8',
)
const code = transpileModule(
  source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, ''),
  {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
    },
  },
).outputText

test('session activity validates identities and throttles writes; unavailable durable tracking remains an error', async (t) => {
  let cookie = true
  let verified = true
  let suspended = 0
  let lastActive: number | null = null
  let writes = 0
  let reads = 0
  let failWrite = false
  let failRead = false
  const db = {
    prepare() {
      reads++
      return {
        bind() {
          return {
            async first() {
              if (failRead) throw new Error('Account control lookup failed')
              return { suspended, last_active_at: lastActive }
            },
          }
        },
      }
    },
  }
  const evaluate = new Function(
    'exports',
    'defineEventHandler',
    'platformDatabase',
    'getCookie',
    'getRequestHeaders',
    'cloudAccount',
    'recordAccountActivity',
    'ACCOUNT_ACTIVITY_INTERVAL',
    code + ';return exports.default',
  )
  const handler = evaluate(
    {},
    (v: unknown) => v,
    () => db,
    () => (cookie ? 'session' : undefined),
    () => ({}),
    async () => ({
      api: {
        getSession: async () => ({
          user: { id: '1', emailVerified: verified },
          session: { expiresAt: new Date(Date.now() + 86400000) },
        }),
      },
    }),
    async (_db: unknown, id: number, now: number) => {
      assert.equal(id, 1)
      if (failWrite) throw new Error('account_activity_unavailable')
      writes++
      lastActive = now
    },
    ACCOUNT_ACTIVITY_INTERVAL,
  )
  const request = async () => {
    const event = { context: {} as any }
    handler(event)
    return event.context.platformSessionResolver()
  }
  assert.equal((await request()).userId, 1)
  assert.equal(writes, 1)
  await request()
  assert.equal(
    writes,
    1,
    'normal API reads inside the 5-minute window do not write',
  )
  lastActive = Date.now() - ACCOUNT_ACTIVITY_INTERVAL - 1000
  await request()
  assert.equal(
    writes,
    2,
    'later API use refreshes activity without login or client events',
  )
  suspended = 1
  assert.equal(await request(), null)
  assert.equal(writes, 2)
  suspended = 0
  verified = false
  assert.equal(await request(), null)
  assert.equal(writes, 2)
  const before = reads
  cookie = false
  assert.equal(await request(), null)
  assert.equal(reads, before, 'anonymous requests do not access activity state')
  cookie = true
  verified = true
  lastActive = null
  failWrite = true
  const logged: unknown[][] = []
  t.mock.method(console, 'error', (...args: unknown[]) => logged.push(args))
  await assert.rejects(request(), /account_activity_unavailable/)
  assert.equal(writes, 2)
  assert.equal(lastActive, null)
  assert.deepEqual(logged, [])
  failWrite = false
  failRead = true
  await assert.rejects(request(), /Account control lookup failed/)
  assert.equal(
    logged.length,
    0,
    'critical account control errors are not swallowed',
  )
})

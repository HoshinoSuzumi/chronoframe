import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import ts from 'typescript'
import { REACTION_TYPES } from '../packages/contracts/src/reactions.ts'
import * as tables from '../apps/self-hosted/server/database/schema.ts'

function loadHandler(deps: Record<string, unknown>) {
  const source = readFileSync(
    'apps/self-hosted/server/api/photos/[photoId]/reactions.ts',
    'utf8',
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
  )({}, ...Object.values(deps)) as (event: {
    method: string
    photoId?: string
    body?: unknown
  }) => Promise<unknown>
}

test('Self-hosted photo reactions enforce the public setting without deleting historical rows', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema: tables })
  migrate(db, {
    migrationsFolder: './apps/self-hosted/server/database/migrations',
  })

  db.insert(tables.photos)
    .values({
      id: 'photo',
      title: 'Photo',
      storageKey: 'photo.jpg',
    })
    .run()

  let reactionsEnabled: boolean | null = true
  let accessDenied = false
  let accessCalls = 0
  let fingerprintCalls = 0
  let rateLimitQueries = 0

  const handler = loadHandler({
    defineEventHandler: (f: unknown) => f,
    getRouterParam: (event: { photoId?: string }) => event.photoId ?? 'photo',
    assertPhotoIdAccess: async () => {
      accessCalls++
      if (accessDenied)
        throw Object.assign(new Error('Not found'), { statusCode: 404 })
    },
    settingsManager: {
      get: async () => reactionsEnabled,
    },
    useDB: () => db,
    tables,
    and,
    eq,
    sql,
    siteAnd: and,
    siteEq: eq,
    DEFAULT_SITE: { id: 1 },
    REACTION_TYPES,
    getHeaders: () => ({
      'user-agent': 'test-agent',
      'accept-language': 'en',
      'accept-encoding': 'gzip',
    }),
    getRequestIP: () => {
      fingerprintCalls++
      return '203.0.113.10'
    },
    readBody: async (event: { body?: unknown }) => event.body,
    createError: (value: { statusCode: number; message?: string }) =>
      Object.assign(new Error(value.message ?? 'error'), value),
  })

  // Intercept rate-limit counting by wrapping select on photoReactions through a probe.
  const originalPrepare = sqlite.prepare.bind(sqlite)
  sqlite.prepare = ((sqlText: string) => {
    if (
      sqlText.includes('from "photo_reactions"') &&
      sqlText.includes('count(*)')
    )
      rateLimitQueries++
    return originalPrepare(sqlText)
  }) as typeof sqlite.prepare

  const created = (await handler({
    method: 'POST',
    body: { reactionType: 'like' },
  })) as { action: string; reactionType: string }
  assert.equal(created.action, 'created')
  assert.equal(created.reactionType, 'like')
  assert.equal(accessCalls, 1)
  assert.ok(fingerprintCalls >= 1)

  const enabledGet = (await handler({ method: 'GET' })) as {
    reactions: Record<string, number>
    userReaction: string | null
  }
  assert.equal(enabledGet.userReaction, 'like')
  assert.equal(enabledGet.reactions.like, 1)

  reactionsEnabled = false
  const fingerprintsBeforeDisable = fingerprintCalls
  const rateLimitBeforeDisable = rateLimitQueries
  const rowsBefore = db.select().from(tables.photoReactions).all()

  for (const method of ['GET', 'POST', 'DELETE'] as const) {
    await assert.rejects(
      handler({
        method,
        body: method === 'POST' ? { reactionType: 'love' } : undefined,
      }),
      { statusCode: 403 },
    )
  }

  assert.equal(fingerprintCalls, fingerprintsBeforeDisable)
  assert.equal(rateLimitQueries, rateLimitBeforeDisable)
  assert.deepEqual(db.select().from(tables.photoReactions).all(), rowsBefore)

  accessDenied = true
  const accessBeforeDenied = accessCalls
  await assert.rejects(handler({ method: 'GET' }), { statusCode: 404 })
  assert.equal(accessCalls, accessBeforeDenied + 1)
  assert.deepEqual(
    db.select().from(tables.photoReactions).all(),
    rowsBefore,
    'authorization failures must leave reaction rows untouched',
  )

  accessDenied = false
  reactionsEnabled = null
  const missingTreatedAsEnabled = (await handler({ method: 'GET' })) as {
    userReaction: string | null
    reactions: Record<string, number>
  }
  assert.equal(missingTreatedAsEnabled.userReaction, 'like')
  assert.equal(missingTreatedAsEnabled.reactions.like, 1)

  reactionsEnabled = true
  const restored = (await handler({ method: 'GET' })) as {
    userReaction: string | null
    reactions: Record<string, number>
  }
  assert.equal(restored.userReaction, 'like')
  assert.equal(restored.reactions.like, 1)

  sqlite.close()
})

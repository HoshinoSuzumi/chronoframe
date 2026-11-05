import { REACTION_TYPES } from '../packages/contracts/src/reactions.ts'
import { parseGalleryPresentation } from '../packages/contracts/src/gallery-settings.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFile, readdir } from 'node:fs/promises'
import ts from 'typescript'

function createPlatformDb(sqlite: Database.Database) {
  return {
    prepare: (sql: string) => {
      let values: (string | number | null)[] = []
      const statement = {
        bind: (...v: (string | number | null)[]) => {
          values = v
          return statement
        },
        first: async <T>() => sqlite.prepare(sql).get(...values) as T,
        run: async () => {
          sqlite.prepare(sql).run(...values)
          return { success: true }
        },
      }
      return statement
    },
  }
}

async function loadPublicReactionsHandler(
  db: ReturnType<typeof createPlatformDb>,
  options: {
    denied?: boolean
    authorizationCalls: { count: number }
    macCalls: { count: number }
  },
) {
  const source = (
    await readFile(
      'apps/site/server/api/public/photos/[photoId]/[operation].ts',
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
    exports: {},
    definePlatformHandler: (f: unknown) => f,
    platformDatabase: () => db,
    publicSiteContext: async () => ({ site: { id: 1 } }),
    getRouterParam: (event: { operation?: string }, name: string) =>
      name === 'photoId' ? 'photo' : event.operation,
    authorizePublicPhoto: async () => {
      options.authorizationCalls.count++
      if (options.denied)
        throw Object.assign(new Error('Denied'), { statusCode: 403 })
    },
    createCloudResourceRepository: () => ({
      membershipsForPhoto: async () => [],
    }),
    createResourceReader: () => ({ listAlbums: async () => [] }),
    createEmailCodeCrypto: async () => ({
      mac: async () => {
        options.macCalls.count++
        return 'visitor'
      },
    }),
    platformRequestURL: () => new URL('https://gallery.example'),
    useRuntimeConfig: () => ({ platform: { secret: 's'.repeat(32) } }),
    getHeader: (event: { headers?: Record<string, string> }, name: string) =>
      event.headers?.[name],
    getRequestWebStream: (event: { body?: unknown }) => event.body,
    readSiteBody: async (body: unknown) => body,
    createError: (value: { statusCode: number; message?: string }) =>
      Object.assign(new Error(value.message ?? 'error'), value),
    parseGalleryPresentation,
    REACTION_TYPES,
  }
  return new Function(...Object.keys(deps), code + ';return exports.default')(
    ...Object.values(deps),
  ) as (event: Record<string, unknown>) => Promise<{
    reactions: Record<string, number>
    userReaction: string | null
  }>
}

test('Site public reactions stay available when enabled and reject disabled traffic without deleting rows', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      sqlite.exec(
        await readFile('packages/platform/migrations/' + file, 'utf8'),
      )

    sqlite.exec(
      "INSERT INTO platform_users(id,email,created_at) VALUES(1,'one@example.com',1);INSERT INTO platform_workspaces(id,name) VALUES(1,'One');INSERT INTO platform_sites(id,workspace_id,name,gallery_presentation) VALUES(1,1,'One','{\"homeHeaderLayout\":\"embedded\",\"socialLinks\":{\"links\":[]},\"reactionsEnabled\":true}');INSERT INTO cloud_photos(site_id,id,source_version,title,metadata_json) VALUES(1,'photo','1','Photo','{}');INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,'photo','1','1','thumbnail','storage','thumb.webp',3,'image/webp')",
    )

    const db = createPlatformDb(sqlite)
    const authorizationCalls = { count: 0 }
    const macCalls = { count: 0 }
    const options = { denied: false, authorizationCalls, macCalls }
    const publicApi = await loadPublicReactionsHandler(db, options)

    const mutation = {
      method: 'POST',
      operation: 'reactions',
      context: { cloudflare: {} },
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        origin: 'https://gallery.example',
        'user-agent': 'test',
      },
      body: { reactionType: 'like' },
    }

    const created = await publicApi(mutation)
    assert.equal(created.userReaction, 'like')
    assert.equal(created.reactions.like, 1)
    assert.equal(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS n FROM platform_photo_reactions WHERE site_id=1 AND photo_id=?',
        )
        .get('photo')!.n,
      1,
    )
    const attemptsAfterCreate = sqlite
      .prepare(
        'SELECT COALESCE(SUM(attempts),0) AS n FROM platform_auth_attempts',
      )
      .get()!.n as number
    assert.ok(attemptsAfterCreate >= 1)

    sqlite
      .prepare('UPDATE platform_sites SET gallery_presentation=? WHERE id=1')
      .run(
        JSON.stringify({
          homeHeaderLayout: 'embedded',
          socialLinks: { links: [] },
          reactionsEnabled: false,
        }),
      )

    const macBeforeDisabled = macCalls.count
    const attemptsBeforeDisabled = sqlite
      .prepare(
        'SELECT COALESCE(SUM(attempts),0) AS n FROM platform_auth_attempts',
      )
      .get()!.n as number

    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      await assert.rejects(
        publicApi({
          ...mutation,
          method,
          body: method === 'POST' ? { reactionType: 'love' } : undefined,
        }),
        { statusCode: 403 },
      )
    }

    assert.equal(
      macCalls.count,
      macBeforeDisabled,
      'disabled reactions must not fingerprint visitors',
    )
    assert.equal(
      sqlite
        .prepare(
          'SELECT COALESCE(SUM(attempts),0) AS n FROM platform_auth_attempts',
        )
        .get()!.n,
      attemptsBeforeDisabled,
      'disabled reactions must not consume rate limits',
    )
    assert.deepEqual(
      sqlite
        .prepare(
          'SELECT reaction_type, visitor_key FROM platform_photo_reactions WHERE site_id=1 AND photo_id=?',
        )
        .all('photo'),
      [{ reaction_type: 'like', visitor_key: 'visitor' }],
    )

    options.denied = true
    const authBeforeDenied = authorizationCalls.count
    await assert.rejects(publicApi({ method: 'GET', operation: 'reactions' }), {
      statusCode: 403,
    })
    assert.equal(authorizationCalls.count, authBeforeDenied + 1)
    assert.deepEqual(
      sqlite
        .prepare(
          'SELECT reaction_type FROM platform_photo_reactions WHERE site_id=1 AND photo_id=?',
        )
        .all('photo'),
      [{ reaction_type: 'like' }],
      'authorization failures must not delete retained reactions',
    )

    options.denied = false
    sqlite
      .prepare('UPDATE platform_sites SET gallery_presentation=? WHERE id=1')
      .run(
        JSON.stringify({
          homeHeaderLayout: 'embedded',
          socialLinks: { links: [] },
          reactionsEnabled: true,
        }),
      )

    const restored = await publicApi({
      method: 'GET',
      operation: 'reactions',
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'user-agent': 'test',
      },
    })
    assert.equal(restored.userReaction, 'like')
    assert.equal(restored.reactions.like, 1)
  } finally {
    sqlite.close()
  }
})

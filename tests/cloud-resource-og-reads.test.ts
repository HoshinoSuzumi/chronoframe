import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { createResourceReader } from '@chronoframe/core'
import { createCloudResourceRepository } from '../packages/database/src/cloud-resources.ts'

const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

async function migratedD1() {
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
    for (const name of (await readdir('packages/platform/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = await readFile('packages/platform/migrations/' + name, 'utf8')
      for (const statement of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run()
    }
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at) VALUES(1,'test@example.com',1)",
      )
      .run()
    await db
      .prepare("INSERT INTO platform_workspaces(id,name) VALUES(1,'Test')")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'One',0)",
      )
      .run()
    return { mf, db }
  } catch (error) {
    await mf.dispose()
    throw error
  }
}

async function insertReadyPhoto(
  db: Awaited<ReturnType<typeof migratedD1>>['db'],
  photo: {
    id: string
    dateTaken: string | null
    title?: string
    pipelineVersion?: string
  },
) {
  const pipeline = photo.pipelineVersion ?? '1'
  await db
    .prepare(
      'INSERT INTO cloud_photos(site_id,id,source_version,title,metadata_json,deleted) VALUES(1,?,?,?,?,0)',
    )
    .bind(
      photo.id,
      '1',
      photo.title ?? photo.id,
      JSON.stringify({ dateTaken: photo.dateTaken }),
    )
    .run()
  await db
    .prepare(
      "INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,?,'1',?,'thumbnail','storage',?,?,?)",
    )
    .bind(
      photo.id,
      pipeline,
      `thumb/${photo.id}/${pipeline}.webp`,
      32,
      'image/webp',
    )
    .run()
}

test('Cloud OG reads count beyond the list page cap and keep preview order', async () => {
  const { mf, db } = await migratedD1()
  try {
    for (let i = 0; i < 1005; i++) {
      await insertReadyPhoto(db, {
        id: `p${String(i).padStart(4, '0')}`,
        dateTaken: `2020-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      })
    }
    // Newer dates must lead the preview order; ids break remaining ties.
    await insertReadyPhoto(db, {
      id: 'newest-a',
      dateTaken: '2026-06-01T00:00:00.000Z',
    })
    await insertReadyPhoto(db, {
      id: 'newest-b',
      dateTaken: '2026-06-01T00:00:00.000Z',
    })
    await insertReadyPhoto(db, {
      id: 'newest-c',
      dateTaken: '2026-05-01T00:00:00.000Z',
    })
    await insertReadyPhoto(db, {
      id: 'hidden-photo',
      dateTaken: '2026-07-01T00:00:00.000Z',
    })
    await insertReadyPhoto(db, {
      id: 'locked-photo',
      dateTaken: '2026-08-01T00:00:00.000Z',
    })
    await db
      .prepare(
        "INSERT INTO cloud_albums(site_id,id,title,hidden,position,created_at,updated_at) VALUES(1,'2','Hidden',1,1,1,1),(1,'3','Locked',0,0,1,1)",
      )
      .run()
    await db
      .prepare('INSERT INTO platform_album_access VALUES(1,3,?,?,?)')
      .bind('revision', 'salt', 'a'.repeat(64))
      .run()
    await db
      .prepare(
        "INSERT INTO cloud_album_photos(site_id,album_id,photo_id,position) VALUES(1,'2','hidden-photo',0),(1,'3','locked-photo',0)",
      )
      .run()

    const repository = createCloudResourceRepository(
      db,
      { id: 1 },
      '/api/public/media',
    )
    const reader = createResourceReader(repository)
    assert.equal(await reader.countVisiblePhotos(), 1008)
    assert.deepEqual(
      (await reader.listVisiblePhotoPreviews(3)).map((photo) => photo.id),
      ['newest-a', 'newest-b', 'newest-c'],
    )
    assert.ok(
      !(await reader.listVisiblePhotoPreviews(20))
        .map((photo) => photo.id)
        .includes('hidden-photo'),
    )
    assert.ok(
      !(await reader.listVisiblePhotoPreviews(20))
        .map((photo) => photo.id)
        .includes('locked-photo'),
    )
  } finally {
    await mf.dispose()
  }
})

test('Cloud thumbnail version lookup prefers the current pipeline per photo', async () => {
  const { mf, db } = await migratedD1()
  try {
    await insertReadyPhoto(db, {
      id: 'one',
      dateTaken: '2026-01-01T00:00:00.000Z',
      pipelineVersion: '1',
    })
    await db
      .prepare(
        "INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,'one','1','2','thumbnail','storage','thumb/one/2.webp',32,'image/webp')",
      )
      .run()
    await insertReadyPhoto(db, {
      id: 'two',
      dateTaken: '2026-01-02T00:00:00.000Z',
      pipelineVersion: '3',
    })
    const repository = createCloudResourceRepository(
      db,
      { id: 1 },
      '/api/public/media',
    )
    const reader = createResourceReader(repository)
    assert.deepEqual(await reader.listThumbnailVersions([]), [])
    assert.deepEqual(await reader.listThumbnailVersions(['one', 'missing', 'two']), [
      { sourceVersion: '1', pipelineVersion: '2' },
      null,
      { sourceVersion: '1', pipelineVersion: '3' },
    ])
  } finally {
    await mf.dispose()
  }
})

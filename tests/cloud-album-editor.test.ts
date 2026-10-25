import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { updateCloudAlbum } from '../apps/cloud/server/utils/cloud-album-editor.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'
test('album metadata and password changes share a revision fence and retain tenant isolation', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const n of readdirSync('packages/platform/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort())
      sqlite.exec(readFileSync('packages/platform/migrations/' + n, 'utf8'))
    sqlite.exec(
      "INSERT INTO platform_workspaces(id,name) VALUES(1,'One'),(2,'Two'); INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'One',0),(2,2,'Two',0); INSERT INTO cloud_albums(site_id,id,title,revision) VALUES(1,'1','Original',1),(2,'1','Foreign',1)",
    )
    const db = {
      prepare(sql: string) {
        let args: unknown[] = []
        const statement = {
          bind(...v: unknown[]) {
            args = v
            return statement
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...args) }
          },
          async first() {
            return sqlite.prepare(sql).get(...args)
          },
          async run() {
            const r = sqlite.prepare(sql).run(...args)
            return { meta: { changes: r.changes } }
          },
        }
        return statement
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        sqlite.exec('BEGIN')
        try {
          const values = []
          for (const s of statements) values.push(await s.run())
          sqlite.exec('COMMIT')
          return values
        } catch (e) {
          sqlite.exec('ROLLBACK')
          throw e
        }
      },
    } as unknown as PlatformD1
    assert.deepEqual(
      await updateCloudAlbum(db, 1, 1, {
        title: 'Updated',
        revision: 1,
        photoIds: [],
        coverPhotoId: null,
        isHidden: true,
        password: 'new-password',
      }),
      { revision: 2 },
    )
    const protectedBefore = sqlite
      .prepare(
        'SELECT * FROM platform_album_access WHERE site_id=1 AND album_id=1',
      )
      .get()
    assert.ok(protectedBefore)
    await assert.rejects(
      updateCloudAlbum(db, 1, 1, {
        title: 'Stale',
        revision: 1,
        photoIds: [],
        password: null,
      }),
      { statusCode: 409 },
    )
    assert.deepEqual(
      sqlite
        .prepare(
          'SELECT * FROM platform_album_access WHERE site_id=1 AND album_id=1',
        )
        .get(),
      protectedBefore,
    )
    await updateCloudAlbum(db, 1, 1, { title: 'Keep password', revision: 2 })
    assert.deepEqual(
      sqlite
        .prepare(
          'SELECT * FROM platform_album_access WHERE site_id=1 AND album_id=1',
        )
        .get(),
      protectedBefore,
    )
    assert.equal(
      sqlite.prepare('SELECT title FROM cloud_albums WHERE site_id=2').get()
        .title,
      'Foreign',
    )
    await assert.rejects(
      updateCloudAlbum(db, 1, 1, {
        title: 'Invalid',
        revision: 3,
        password: 'short',
      }),
      { statusCode: 400 },
    )
    await updateCloudAlbum(db, 1, 1, {
      title: 'Remove password',
      revision: 3,
      password: null,
    })
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) n FROM platform_album_access').get().n,
      0,
    )
  } finally {
    sqlite.close()
  }
})

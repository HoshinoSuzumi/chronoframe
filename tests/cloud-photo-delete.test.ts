import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { deleteCloudPhotos } from '../apps/cloud/server/utils/cloud-photo-delete.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'

test('bulk deletion rejects foreign or invalid IDs before any site changes', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const name of readdirSync('packages/platform/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort())
      sqlite.exec(readFileSync('packages/platform/migrations/' + name, 'utf8'))
    sqlite.exec(
      "INSERT INTO platform_workspaces(id,name) VALUES(1,'One'),(2,'Two');INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'One',0),(2,2,'Two',0)",
    )
    sqlite
      .prepare(
        "INSERT INTO cloud_photos(site_id,id,source_version,title) VALUES(1,'own','1','Own'),(2,'foreign','1','Foreign')",
      )
      .run()
    const db = {
      prepare(sql: string) {
        let args: unknown[] = []
        const statement = {
          bind(...values: unknown[]) {
            args = values
            return statement
          },
          async first() {
            return sqlite.prepare(sql).get(...args)
          },
          async run() {
            return sqlite.prepare(sql).run(...args)
          },
        }
        return statement
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        const results = []
        sqlite.exec('BEGIN')
        try {
          for (const s of statements) results.push(await s.run())
          sqlite.exec('COMMIT')
          return results
        } catch (e) {
          sqlite.exec('ROLLBACK')
          throw e
        }
      },
    } as unknown as PlatformD1
    await assert.rejects(deleteCloudPhotos(db, 1, ['own', 'foreign'], 1), {
      statusCode: 404,
    })
    await assert.rejects(deleteCloudPhotos(db, 1, [], 1), { statusCode: 400 })
    assert.equal(
      sqlite.prepare('SELECT SUM(deleted) AS n FROM cloud_photos').get().n,
      0,
    )
    await deleteCloudPhotos(db, 1, ['own', 'own'], 1)
    assert.equal(
      sqlite.prepare('SELECT deleted FROM cloud_photos WHERE site_id=1').get()
        .deleted,
      1,
    )
    assert.equal(
      sqlite.prepare('SELECT deleted FROM cloud_photos WHERE site_id=2').get()
        .deleted,
      0,
    )
  } finally {
    sqlite.close()
  }
})

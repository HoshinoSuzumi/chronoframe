import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFile, readdir } from 'node:fs/promises'
test('processing node migration preserves existing published assets and their foreign keys', async () => {
  const db = new Database(':memory:')
  try {
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql') && f < '0036')
      .sort())
      db.exec(await readFile('packages/platform/migrations/' + file, 'utf8'))
    db.exec(
      "INSERT INTO platform_workspaces(id,name) VALUES(1,'Existing'); INSERT INTO platform_sites(id,workspace_id,name) VALUES(1,1,'Existing'); INSERT INTO cloud_photos(site_id,id,source_version,title) VALUES(1,'photo','v1','Photo'); INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type,connection_revision) VALUES(1,'photo','v1','1','thumbnail','storage','thumbnail.webp',123,'image/webp',7)",
    )
    const before = db.prepare('SELECT * FROM cloud_media_assets').get()
    db.exec(
      await readFile(
        'packages/platform/migrations/0036_processors.sql',
        'utf8',
      ),
    )
    assert.deepEqual(
      db.prepare('SELECT * FROM cloud_media_assets').get(),
      before,
    )
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    db.prepare(
      "INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,'photo','v1','2','sanitized-original','storage','sanitized.jpg',234,'image/jpeg')",
    ).run()
  } finally {
    db.close()
  }
})

import { createStorageCipher } from '../packages/storage/src/credential-cipher.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import {
  validateCloudS3,
  createCloudS3,
} from '../packages/storage/src/s3-edge.ts'
import { createStorageVault } from '../packages/platform/src/storage-vault.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
const config = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'test-bucket',
  accessKeyId: 'example-access',
  secretAccessKey: 'example-secret',
}
test('One S3 implementation rejects SSRF/redirect destinations and signs bounded upload grants', async () => {
  for (const endpoint of [
    'http://s3.us-east-1.amazonaws.com',
    'https://127.0.0.1',
    'https://[::1]',
    'https://2130706433',
    'https://metadata.google.internal',
    'https://user:pass@s3.us-east-1.amazonaws.com',
    'https://s3.us-east-1.amazonaws.com:8443',
    'https://s3.us-east-1.amazonaws.com/path',
    'https://s3.us-east-1.amazonaws.com.evil.test',
    'https://user-controlled.test',
  ])
    assert.throws(() => validateCloudS3({ ...config, endpoint }))
  assert.throws(() =>
    validateCloudS3({ ...config, endpoint: 'https://localhost' }, [
      'localhost',
    ]),
  )
  assert.equal(
    validateCloudS3({
      ...config,
      endpoint: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com',
      region: 'auto',
    }),
    'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com',
  )
  assert.equal(
    validateCloudS3({ ...config, endpoint: 'https://storage.operator.test' }, [
      'storage.operator.test',
    ]),
    'https://storage.operator.test',
  )
  const s3 = createCloudS3(config)
  const url = new URL(
    await s3.signPut('chronoframe/1/originals/image', 42, 'image/jpeg'),
  )
  assert.equal(url.hostname, 's3.us-east-1.amazonaws.com')
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300')
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256')
  assert.equal(url.pathname, '/test-bucket/chronoframe/1/originals/image')
  assert(!url.href.includes(config.secretAccessKey))
  await assert.rejects(s3.signPut('../outside', 42, 'image/jpeg'))
  await assert.rejects(s3.signPut('valid', 1025 * 1024 * 1024, 'image/jpeg'))
  let redirect: string | undefined
  const transport = createCloudS3(config, {
    fetch: async (input, init) => {
      redirect = init?.redirect
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1' },
      })
    },
  })
  await assert.rejects(transport.head('probe'))
  assert.equal(redirect, 'manual')
})
test('Credential vault authenticates Site/revision, keeps old objects usable and never stores plaintext', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-22',
      script: 'export default {fetch(){return new Response("test")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const raw = await mf.getD1Database('DB')
    const db = raw as PlatformD1
    for (const sql of [
      'CREATE TABLE platform_sites(id INTEGER PRIMARY KEY)',
      'CREATE TABLE platform_users(id INTEGER PRIMARY KEY,created_at INTEGER)',
      'CREATE TABLE platform_workspaces(id INTEGER PRIMARY KEY,owner_user_id INTEGER)',
      'INSERT INTO platform_sites VALUES(1),(2)',
    ])
      await raw.prepare(sql).run()
    for (const name of [
      '0005_media_catalog.sql',
      '0006_cloud_execution.sql',
      '0007_cloud_storage.sql',
      '0009_cloud_usage_events.sql',
      '0014_entitlements.sql',
      '0025_site_storage_preferences.sql',
    ]) {
      const migration = await readFile(
        new URL('../packages/platform/migrations/' + name, import.meta.url),
        'utf8',
      )
      for (const sql of migration
        .replace(/^--.*$/gm, '')
        .match(/\s*CREATE TRIGGER[\s\S]+?END;|[^;]+;/g) ?? [])
        await raw.prepare(sql).run()
    }
    const cipher = await createStorageCipher('platform-secret-'.repeat(4)),
      vault = createStorageVault(db, 1, cipher)
    const { accessKeyId, secretAccessKey, ...publicConfig } = config
    await vault.create(
      'storage',
      publicConfig,
      { accessKeyId, secretAccessKey },
      1,
    )
    const stored = await raw
      .prepare(
        'SELECT secret_ciphertext,public_json FROM cloud_storage_versions',
      )
      .first()
    assert(!JSON.stringify(stored).includes(secretAccessKey))
    assert(!JSON.stringify(stored).includes(accessKeyId))
    await assert.rejects(
      cipher.open(
        stored.secret_ciphertext,
        JSON.stringify(['cloud-storage', 2, 'storage', 1]),
      ),
    )
    assert.equal(await createStorageVault(db, 2, cipher).get('storage'), null)
    assert.equal(
      (await vault.get('storage'))?.credentials.secretAccessKey,
      secretAccessKey,
    )
    const rotated = await Promise.all([
      vault.rotate(
        'storage',
        1,
        { accessKeyId: 'new', secretAccessKey: 'new-secret' },
        2,
      ),
      vault.rotate(
        'storage',
        1,
        { accessKeyId: 'other', secretAccessKey: 'other-secret' },
        2,
      ),
    ])
    assert.equal(rotated.filter(Boolean).length, 1)
    assert.equal((await vault.get('storage'))?.revision, 2)
    const resolved = await vault.resolve('storage', 1)
    assert.equal(resolved?.revision, 1)
    assert.equal(
      resolved?.credentials.secretAccessKey,
      (await vault.get('storage'))?.credentials.secretAccessKey,
    )
    assert.equal(resolved?.config.bucket, config.bucket)
    assert.equal(
      (await vault.get('storage', 1))?.credentials.secretAccessKey,
      secretAccessKey,
    )
    assert(!JSON.stringify(await vault.list()).includes('secret'))
    const capacity = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        vault.create(
          'capacity-' + i,
          publicConfig,
          { accessKeyId, secretAccessKey },
          3,
        ),
      ),
    )
    assert.equal(capacity.filter((r) => r.status === 'fulfilled').length, 19)
    assert.equal((await vault.list()).length, 20)
    assert.equal(
      (
        await raw
          .prepare(
            'SELECT COUNT(*) AS n FROM cloud_storage_versions WHERE site_id=1',
          )
          .first()
      ).n,
      21,
    )
    await raw
      .prepare(
        'INSERT OR IGNORE INTO platform_users(id,created_at) VALUES(1,1)',
      )
      .run()
    await raw
      .prepare(
        "INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at) VALUES(1,'before-retirement',1,'photo','1','storage','existing.jpg',1,9999999999999)",
      )
      .run()
    await raw
      .prepare(
        "UPDATE platform_sites SET preferred_storage_id='storage' WHERE id=1",
      )
      .run()
    await raw.batch([
      raw.prepare(
        "UPDATE cloud_storage_connections SET retired=1 WHERE site_id=1 AND id='storage'",
      ),
      raw.prepare(
        "UPDATE platform_sites SET preferred_storage_id=NULL WHERE id=1 AND preferred_storage_id='storage'",
      ),
    ])
    assert.equal(
      (await vault.list()).find((c) => c.id === 'storage')?.uploads_enabled,
      0,
    )
    assert.equal(
      (await vault.get('storage', 1))?.credentials.secretAccessKey,
      secretAccessKey,
    )
    assert.equal(
      (
        await raw
          .prepare('SELECT preferred_storage_id FROM platform_sites WHERE id=1')
          .first<any>()
      ).preferred_storage_id,
      null,
    )
    assert.equal(
      (
        await raw
          .prepare('SELECT COUNT(*) AS n FROM cloud_uploads')
          .first<any>()
      ).n,
      1,
    )
    await assert.rejects(
      raw
        .prepare(
          "INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at) VALUES(1,'after-retirement',1,'photo2','1','storage','new.jpg',1,9999999999999)",
        )
        .run(),
      /storage_connection_unavailable/,
    )
    await vault.create(
      'replacement',
      publicConfig,
      { accessKeyId, secretAccessKey },
      4,
    )
    assert.equal((await vault.list()).length, 21)
    assert.equal(
      (await vault.list()).filter((c) => c.uploads_enabled !== 0).length,
      20,
    )
    assert.equal(
      await vault.rotate(
        'storage',
        2,
        { accessKeyId, secretAccessKey: 'replacement-read-secret' },
        5,
      ),
      true,
    )
    assert.equal(
      (await vault.list()).find((c) => c.id === 'storage')?.uploads_enabled,
      0,
    )
    assert.equal(
      (await vault.get('storage', 1))?.credentials.secretAccessKey,
      secretAccessKey,
    )
  } finally {
    await mf.dispose()
  }
})

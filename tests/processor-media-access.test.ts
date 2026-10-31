import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFile, readdir } from 'node:fs/promises'
import ts from 'typescript'
test('published photo streams remain available throughout maintenance and after failure or cancellation', async () => {
  const sqlite = new Database(':memory:'),
    originalFetch = globalThis.fetch
  try {
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      sqlite.exec(
        await readFile('packages/platform/migrations/' + file, 'utf8'),
      )
    sqlite.exec(
      "INSERT INTO platform_users(id,email,created_at) VALUES(1,'one@example.com',1);INSERT INTO platform_workspaces(id,name) VALUES(1,'One');INSERT INTO platform_sites(id,workspace_id,name) VALUES(1,1,'One');INSERT INTO cloud_photos(site_id,id,source_version,title,metadata_json) VALUES(1,'photo','1','Photo','{}');INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at,state,content_type) VALUES(1,'upload',1,'photo','1','storage','original.jpg',3,100000,'completed','image/jpeg');INSERT INTO cloud_processing_jobs(site_id,id,upload_id,photo_id,source_version,pipeline_version,created_at,state) VALUES(1,'job','upload','photo','1','1',1,'succeeded');INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,'photo','1','1','thumbnail','storage','thumb.webp',3,'image/webp'),(1,'photo','1','1','live-video','storage','video.mov',3,'video/quicktime')",
    )
    const db = {
      prepare: (sql: string) => {
        let values: any[] = []
        const statement = {
          bind: (...v: any[]) => {
            values = v
            return statement
          },
          first: async () => sqlite.prepare(sql).get(...values),
        }
        return statement
      },
    }
    const source = (
      await readFile('apps/shared/platform/media.ts', 'utf8')
    ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const deps = {
      exports: {},
      platformDatabase: () => db,
      useRuntimeConfig: () => ({
        platform: {
          storageSecret: 's'.repeat(32),
          s3EndpointHosts: 'storage.example',
        },
      }),
      createStorageCipher: async () => ({}),
      createStorageVault: () => ({
        resolve: async () => ({
          config: { endpoint: 'https://storage.example' },
          credentials: {},
        }),
      }),
      createCloudS3: () => ({
        signGet: async (key: string) => 'https://storage.example/' + key,
      }),
      getHeader: () => undefined,
      createError: (v: any) => Object.assign(new Error(v.statusMessage), v),
    }
    const media = new Function(
      ...Object.keys(deps),
      code + ';return exports.privateMedia',
    )(...Object.values(deps))
    globalThis.fetch = async () =>
      new Response('img', {
        headers: { 'content-length': '3', 'content-type': 'image/jpeg' },
      })
    for (const state of [
      'succeeded',
      'queued',
      'running',
      'retry_wait',
      'failed',
      'cancelled',
    ]) {
      sqlite.prepare('UPDATE cloud_processing_jobs SET state=?').run(state)
      for (const role of ['original', 'display', 'thumbnail', 'live-video'])
        assert.equal(await (await media({}, 1, 'photo', role)).text(), 'img')
    }
    sqlite.exec('UPDATE cloud_photos SET metadata_json=NULL')
    await assert.rejects(media({}, 1, 'photo', 'thumbnail'), {
      statusCode: 404,
    })
    sqlite.exec("UPDATE cloud_photos SET metadata_json='{}',deleted=1")
    await assert.rejects(media({}, 1, 'photo', 'original'), { statusCode: 404 })
  } finally {
    globalThis.fetch = originalFetch
    sqlite.close()
  }
})

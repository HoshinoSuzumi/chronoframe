import assert from 'node:assert/strict'
import { createHash, hkdfSync } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createTestHarness } from 'wrangler'
import type { TestHarness, Unstable_RawConfig } from 'wrangler'
import type { PlatformD1 } from '../../packages/platform/src/index.ts'
import type { EntrySiteContext } from '../../packages/contracts/src/entry.ts'
import { splitSqlQuery } from '../helpers/sql.ts'
import { encodeVisitorGrants } from '../../apps/shared/platform/visitor.ts'
import { imageUrl } from '../helpers/seo.ts'

const root = process.cwd()

function robots(html: string) {
  return [...html.matchAll(/<meta\b[^>]*name="robots"[^>]*>/gi)]
    .flatMap(
      ([tag]) => tag.match(/content="([^"]*)"/)?.[1].split(/[,\s]+/) || [],
    )
    .map((value) => value.toLowerCase())
}

async function withBuiltEntry(
  entry: 'site',
  check: (worker: TestHarness, db: PlatformD1) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), `chronoframe-seo-${entry}-`))
  let worker: TestHarness | undefined
  try {
    const serverDirectory = join(root, `apps/${entry}/.output/server`)
    const config: Unstable_RawConfig = JSON.parse(
      await readFile(join(serverDirectory, 'wrangler.json'), 'utf8'),
    )
    assert.ok(config.main)
    assert.ok(config.assets?.directory)
    worker = createTestHarness({
      root: directory,
      workers: [
        {
          config: {
            ...config,
            main: join(serverDirectory, config.main),
            assets: {
              ...config.assets,
              directory: join(serverDirectory, config.assets.directory),
            },
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'isolated-seo-entry',
                database_id: '00000000-0000-0000-0000-000000000572',
                remote: false,
              },
            ],
            vars: {
              NUXT_APP_SECRET: 'site-worker-og-test-root'.repeat(3),
              NUXT_PLATFORM_SECRET: 'site-worker-visitor-test-root'.repeat(3),
            },
          },
        },
      ],
    })
    await worker.listen()
    const { DB: db } = await worker.getWorker<{ DB: PlatformD1 }>().getEnv()
    const migrations = join(root, 'packages/platform/migrations')
    for (const file of (await readdir(migrations))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      for (const query of splitSqlQuery(
        await readFile(join(migrations, file), 'utf8'),
      ))
        await db.prepare(query).run()
    }
    await check(worker, db)
  } finally {
    await worker?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

test(
  'built Site Worker renders signed OG images through trusted D1 Site contexts',
  { timeout: 120_000 },
  async () => {
    await withBuiltEntry('site', async (worker, db) => {
      const sites = [
        [1, 'Alpha Gallery', 'alpha.example.test'],
        [2, 'Beta Gallery', 'beta.example.test'],
      ] as const
      for (const [id, name, host] of sites) {
        await db.batch([
          db
            .prepare('INSERT INTO platform_workspaces(id,name) VALUES(?,?)')
            .bind(id, name),
          db
            .prepare(
              'INSERT INTO platform_sites(id,workspace_id,name,published,gallery_title,gallery_slogan) VALUES(?,?,?,1,?,?)',
            )
            .bind(id, id, name, name, `Public photography from ${name}`),
          db
            .prepare(
              'INSERT INTO platform_domains(hostname,site_id,verified,active) VALUES(?,?,1,1)',
            )
            .bind(host, id),
        ])
      }
      const images = new Map<string, string>()
      for (const [id, name, host] of sites) {
        const request = (path: string, options?: RequestInit) =>
          worker.fetch(new URL(path, `https://${host}`), options)
        const contextResponse = await request('/api/public/context')
        assert.equal(contextResponse.status, 200)
        const context = (await contextResponse.json()) as EntrySiteContext
        assert.equal(context.siteId, id)
        assert.equal(context.canonicalOrigin, `https://${host}`)
        const page = await request('/')
        const html = await page.text()
        assert.equal(page.status, 200, html.slice(0, 1000))
        assert.ok(!robots(html).includes('noindex'))
        assert.match(html, new RegExp(`property="og:title" content="${name}"`))
        assert.equal((html.match(/property="og:image"/g) || []).length, 1)
        const image = imageUrl(html)
        const url = new URL(image)
        assert.equal(url.hostname, host)
        const path = decodeURIComponent(url.pathname)
        assert.match(path, /,s_[^,/.]+\.png/)
        assert.match(path, new RegExp(`(?:/|,)originSiteId_${id}(?:,|\\.)`))
        images.set(host, path)
        const response = await request(path)
        assert.equal(
          response.status,
          200,
          response.status === 200 ? undefined : await response.text(),
        )
        assert.match(response.headers.get('content-type') || '', /image\/png/)
        assert.equal(
          (await request(path.replace(/,s_[^,/.]+(?=\.png)/, ',s_invalid')))
            .status,
          403,
        )
      }
      assert.notEqual(
        images.get('alpha.example.test'),
        images.get('beta.example.test'),
      )
      for (const [, , host] of sites) {
        for (const [, , otherHost] of sites) {
          if (host === otherHost) continue
          assert.equal(
            (await worker.fetch(`https://${otherHost}${images.get(host)}`))
              .status,
            403,
            'a signed image path must not be replayed under another published Site',
          )
          assert.equal(
            (
              await worker.fetch(
                `https://${otherHost}${images.get(host)}?originSiteId=2`,
                {
                  headers: { 'x-forwarded-host': host },
                },
              )
            ).status,
            403,
            'query parameters and forwarded Host must not override the signed Site binding',
          )
        }
      }
      const alphaImage = images.get('alpha.example.test')!
      const signed = alphaImage.match(/^(\/_og\/d\/)(.+),s_([^,/.]+)\.png$/)
      assert.ok(signed)
      const unscopedParams = signed[2]
        .split(',')
        .filter((part) => !part.startsWith('originSiteId_'))
        .join(',')
      const signingKey = Buffer.from(
        hkdfSync(
          'sha256',
          'site-worker-og-test-root'.repeat(3),
          'nuxt',
          'nuxt-og-image:url-signing',
          32,
        ),
      ).toString('hex')
      const sign = (params: string) =>
        createHash('sha256')
          .update(`${signingKey}:${params}`)
          .digest('base64url')
          .slice(0, 16)
      assert.equal(sign(signed[2]), signed[3])
      assert.equal(
        (
          await worker.fetch(
            `https://alpha.example.test${signed[1]}${unscopedParams},s_${sign(unscopedParams)}.png`,
          )
        ).status,
        403,
        'a correctly signed path without an originating Site must fail closed',
      )
      await db
        .prepare('UPDATE platform_domains SET site_id=2 WHERE hostname=?')
        .bind('alpha.example.test')
        .run()
      assert.equal(
        (await worker.fetch(`https://alpha.example.test${alphaImage}`)).status,
        403,
        'reassigning a Host must reject its previously cached image from the old Site',
      )
      assert.equal(
        (
          await worker.fetch(
            `https://alpha.example.test${images.get('beta.example.test')}`,
          )
        ).status,
        200,
      )
      const remappedPage = await worker.fetch('https://alpha.example.test/')
      assert.equal(remappedPage.status, 200)
      const remappedImage = new URL(imageUrl(await remappedPage.text()))
        .pathname
      assert.equal(
        (await worker.fetch(`https://alpha.example.test${remappedImage}`))
          .status,
        200,
      )
      await db
        .prepare('UPDATE platform_domains SET site_id=1 WHERE hostname=?')
        .bind('alpha.example.test')
        .run()
      assert.equal(
        (await worker.fetch(`https://alpha.example.test${remappedImage}`))
          .status,
        403,
        'a warmed image cache must not bypass a later Site reassignment',
      )
      assert.equal(
        (await worker.fetch(`https://alpha.example.test${alphaImage}`)).status,
        200,
      )
      await db
        .prepare('UPDATE platform_sites SET published=0 WHERE id=2')
        .run()
      assert.equal(
        (await worker.fetch('https://beta.example.test/')).status,
        404,
      )
      const image = images.get('alpha.example.test')!
      assert.equal(
        (
          await worker.fetch(`https://unknown.example.test${image}`, {
            headers: { 'x-forwarded-host': 'alpha.example.test' },
          })
        ).status,
        404,
        'forwarded Host must not grant Site access',
      )
      await db
        .prepare('UPDATE platform_domains SET active=0 WHERE site_id=1')
        .run()
      assert.equal(
        (await worker.fetch(`https://alpha.example.test${image}`)).status,
        404,
        'revoking a Host mapping must also deny its previously valid OG path',
      )
    })
  },
)

test(
  'Site previews keep metadata out of URLs and enforce live photo access before caches/rendering',
  { timeout: 120_000 },
  async () => {
    await withBuiltEntry('site', async (worker, db) => {
      await db.batch([
        db.prepare(
          "INSERT INTO platform_workspaces(id,name) VALUES(1,'OG access')",
        ),
        db.prepare(
          "INSERT INTO platform_sites(id,workspace_id,name,published,gallery_title) VALUES(1,1,'OG access',1,'OG access')",
        ),
        db.prepare(
          "INSERT INTO platform_domains(hostname,site_id,verified,active) VALUES('photo.example.test',1,1,1)",
        ),
        ...['guarded-photo', 'uncached-photo'].map((id) =>
          db
            .prepare(
              "INSERT INTO cloud_photos(site_id,id,source_version,title,metadata_json) VALUES(1,?,'1','Sensitive photo title',?)",
            )
            .bind(
              id,
              JSON.stringify({
                description: 'Sensitive description',
                width: 640,
                height: 480,
                latitude: 51.2,
              }),
            ),
        ),
        ...['guarded-photo', 'uncached-photo'].map((id) =>
          db
            .prepare(
              "INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,?,'1','1','thumbnail','fixture','thumb.webp',3,'image/webp')",
            )
            .bind(id),
        ),
      ])
      const request = (path: string, options?: RequestInit) =>
        worker.fetch(new URL(path, 'https://photo.example.test'), options)
      const { decodeOgImageParams } = await import(
        new URL('./runtime/shared.js', import.meta.resolve('nuxt-og-image'))
          .href
      )
      const previewPath = async (pagePath: string) => {
        const page = await request(pagePath)
        assert.equal(page.status, 200)
        const path = new URL(imageUrl(await page.text())).pathname
        const segment = decodeURIComponent(path)
          .replace(/^\/_og\/d\//, '')
          .replace(/,s_[^,/.]+\.png$/, '')
        const options = decodeOgImageParams(segment)
        if (pagePath === '/') assert.equal(options.props.showPhotos, true)
        else assert.equal(options.props.photoId, pagePath.slice(1))
        assert.equal(options.props?.photo, undefined)
        assert.equal(options.props?.thumbnails, undefined)
        assert.ok(
          !JSON.stringify(options).includes('Sensitive'),
          'no photo title/description may be encoded in preview URLs',
        )
        assert.ok(!JSON.stringify(options).includes('latitude'))
        return path
      }
      const image = await previewPath('/guarded-photo')
      const uncached = await previewPath('/uncached-photo')
      const home = await previewPath('/')
      const first = await request(image)
      assert.equal(
        first.status,
        200,
        first.status === 200 ? undefined : await first.text(),
      )
      assert.equal(first.headers.get('cache-control'), 'private, no-store')
      assert.equal((await request(home)).status, 200)

      await db.batch([
        db.prepare(
          "INSERT INTO cloud_albums(site_id,id,title,hidden) VALUES(1,'1','Private',1)",
        ),
        ...['guarded-photo', 'uncached-photo'].map((id) =>
          db
            .prepare(
              "INSERT INTO cloud_album_photos(site_id,album_id,photo_id) VALUES(1,'1',?)",
            )
            .bind(id),
        ),
      ])
      assert.equal(
        (await request(image)).status,
        404,
        'a warmed signed preview must stop serving a newly hidden photo',
      )
      assert.equal((await request(uncached)).status, 404)
      assert.equal((await request(home)).status, 200)

      await db.batch([
        db.prepare(
          "UPDATE cloud_albums SET hidden=0 WHERE site_id=1 AND id='1'",
        ),
        db
          .prepare(
            "INSERT INTO platform_album_access(site_id,album_id,revision,salt,password_hash) VALUES(1,1,'revision-1',?,?)",
          )
          .bind('ab'.repeat(16), 'cd'.repeat(32)),
      ])
      assert.equal(
        (await request(image)).status,
        404,
        'a newly protected photo must not be public through its old URL',
      )
      const cookieFor = async (revision: string, host = 'photo.example.test') =>
        '__Host-chronoframe-visitor=' +
        (await encodeVisitorGrants(
          'site-worker-visitor-test-root'.repeat(3),
          host,
          [{ siteId: 1, albumId: 1, revision, expiresAt: Date.now() + 60_000 }],
        ))
      const cookie = await cookieFor('revision-1')
      assert.equal(
        (await request(image, { headers: { cookie } })).status,
        200,
      )
      assert.equal(
        (
          await request(image, {
            headers: {
              cookie: await cookieFor('revision-1', 'other.example.test'),
            },
          })
        ).status,
        404,
      )
      await db
        .prepare(
          "UPDATE platform_album_access SET revision='revision-2' WHERE site_id=1 AND album_id=1",
        )
        .run()
      assert.equal(
        (await request(image, { headers: { cookie } })).status,
        404,
        'a revoked visitor grant must not reuse a cached preview',
      )
      const currentCookie = await cookieFor('revision-2')
      assert.equal(
        (await request(image, { headers: { cookie: currentCookie } })).status,
        200,
      )
      await db
        .prepare("UPDATE cloud_albums SET hidden=1 WHERE site_id=1 AND id='1'")
        .run()
      assert.equal(
        (await request(image, { headers: { cookie: currentCookie } })).status,
        404,
        'visitor grants do not bypass hidden albums',
      )
      await db.batch([
        db.prepare(
          'DELETE FROM platform_album_access WHERE site_id=1 AND album_id=1',
        ),
        db.prepare(
          "UPDATE cloud_albums SET hidden=0 WHERE site_id=1 AND id='1'",
        ),
      ])
      assert.equal((await request(image)).status, 200)
      await db
        .prepare(
          "UPDATE cloud_photos SET deleted=1 WHERE site_id=1 AND id='guarded-photo'",
        )
        .run()
      assert.equal(
        (await request(image)).status,
        404,
        'deleted photos cannot reuse an old preview',
      )
    })
  },
)

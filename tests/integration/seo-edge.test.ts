import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, hkdfSync } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createTestHarness } from 'wrangler'
import type { TestHarness, Unstable_RawConfig } from 'wrangler'
import type { PlatformD1 } from '../../packages/platform/src/index.ts'
import type { EntrySiteContext } from '../../packages/contracts/src/entry.ts'
import { splitSqlQuery } from '../helpers/sql.ts'
import { createEmailCodeCrypto } from '../../apps/shared/platform/crypto.ts'
import { encodeVisitorGrants } from '../../apps/shared/platform/visitor.ts'
import { galleryFontFamilies } from '../../packages/gallery/fonts.ts'
import { imageUrl, unusedPort, waitForChildExit } from '../helpers/seo.ts'

const root = process.cwd()
const require = createRequire(import.meta.url)
const wrangler = join(
  dirname(require.resolve('wrangler/package.json')),
  'bin/wrangler.js',
)

function robots(html: string) {
  return [...html.matchAll(/<meta\b[^>]*name="robots"[^>]*>/gi)]
    .flatMap(
      ([tag]) => tag.match(/content="([^"]*)"/)?.[1].split(/[,\s]+/) || [],
    )
    .map((value) => value.toLowerCase())
}

async function withBuiltEntry(
  entry: 'cloud' | 'site',
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

// This isolated Worker covers invalid bindings and Site Config build overrides;
// the built Site Worker regression below covers trusted public Site requests.
test(
  'Worker OG font resolution, signing bindings and Site Config build overrides are preserved',
  { timeout: 180_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'chronoframe-seo-edge-'))
    try {
      await symlink(
        join(root, 'node_modules'),
        join(directory, 'node_modules'),
        'dir',
      )
      await mkdir(join(directory, 'app/components/OgImage'), {
        recursive: true,
      })
      await mkdir(join(directory, 'server/api'), { recursive: true })
      await writeFile(
        join(directory, 'app/app.vue'),
        `<script setup>
defineOgImage('Fixture', { title: 'Worker signing 摄影照片' })
</script><template><h1 style="font-family:Rubik,'Noto Sans SC';font-weight:700">Worker signing 摄影照片</h1></template>`,
      )
      await writeFile(
        join(directory, 'app/components/OgImage/Fixture.takumi.vue'),
        `<script setup>
defineProps({ title: String })
</script><template><div style="width:100%;height:100%;background:white;color:black;font-family:'Noto Sans SC';font-weight:700;font-size:48px">{{ title }}</div></template>`,
      )
      await writeFile(
        join(directory, 'server/api/config.get.ts'),
        `import { defineEventHandler } from 'nuxt/server'
import { getSiteConfig } from '#site-config/server'
import availableFonts from '#og-image/fonts-available'
export default defineEventHandler(event => {
 const config = getSiteConfig(event)
 return { url: config.url, trailingSlash: config.trailingSlash, indexable: config.indexable, env: config.env,
 fonts: availableFonts.map(({ family, weight, weightRange, src }) => ({ family, weight, weightRange, src })) }
})`,
      )
      await writeFile(
        join(directory, 'nuxt.config.mjs'),
        `import { writeFileSync } from 'node:fs'
const fontEvents = []
const config = ` +
          JSON.stringify({
            compatibilityDate: '2025-07-15',
            telemetry: false,
            devtools: { enabled: false },
            // Register Fonts before OG discovers metadata for absolute entrypoints.
            modules: [
              fileURLToPath(import.meta.resolve('@nuxt/fonts')),
              fileURLToPath(import.meta.resolve('nuxt-og-image')),
            ],
            fonts: { families: galleryFontFamilies },
            site: { url: 'https://build.example.test', trailingSlash: true },
            nitro: {
              preset: 'cloudflare-module',
              cloudflare: { nodeCompat: true, deployConfig: true },
            },
          }) +
          `
config.hooks = {
 'fonts:resolved'(font) {
   fontEvents.push({ family: font.fontFamily, files: font.files.length })
   writeFileSync(new URL('./font-events.json', import.meta.url), JSON.stringify(fontEvents))
 }
}
export default config`,
      )
      const childEnv = { ...process.env }
      delete childEnv.NODE_TEST_CONTEXT
      delete childEnv.NUXT_SITE_INDEXABLE
      // Raw NUXT_SITE_* values are resolved during this Worker build; signing
      // must additionally resolve its private binding for each runtime instance.
      const build = spawn(
        process.execPath,
        [
          join(dirname(require.resolve('nuxt/package.json')), 'bin/nuxt.mjs'),
          'build',
          directory,
        ],
        {
          cwd: directory,
          detached: process.platform !== 'win32',
          env: {
            ...childEnv,
            NUXT_SITE_URL: 'https://runtime.example.test',
            NUXT_SITE_TRAILING_SLASH: 'false',
            NUXT_SITE_ENV: 'production',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      let buildOutput = ''
      for (const stream of [build.stdout, build.stderr])
        stream.on('data', (chunk) => {
          buildOutput = (buildOutput + chunk).slice(-8000)
        })
      const [buildCode] = await waitForChildExit(build, t.signal)
      assert.equal(buildCode, 0, buildOutput)
      const fontEvents = JSON.parse(
        await readFile(join(directory, 'font-events.json'), 'utf8'),
      ) as { family: string; files: number }[]
      for (const family of ['Rubik', 'Noto Sans SC'])
        assert.ok(
          fontEvents.some((font) => font.family === family && font.files > 0),
          `fonts:resolved must report ${family} and its assets`,
        )

      for (const secret of ['worker-test-root'.repeat(4), '', 'invalid']) {
        const port = await unusedPort()
        const worker = spawn(
          process.execPath,
          [
            wrangler,
            'dev',
            '--local',
            '--config',
            join(directory, '.output/server/wrangler.json'),
            '--port',
            String(port),
            '--inspector-port',
            '0',
            '--ip',
            '127.0.0.1',
            '--show-interactive-dev-session=false',
            '--var',
            `NUXT_APP_SECRET:${secret}`,
          ],
          {
            cwd: directory,
            detached: process.platform !== 'win32',
            env: { ...childEnv, WRANGLER_SEND_METRICS: 'false' },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        const shutdown = new AbortController()
        const stopped = waitForChildExit(worker, shutdown.signal)
        stopped.catch(() => {})
        let output = ''
        for (const stream of [worker.stdout, worker.stderr])
          stream.on('data', (chunk) => {
            output = (output + chunk).slice(-6000)
          })
        const origin = `http://127.0.0.1:${port}`
        const request = (path: string) =>
          fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) })
        try {
          let ready = false
          for (let attempt = 0; attempt < 120; attempt++) {
            try {
              if ((await request('/api/config')).ok) {
                ready = true
                break
              }
            } catch {
              /* Worker may still be starting. */
            }
            if (worker.exitCode !== null) break
            await delay(100)
          }
          assert.ok(ready, output)
          const { fonts, ...siteConfig } = (await (
            await request('/api/config')
          ).json()) as {
            fonts: {
              family: string
              weight: number
              weightRange?: number[]
              src: string
            }[]
            url: string
            trailingSlash: boolean
            indexable: boolean
            env: string
          }
          assert.deepEqual(siteConfig, {
            url: 'https://runtime.example.test',
            trailingSlash: false,
            indexable: true,
            env: 'production',
          })
          for (const family of ['Rubik', 'Noto Sans SC']) {
            for (const weight of [400, 700]) {
              assert.ok(
                fonts.some(
                  (font) =>
                    font.family === family &&
                    (font.weight === weight ||
                      (font.weightRange &&
                        font.weightRange[0] <= weight &&
                        font.weightRange[1] >= weight)) &&
                    font.src,
                ),
                `OG must receive ${family} at weight ${weight} through fonts:resolved; registry: ${JSON.stringify([...new Set(fonts.map((font) => `${font.family}:${font.weight}:${font.weightRange}`))])}`,
              )
            }
          }
          const page = await request('/')
          assert.equal(page.status, 200, output)
          const html = await page.text()
          const image = imageUrl(html)
          const path = decodeURIComponent(new URL(image, origin).pathname)
          const response = await request(path)
          if (secret.length >= 32) {
            assert.equal(response.status, 200, output)
            assert.match(
              response.headers.get('content-type') || '',
              /image\/png/,
            )
            const png = Buffer.from(await response.arrayBuffer())
            assert.equal(png.subarray(1, 4).toString(), 'PNG')
            assert.match(path, /,s_[^,/.]+\.png/)
            assert.equal(
              (await request(path.replace(/,s_[^,/.]+(?=\.png)/, ',s_invalid')))
                .status,
              403,
            )
            assert.equal(
              (await request(path.replace(/,s_[^,/.]+(?=\.png)/, ''))).status,
              403,
            )
          } else {
            assert.equal(
              response.status,
              500,
              'missing/invalid binding must fail closed for image rendering',
            )
          }
        } finally {
          shutdown.abort()
          await stopped.catch((error) => {
            if (error !== shutdown.signal.reason) throw error
          })
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

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
        assert.equal(context.audience, 'public')
        assert.equal(context.canonicalOrigin, `https://${host}`)
        const page = await request('/')
        const html = await page.text()
        assert.equal(page.status, 200, html.slice(0, 1000))
        assert.ok(
          !robots(html).includes('noindex'),
          'public galleries stay discoverable',
        )
        assert.match(html, new RegExp(`property="og:title" content="${name}"`))
        assert.match(
          html,
          new RegExp(`rel="canonical" href="https://${host}/"`),
        )
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
        const png = Buffer.from(await response.arrayBuffer())
        assert.equal(png.subarray(1, 4).toString(), 'PNG')
        assert.equal(png.readUInt32BE(16), 1200)
        assert.equal(png.readUInt32BE(20), 600)
        assert.equal(
          (await request(path.replace(/,s_[^,/.]+(?=\.png)/, ',s_invalid')))
            .status,
          403,
        )
        assert.equal(
          (await request(path.replace(/,s_[^,/.]+(?=\.png)/, ''))).status,
          403,
        )
      }
      assert.notEqual(
        images.get('alpha.example.test'),
        images.get('beta.example.test'),
        'different Site profiles must not share OG image props',
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
      assert.notEqual(unscopedParams, signed[2])
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
      assert.equal(
        sign(signed[2]),
        signed[3],
        'the fixture signer must match the Worker signature',
      )
      const signature = sign(unscopedParams)
      assert.equal(
        (
          await worker.fetch(
            `https://alpha.example.test${signed[1]}${unscopedParams},s_${signature}.png`,
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
        'a verified alias of the same Site may serve its signed image',
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
      for (const [id, slug, hidden] of [
        [1, 'locked-album', 0],
        [2, 'hidden-album', 1],
      ] as const) {
        await db.batch([
          db
            .prepare(
              'INSERT INTO cloud_albums(site_id,id,title,hidden) VALUES(1,?,?,?)',
            )
            .bind(
              String(id),
              hidden ? 'Private album fixture title' : slug,
              hidden,
            ),
          db
            .prepare(
              'INSERT INTO cloud_album_slugs(site_id,album_id,slug,is_current) VALUES(1,?,?,1)',
            )
            .bind(String(id), slug),
        ])
      }
      await db
        .prepare(
          'INSERT INTO platform_album_access(site_id,album_id,revision,salt,password_hash) VALUES(1,1,?,?,?)',
        )
        .bind('fixture-revision', 'ab'.repeat(16), 'cd'.repeat(32))
        .run()
      const protectedAlbum = await worker.fetch(
        'https://alpha.example.test/albums/locked-album',
      )
      const protectedHtml = await protectedAlbum.text()
      assert.equal(protectedAlbum.status, 200, protectedHtml.slice(0, 1000))
      assert.ok(
        !robots(protectedHtml).includes('noindex'),
        'the public password prompt retains its existing discoverability',
      )
      assert.equal(
        (await worker.fetch('https://alpha.example.test/api/public/albums/1'))
          .status,
        403,
      )
      const hiddenAlbum = await worker.fetch(
        'https://alpha.example.test/albums/hidden-album',
      )
      assert.equal(hiddenAlbum.status, 404)
      assert.ok(
        !(await hiddenAlbum.text()).includes('Private album fixture title'),
      )
      await db.prepare('UPDATE platform_sites SET published=0 WHERE id=2').run()
      assert.equal(
        (await worker.fetch('https://beta.example.test/')).status,
        404,
        'an unpublished Site must not render an indexable gallery',
      )
      const image = images.get('alpha.example.test')!
      const unknown = await worker.fetch(
        `https://unknown.example.test${image}`,
        { headers: { 'x-forwarded-host': 'alpha.example.test' } },
      )
      assert.equal(
        unknown.status,
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
      const previewPath = async (pagePath: string, locale = 'en') => {
        const page = await request(pagePath, {
          headers: { cookie: `chronoframe-locale=${locale}` },
        })
        assert.equal(page.status, 200)
        const path = new URL(imageUrl(await page.text())).pathname
        const segment = decodeURIComponent(path)
          .replace(/^\/_og\/d\//, '')
          .replace(/,s_[^,/.]+\.png$/, '')
        const options = decodeOgImageParams(segment)
        if (pagePath === '/') {
          assert.equal(options.props.showPhotos, true)
          assert.equal(options.props.locale, locale)
        } else assert.equal(options.props.photoId, pagePath.slice(1))
        assert.equal(options.props?.photo, undefined)
        assert.equal(options.props?.thumbnails, undefined)
        assert.ok(
          !JSON.stringify(options).includes('Sensitive'),
          'no photo title/description, including alt text, may be encoded in preview URLs',
        )
        assert.ok(!JSON.stringify(options).includes('latitude'))
        return path
      }
      const image = await previewPath('/guarded-photo')
      const uncached = await previewPath('/uncached-photo')
      const home = await previewPath('/')
      const chineseHome = await previewPath('/', 'zh-Hans')
      assert.notEqual(
        chineseHome,
        home,
        'page locale must be bound into the signed path',
      )
      const first = await request(image)
      assert.equal(
        first.status,
        200,
        first.status === 200 ? undefined : await first.text(),
      )
      assert.equal(first.headers.get('x-og-cache'), 'MISS')
      assert.equal(first.headers.get('cache-control'), 'private, no-store')
      const initialPng = await first.arrayBuffer()
      const cached = await request(image)
      assert.equal(cached.status, 200)
      assert.equal(cached.headers.get('x-og-cache'), 'HIT')
      assert.equal(cached.headers.get('cache-control'), 'private, no-store')
      const publicHome = await request(home, {
        headers: { cookie: 'chronoframe-locale=zh-Hans' },
      })
      assert.equal(publicHome.status, 200)
      const publicHomePng = await publicHome.arrayBuffer()
      const chinesePreview = await request(chineseHome, {
        headers: { cookie: 'chronoframe-locale=en' },
      })
      assert.equal(chinesePreview.status, 200)
      const chinesePng = await chinesePreview.arrayBuffer()
      assert.notDeepEqual(
        Buffer.from(chinesePng),
        Buffer.from(publicHomePng),
        'the signed English and Chinese counts must render differently under opposite visitor locales',
      )
      const cachedChinese = await request(chineseHome, {
        headers: { cookie: 'chronoframe-locale=zh-Hans' },
      })
      assert.equal(cachedChinese.headers.get('x-og-cache'), 'HIT')
      assert.deepEqual(
        Buffer.from(await cachedChinese.arrayBuffer()),
        Buffer.from(chinesePng),
      )
      assert.equal((await request(home)).headers.get('x-og-cache'), 'HIT')
      // Publication changes the selected asset version, not its public URL or
      // photo metadata/count (including the perceptual thumbnail hash).
      await db
        .prepare(
          "INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) SELECT site_id,photo_id,source_version,'2',role,connection_id,'reprocessed-thumb.webp',bytes,content_type FROM cloud_media_assets WHERE site_id=1 AND photo_id='guarded-photo' AND pipeline_version='1' AND role='thumbnail'",
        )
        .run()
      const reprocessedHome = await request(home)
      assert.equal(reprocessedHome.status, 200)
      assert.equal(
        reprocessedHome.headers.get('x-og-cache'),
        'MISS',
        'a newly published thumbnail must invalidate Home even with unchanged URLs/counts',
      )
      await reprocessedHome.arrayBuffer()
      assert.equal((await request(home)).headers.get('x-og-cache'), 'HIT')
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
      assert.equal(
        (await request(uncached)).status,
        404,
        'a newly rendered preview must apply the same access check',
      )
      const privateHome = await request(home)
      assert.equal(privateHome.status, 200)
      assert.equal(
        privateHome.headers.get('x-og-cache'),
        'MISS',
        'Home must not reuse thumbnails/counts from photos that became private',
      )
      assert.notDeepEqual(
        Buffer.from(await privateHome.arrayBuffer()),
        Buffer.from(publicHomePng),
      )
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
        'a current visitor grant still authorizes the preview',
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
        db.prepare(
          "UPDATE cloud_photos SET title='Updated photo title' WHERE site_id=1 AND id='guarded-photo'",
        ),
      ])
      const updated = await request(image)
      assert.equal(updated.status, 200)
      assert.equal(
        updated.headers.get('x-og-cache'),
        'MISS',
        'current metadata must participate in the server cache key',
      )
      assert.notDeepEqual(
        Buffer.from(await updated.arrayBuffer()),
        Buffer.from(initialPng),
      )
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

test(
  'built Cloud Worker keeps public marketing discoverable and portal surfaces noindex',
  { timeout: 120_000 },
  async () => {
    await withBuiltEntry('cloud', async (worker, db) => {
      for (const path of ['/', '/pricing']) {
        const page = await worker.fetch(`https://chronoframe.art${path}`)
        assert.equal(page.status, 200)
        assert.ok(!robots(await page.text()).includes('noindex'), path)
      }
      for (const path of [
        '/signin',
        '/signup',
        '/forgot-password',
        '/reset-password',
      ]) {
        const page = await worker.fetch(`https://app.chronoframe.art${path}`)
        assert.equal(page.status, 200, path)
        assert.ok(robots(await page.text()).includes('noindex'), path)
      }
      for (const path of [
        '/pricing',
        '/workspace',
        '/account',
        '/sites',
        '/sites/1/overview',
      ]) {
        const response = await worker.fetch(
          `https://app.chronoframe.art${path}`,
          { redirect: 'manual' },
        )
        assert.equal(response.status, 302, path)
        assert.equal(
          new URL(
            response.headers.get('location')!,
            'https://app.chronoframe.art',
          ).pathname,
          '/signin',
          path,
        )
      }
      const token = '12345678-1234-4234-8234-123456789012'
      const crypto = await createEmailCodeCrypto(
        'site-worker-visitor-test-root'.repeat(3),
      )
      await db.batch([
        db.prepare(
          "INSERT INTO platform_users(id,email,name,created_at) VALUES(1,'seo@example.test','SEO Fixture',0)",
        ),
        db.prepare(
          "INSERT INTO platform_workspaces(id,name,owner_user_id) VALUES(1,'Fixture Workspace',1)",
        ),
        db.prepare(
          "INSERT INTO platform_memberships(user_id,workspace_id,role) VALUES(1,1,'admin')",
        ),
        db.prepare(
          "INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'Private Portal Site',1)",
        ),
        db
          .prepare(
            'INSERT INTO platform_sessions(token_mac,user_id,expires_at) VALUES(?,1,?)',
          )
          .bind(
            await crypto.mac(['platform-session', token]),
            Date.now() + 60_000,
          ),
      ])
      for (const path of ['/account', '/sites', '/sites/1/overview']) {
        const page = await worker.fetch(`https://app.chronoframe.art${path}`, {
          headers: { cookie: `__Host-chronoframe-session=${token}` },
        })
        const html = await page.text()
        assert.equal(page.status, 200, `${path}: ${html.slice(0, 1000)}`)
        assert.ok(
          robots(html).includes('noindex'),
          `${path} must stay noindex after authentication`,
        )
      }
      const publicAfterPortal = await worker.fetch('https://chronoframe.art/')
      assert.equal(publicAfterPortal.status, 200)
      assert.ok(
        !robots(await publicAfterPortal.text()).includes('noindex'),
        'portal robots directives must not leak into subsequent marketing requests',
      )
    })
  },
)

import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { openDatabase, tables } from '../../packages/database/src/connection.ts'
import { imageUrl, unusedPort } from '../helpers/seo.ts'

const root = process.cwd()
const password = 'isolated-seo-test-password'

async function stop(server: ChildProcess) {
  if (server.exitCode !== null) return
  server.kill('SIGTERM')
  await once(server, 'exit')
}

async function start(directory: string, envOverrides: NodeJS.ProcessEnv = {}) {
  const port = await unusedPort()
  const env = { ...process.env }
  delete env.NUXT_APP_SECRET
  delete env.NITRO_APP_SECRET
  delete env.NUXT_OG_IMAGE_SECRET
  delete env.NUXT_APP_SECRET_GENERATED
  const server = spawn(
    process.execPath,
    [join(root, 'apps/self-hosted/.output/server/index.mjs')],
    {
      cwd: directory,
      env: {
        ...env,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(port),
        DATABASE_URL: join(directory, 'app.sqlite3'),
        DATABASE_MIGRATIONS: join(root, 'packages/database/migrations'),
        NUXT_STORAGE_PROVIDER: 'local',
        NUXT_PROVIDER_LOCAL_BASE_PATH: join(directory, 'storage'),
        NUXT_SESSION_PASSWORD: 'isolated-session-key'.repeat(3),
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-8000)
    })
  const origin = `http://127.0.0.1:${port}`
  const request = (path: string, options?: RequestInit) =>
    fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(30_000),
      ...options,
    })
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await request('/api/wizard/schema')
      return { server, origin, request, output: () => output }
    } catch {
      if (server.exitCode !== null) break
      await delay(50)
    }
  }
  await stop(server)
  throw new Error(`Isolated SEO server did not start: ${output}`)
}

test(
  'production OG metadata, PNGs, signatures and root keys survive the SEO migration',
  { timeout: 180_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'chronoframe-seo-runtime-'))
    const connection = openDatabase({
      filename: join(directory, 'app.sqlite3'),
      migrationsFolder: join(root, 'packages/database/migrations'),
    })
    connection.db
      .insert(tables.photos)
      .values([
        {
          id: 'public-photo',
          siteId: 1,
          title: 'Photography 摄影',
          description: 'Bilingual photo description',
          width: 640,
          height: 480,
          thumbnailUrl: '/web-app-manifest-512x512.png',
          originalUrl: '/web-app-manifest-512x512.png',
        },
        {
          id: 'hidden-photo',
          siteId: 1,
          title: 'PRIVATE PHOTO',
          width: 640,
          height: 480,
          thumbnailUrl: '/web-app-manifest-512x512.png',
          originalUrl: '/web-app-manifest-512x512.png',
        },
      ])
      .run()
    const album = connection.db
      .insert(tables.albums)
      .values({ siteId: 1, title: 'Hidden', isHidden: true })
      .returning({ id: tables.albums.id })
      .get()
    connection.db
      .insert(tables.albumPhotos)
      .values({
        siteId: 1,
        albumId: album.id,
        photoId: 'hidden-photo',
        position: 0,
      })
      .run()
    try {
      const first = await start(directory)
      let homeImage: string
      let cookie: string
      try {
        const post = (path: string, body: object) =>
          first.request(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        assert.equal(
          (
            await post('/api/wizard/admin', {
              email: 'seo@example.test',
              username: 'seo',
              password,
            })
          ).status,
          200,
        )
        assert.equal(
          (
            await post('/api/wizard/site', {
              title: 'ChronoFrame 摄影',
              slogan: 'A long bilingual photography story 摄影故事',
              author: 'Fixture',
              avatarUrl: '/web-app-manifest-512x512.png',
            })
          ).status,
          200,
        )
        assert.equal((await post('/api/wizard/complete', {})).status, 200)
        for (const [path, name] of [
          ['/', 'home'],
          ['/public-photo', 'photo'],
        ]) {
          const response = await first.request(path)
          const html = await response.text()
          assert.equal(response.status, 200)
          assert.equal((html.match(/rel="canonical"/g) || []).length, 1)
          assert.equal((html.match(/property="og:image"/g) || []).length, 1)
          assert.match(html, /summary_large_image/)
          const image = imageUrl(html)
          if (name === 'home') homeImage = image
          const result = await first.request(image)
          assert.equal(result.status, 200, first.output())
          assert.match(result.headers.get('content-type') || '', /image\/png/)
          const png = Buffer.from(await result.arrayBuffer())
          assert.equal(png.subarray(1, 4).toString(), 'PNG')
          assert.equal(png.readUInt32BE(16), 1200)
          assert.equal(png.readUInt32BE(20), 600)
          if (process.env.CHRONOFRAME_SEO_ARTIFACT_DIR) {
            await mkdir(process.env.CHRONOFRAME_SEO_ARTIFACT_DIR, {
              recursive: true,
            })
            await writeFile(
              join(process.env.CHRONOFRAME_SEO_ARTIFACT_DIR, `${name}.png`),
              png,
            )
            await writeFile(
              join(process.env.CHRONOFRAME_SEO_ARTIFACT_DIR, `${name}.html`),
              html,
            )
          }
          assert.equal(
            (await first.request(image)).status,
            200,
            'cached image must remain accessible',
          )
          const decodedImage = decodeURIComponent(image)
          assert.match(
            decodedImage,
            /,s_[^,/.]+\.png/,
            'production images must be signed',
          )
          const tampered = decodedImage.replace(
            /,s_[^,/.]+(?=\.png)/,
            ',s_invalid',
          )
          assert.equal(
            (await first.request(tampered)).status,
            403,
            'tampered signature must fail',
          )
        }
        const login = await post('/api/login', {
          email: 'seo@example.test',
          password,
        })
        assert.equal(login.status, 201)
        cookie = login.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; ')
        const authed = await first.request('/', { headers: { cookie } })
        assert.equal(
          imageUrl(await authed.text()),
          homeImage!,
          'signed-in Home previews must still use public photos',
        )
      } finally {
        await stop(first.server)
      }

      const persisted = await readFile(
        join(directory, 'data/.app-secret'),
        'utf8',
      )
      assert.ok(persisted.length >= 32)
      const second = await start(directory)
      try {
        const oldImage =
          new URL(homeImage!).pathname + new URL(homeImage!).search
        assert.equal(
          (await second.request(oldImage)).status,
          200,
          'old signed image must survive restart',
        )
        assert.equal(
          await readFile(join(directory, 'data/.app-secret'), 'utf8'),
          persisted,
        )
        const session = await second.request('/api/_auth/session', {
          headers: { cookie: cookie! },
        })
        assert.ok(
          ((await session.json()) as { user?: unknown }).user,
          'session cookie must remain valid',
        )
      } finally {
        await stop(second.server)
      }

      for (const key of [
        'NUXT_APP_SECRET',
        'NITRO_APP_SECRET',
        'NUXT_OG_IMAGE_SECRET',
      ]) {
        await t.test(
          `${key} signs and validates production OG images`,
          async () => {
            const legacy = key === 'NUXT_OG_IMAGE_SECRET'
            const secretFile = join(directory, 'data/.app-secret')
            // The legacy-only case must not be rescued by a persisted app secret.
            if (legacy) await rm(secretFile)
            const env = {
              ...(key === 'NITRO_APP_SECRET'
                ? { NUXT_APP_SECRET: 'invalid-lower-priority' }
                : {}),
              [key]: 'explicit-test-root'.repeat(4),
            }
            const server = await start(directory, env)
            let imagePath: string
            try {
              const page = await server.request('/')
              assert.equal(page.status, 200)
              const image = new URL(imageUrl(await page.text()))
              imagePath = image.pathname + image.search
              const decoded = decodeURIComponent(imagePath)
              assert.match(decoded, /,s_[^,/.]+\.png/, `${key} must sign URLs`)
              const response = await server.request(imagePath)
              assert.equal(response.status, 200, server.output())
              assert.match(
                response.headers.get('content-type') || '',
                /image\/png/,
              )
              const png = Buffer.from(await response.arrayBuffer())
              assert.equal(png.subarray(1, 4).toString(), 'PNG')
              assert.equal(
                (
                  await server.request(
                    decoded.replace(/,s_[^,/.]+(?=\.png)/, ',s_invalid'),
                  )
                ).status,
                403,
                `${key} must reject tampered signatures`,
              )
              if (legacy) {
                await assert.rejects(readFile(secretFile), { code: 'ENOENT' })
              } else {
                assert.equal(await readFile(secretFile, 'utf8'), persisted)
              }
            } finally {
              await stop(server.server)
            }
            if (legacy) {
              const restarted = await start(directory, env)
              try {
                assert.equal(
                  (await restarted.request(imagePath!)).status,
                  200,
                  'legacy-only signed URLs must survive a production restart',
                )
                await assert.rejects(readFile(secretFile), { code: 'ENOENT' })
              } finally {
                await stop(restarted.server)
              }
            }
          },
        )
      }
    } finally {
      connection.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)

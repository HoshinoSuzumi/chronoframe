import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createHash, hkdfSync } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { openDatabase, tables } from '../../packages/database/src/connection.ts'
import { imageUrl, unusedPort } from '../helpers/seo.ts'

const root = process.cwd()
const password = 'isolated-seo-test-password'
const defaultAppSecret = 'seo-runtime-test-root-secret'.repeat(2)

async function stop(server: ChildProcess) {
  if (server.exitCode !== null) return
  server.kill('SIGTERM')
  await once(server, 'exit')
}

async function spawnServer(
  directory: string,
  envOverrides: NodeJS.ProcessEnv = {},
) {
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
        NUXT_APP_SECRET: defaultAppSecret,
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
  return { server, origin, request, output: () => output }
}

async function start(directory: string, envOverrides: NodeJS.ProcessEnv = {}) {
  const started = await spawnServer(directory, envOverrides)
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await started.request('/api/wizard/schema')
      return started
    } catch {
      if (started.server.exitCode !== null) break
      await delay(50)
    }
  }
  await stop(started.server)
  throw new Error(`Isolated SEO server did not start: ${started.output()}`)
}

async function startFails(
  directory: string,
  envOverrides: NodeJS.ProcessEnv = {},
) {
  const started = await spawnServer(directory, envOverrides)
  const [code] = await once(started.server, 'exit')
  return { code, output: started.output() }
}

async function assertSignedPng(
  request: (path: string, options?: RequestInit) => Promise<Response>,
  image: string,
  output: () => string,
) {
  const imageURL = new URL(image)
  const imagePath = imageURL.pathname + imageURL.search
  const decoded = decodeURIComponent(imagePath)
  assert.match(decoded, /,s_[^,/.]+\.png/)
  const response = await request(imagePath)
  assert.equal(response.status, 200, output())
  assert.match(response.headers.get('content-type') || '', /image\/png/)
  assert.equal(
    (
      await request(decoded.replace(/,s_[^,/.]+(?=\.png)/, ',s_invalid'))
    ).status,
    403,
  )
  return imagePath
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
      .values({
        id: 'public-photo',
        siteId: 1,
        title: 'Photography 摄影',
        description: 'Bilingual photo description',
        width: 640,
        height: 480,
        thumbnailUrl: '/web-app-manifest-512x512.png',
        originalUrl: '/web-app-manifest-512x512.png',
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

        for (const path of ['/', '/public-photo']) {
          const response = await first.request(path)
          const html = await response.text()
          assert.equal(response.status, 200)
          assert.equal((html.match(/rel="canonical"/g) || []).length, 1)
          assert.equal((html.match(/property="og:image"/g) || []).length, 1)
          assert.match(html, /summary_large_image/)
          const image = imageUrl(html)
          if (path === '/') homeImage = image
          await assertSignedPng(first.request, image, first.output)
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

      const missing = await startFails(directory, { NUXT_APP_SECRET: '' })
      assert.notEqual(missing.code, 0)
      assert.match(missing.output, /NUXT_APP_SECRET/)

      const second = await start(directory)
      try {
        const oldImage =
          new URL(homeImage!).pathname + new URL(homeImage!).search
        assert.equal(
          (await second.request(oldImage)).status,
          200,
          'old signed image must survive restart with the same app secret',
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

      await t.test(
        'app secret env precedence signs production OG images',
        async () => {
          for (const [key, env] of [
            [
              'NUXT_APP_SECRET',
              { NUXT_APP_SECRET: 'explicit-test-root'.repeat(4) },
            ],
            [
              'NITRO_APP_SECRET',
              {
                NUXT_APP_SECRET: 'invalid-lower-priority',
                NITRO_APP_SECRET: 'explicit-test-root'.repeat(4),
              },
            ],
            [
              'NUXT_OG_IMAGE_SECRET',
              {
                NUXT_APP_SECRET: '',
                NUXT_OG_IMAGE_SECRET: 'explicit-test-root'.repeat(4),
              },
            ],
          ] as const) {
            const server = await start(directory, env)
            try {
              const page = await server.request('/')
              assert.equal(page.status, 200, `${key} must serve Home`)
              await assertSignedPng(
                server.request,
                imageUrl(await page.text()),
                server.output,
              )
            } finally {
              await stop(server.server)
            }
          }

          const beforeSecret = 'before-rotation-secret'.repeat(3)
          const rotatedSecret = 'rotated-explicit-test-secret'.repeat(3)
          const before = await start(directory, {
            NUXT_APP_SECRET: beforeSecret,
          })
          let imagePath: string
          try {
            const page = await before.request('/')
            assert.equal(page.status, 200)
            imagePath = await assertSignedPng(
              before.request,
              imageUrl(await page.text()),
              before.output,
            )
          } finally {
            await stop(before.server)
          }
          const rotated = await start(directory, {
            NUXT_APP_SECRET: rotatedSecret,
          })
          try {
            assert.equal(
              (await rotated.request(imagePath!)).status,
              403,
              'secret rotation must reject URLs signed with the old secret',
            )
            const page = await rotated.request('/')
            assert.equal(page.status, 200)
            const rotatedPath = await assertSignedPng(
              rotated.request,
              imageUrl(await page.text()),
              rotated.output,
            )
            assert.notEqual(rotatedPath, imagePath!)
            const signed = decodeURIComponent(
              new URL(rotatedPath, 'http://127.0.0.1').pathname,
            ).match(/^\/_og\/d\/(.+),s_([^,/.]+)\.png$/)
            assert.ok(signed)
            const signingKey = Buffer.from(
              hkdfSync(
                'sha256',
                rotatedSecret,
                'nuxt',
                'nuxt-og-image:url-signing',
                32,
              ),
            ).toString('hex')
            assert.equal(
              signed[2],
              createHash('sha256')
                .update(`${signingKey}:${signed[1]}`)
                .digest('base64url')
                .slice(0, 16),
            )
          } finally {
            await stop(rotated.server)
          }
        },
      )
    } finally {
      connection.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)

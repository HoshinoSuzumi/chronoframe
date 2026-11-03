import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { openDatabase, tables } from '../../packages/database/src/connection.ts'

const root = process.cwd()

async function unusedPort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  server.close()
  await once(server, 'close')
  return address.port
}

test(
  'self-hosted populated albums render on direct requests and preserve slug redirects',
  { timeout: 45_000 },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'chronoframe-album-http-'))
    const filename = join(temporary, 'albums.sqlite3')
    const migrationsFolder = join(root, 'packages/database/migrations')
    const connection = openDatabase({ filename, migrationsFolder })
    try {
      const visible = connection.db
        .insert(tables.albums)
        .values({
          title: 'Visible Album',
          description: 'Populated album SSR regression',
        })
        .returning({ id: tables.albums.id })
        .get()
      const photoId = 'album-ssr-photo'
      connection.db
        .insert(tables.photos)
        .values({
          id: photoId,
          siteId: 1,
          title: 'SSR photo',
          width: 640,
          height: 480,
          aspectRatio: 0.75,
          thumbnailUrl: '/favicon.ico',
          originalUrl: '/favicon.ico',
        })
        .run()
      connection.db
        .insert(tables.albumPhotos)
        .values({
          siteId: 1,
          albumId: visible.id,
          photoId,
          position: 0,
        })
        .run()
      connection.db
        .insert(tables.albumSlugs)
        .values([
          {
            siteId: 1,
            albumId: visible.id,
            slug: 'old-visible',
            isCurrent: false,
          },
          {
            siteId: 1,
            albumId: visible.id,
            slug: 'visible-album',
            isCurrent: true,
          },
        ])
        .run()
      const hidden = connection.db
        .insert(tables.albums)
        .values({ title: 'Hidden Album', isHidden: true })
        .returning({ id: tables.albums.id })
        .get()
      connection.db
        .insert(tables.albumSlugs)
        .values({
          siteId: 1,
          albumId: hidden.id,
          slug: 'hidden-album',
          isCurrent: true,
        })
        .run()
      const port = await unusedPort()
      const base = `http://127.0.0.1:${port}`
      const server = spawn(
        process.execPath,
        [join(root, 'apps/self-hosted/.output/server/index.mjs')],
        {
          cwd: root,
          env: {
            ...process.env,
            DATABASE_URL: filename,
            DATABASE_MIGRATIONS: migrationsFolder,
            NUXT_SESSION_PASSWORD: '0123456789abcdef0123456789abcdef',
            NITRO_PORT: String(port),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      let output = ''
      for (const stream of [server.stdout, server.stderr])
        stream.on('data', (chunk) => {
          output = (output + chunk.toString()).slice(-4000)
        })
      try {
        let ready = false
        for (let attempt = 0; attempt < 200; attempt++) {
          try {
            await fetch(`${base}/api/wizard/schema`, {
              signal: AbortSignal.timeout(500),
            })
            ready = true
            break
          } catch {
            if (server.exitCode !== null) break
            await delay(100)
          }
        }
        assert.ok(ready, `Built server did not start: ${output}`)

        const request = (path: string, options?: RequestInit) =>
          fetch(`${base}${path}`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
            ...options,
          })
        const jsonPost = (path: string, body: object) =>
          request(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        assert.equal(
          (
            await jsonPost('/api/wizard/admin', {
              email: 'admin@example.test',
              username: 'admin',
              password: 'test-password-123',
            })
          ).status,
          200,
        )
        assert.equal((await jsonPost('/api/wizard/complete', {})).status, 200)

        const slugless = connection.db
          .insert(tables.albums)
          .values({ title: 'Slugless Album' })
          .returning({ id: tables.albums.id })
          .get()

        const albumResponse = await request(`/api/albums/${visible.id}`)
        assert.equal(albumResponse.status, 200, output)
        const album = (await albumResponse.json()) as {
          photos: { id: string }[]
        }
        assert.ok(album.photos.some((photo) => photo.id === photoId))
        const canonical = await request('/albums/visible-album')
        const html = await canonical.text()
        assert.equal(canonical.status, 200, `${html}\n${output}`)
        assert.match(html, /<h1[^>]*>Visible Album<\/h1>/, output)
        assert.match(html, /Populated album SSR regression/, output)
        assert.doesNotMatch(
          html,
          /Cannot redefine property|Failed to load album/i,
          output,
        )
        assert.equal((await request(`/albums/${slugless.id}`)).status, 200)
        assert.equal((await request('/')).status, 200, output)
        const numeric = await request(`/albums/${visible.id}`)
        assert.equal(numeric.status, 301)
        assert.equal(numeric.headers.get('location'), '/albums/visible-album')
        const historical = await request('/albums/old-visible?photo=x')
        assert.equal(historical.status, 302)
        assert.equal(
          historical.headers.get('location'),
          '/albums/visible-album?photo=x',
        )
        const trailing = await request('/albums/visible-album/')
        assert.equal(trailing.status, 301)
        assert.equal(trailing.headers.get('location'), '/albums/visible-album')
        assert.equal((await request('/albums/hidden-album')).status, 404)

        // This upload control is rendered by the photos page inside the admin layout.
        const photoPageMarker = /<button\b[^>]*\bdata-tour="photo-upload"/
        const guestConsole = await request('/dashboard/photos')
        assert.equal(guestConsole.status, 200, output)
        assert.doesNotMatch(await guestConsole.text(), photoPageMarker, output)

        const login = await jsonPost('/api/login', {
          email: 'admin@example.test',
          password: 'test-password-123',
        })
        assert.equal(login.status, 201)
        const cookie = login.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; ')
        assert.ok(cookie)
        const consolePage = await request('/dashboard/photos', {
          headers: { cookie },
        })
        const consoleHtml = await consolePage.text()
        assert.equal(consolePage.status, 200, `${consoleHtml}\n${output}`)
        assert.match(consoleHtml, photoPageMarker, `${consoleHtml}\n${output}`)
        assert.doesNotMatch(consoleHtml, /Cannot redefine property/i, output)
        assert.equal(
          (await request('/albums/hidden-album', { headers: { cookie } }))
            .status,
          200,
        )
        const reuse = await request(`/api/albums/${visible.id}`, {
          method: 'PUT',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ slug: 'old-visible' }),
        })
        assert.equal(reuse.status, 200)
        assert.equal((await request('/albums/old-visible')).status, 200)
        const oldCanonical = await request('/albums/visible-album')
        assert.equal(oldCanonical.status, 302)
        assert.equal(
          oldCanonical.headers.get('location'),
          '/albums/old-visible',
        )
      } finally {
        if (server.exitCode === null) {
          server.kill('SIGINT')
          await once(server, 'exit')
        }
      }
    } finally {
      connection.close()
      await rm(temporary, { recursive: true, force: true })
    }
  },
)

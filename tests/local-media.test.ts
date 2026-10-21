import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApp, eventHandler, toNodeListener } from 'h3'
import {
  resolveLocalMediaPath,
  serveLocalMedia,
} from '../apps/self-hosted/server/utils/local-media.ts'

test('Local media stays within its real storage root, including symlink targets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-media-'))
  const outside = await mkdtemp(path.join(tmpdir(), 'outside-media-'))
  const config = { provider: 'local' as const, basePath: root }
  try {
    await writeFile(path.join(root, '照片.jpg'), 'photo')
    await writeFile(path.join(outside, 'secret.jpg'), 'secret')
    await symlink(outside, path.join(root, 'escape'))
    assert.equal(
      await resolveLocalMediaPath(config, '照片.jpg'),
      path.join(root, '照片.jpg'),
    )
    for (const key of [
      '../secret.jpg',
      '/secret.jpg',
      'a/../secret.jpg',
      './照片.jpg',
      'a\\secret.jpg',
      'a//b',
    ]) {
      await assert.rejects(
        resolveLocalMediaPath(config, key),
        (error: any) => error.statusCode === 400,
      )
    }
    await assert.rejects(
      resolveLocalMediaPath(config, 'escape/secret.jpg'),
      (error: any) => error.statusCode === 404,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('authorized Local responses preserve ranges and private caching without trusting Host', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-response-'))
  await writeFile(path.join(root, 'video.mp4'), '0123456789')
  const app = createApp()
  app.use(
    eventHandler((event) =>
      serveLocalMedia(
        event,
        { provider: 'local', basePath: root },
        'video.mp4',
        true,
      ),
    ),
  )
  const server = createServer(toNodeListener(app))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  try {
    const headers = {
      Host: 'unreachable.example:65530',
      'x-forwarded-proto': 'https',
    }
    const full = await fetch(url, { headers })
    assert.equal(full.status, 200)
    assert.equal(await full.text(), '0123456789')
    assert.equal(full.headers.get('content-type'), 'video/mp4')
    assert.equal(full.headers.get('cache-control'), 'private, no-store')
    for (const [range, text, contentRange] of [
      ['bytes=2-4', '234', 'bytes 2-4/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=8-', '89', 'bytes 8-9/10'],
      ['bytes=8-50', '89', 'bytes 8-9/10'],
    ]) {
      const response = await fetch(url, {
        headers: { ...headers, range: range! },
      })
      assert.equal(response.status, 206)
      assert.equal(await response.text(), text)
      assert.equal(response.headers.get('content-range'), contentRange)
    }
    const unsatisfiable = await fetch(url, { headers: { range: 'bytes=99-' } })
    assert.equal(unsatisfiable.status, 416)
    assert.equal(unsatisfiable.headers.get('content-range'), 'bytes */10')
    const stale = await fetch(url, {
      headers: {
        range: 'bytes=1-2',
        'if-range': 'Thu, 01 Jan 1970 00:00:00 GMT',
      },
    })
    assert.equal(stale.status, 200)
    await stale.arrayBuffer()
    const cached = await fetch(url, {
      headers: { 'if-none-match': full.headers.get('etag')! },
    })
    assert.equal(cached.status, 304)
    assert.equal(cached.headers.get('cache-control'), 'private, no-store')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

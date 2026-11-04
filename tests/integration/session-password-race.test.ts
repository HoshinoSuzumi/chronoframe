import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'

const root = process.cwd()
const credentials = {
  email: 'admin@example.test',
  password: 'test-password-123',
}

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

async function stop(server: ChildProcess) {
  if (server.exitCode !== null) return
  server.kill()
  await once(server, 'exit')
}

// Starts the built server without NUXT_SESSION_PASSWORD and fires the first
// request the moment the listener accepts connections.
async function startWithEarlyRequest(workdir: string, port: number) {
  const env = { ...process.env }
  delete env.NUXT_SESSION_PASSWORD
  const server = spawn(
    process.execPath,
    [join(root, 'apps/self-hosted/.output/server/index.mjs')],
    {
      cwd: workdir,
      env: {
        ...env,
        DATABASE_URL: join(workdir, 'app.sqlite3'),
        DATABASE_MIGRATIONS: join(root, 'packages/database/migrations'),
        NITRO_PORT: String(port),
        NITRO_HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-4000)
    })
  for (let attempt = 0; attempt < 2000; attempt++) {
    try {
      const early = await fetch(`http://127.0.0.1:${port}/api/_auth/session`, {
        signal: AbortSignal.timeout(2000),
      })
      return { server, early }
    } catch {
      if (server.exitCode !== null) break
      await delay(5)
    }
  }
  await stop(server)
  throw new Error(`Built server did not start: ${output}`)
}

test(
  'an early request cannot break session handling with or without a persisted key',
  { timeout: 90_000 },
  async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'chronoframe-session-race-'))
    const base = (port: number) => `http://127.0.0.1:${port}`
    const post = (port: number, path: string, body: object) =>
      fetch(`${base(port)}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
    try {
      // Cold start: no key file exists yet.
      const firstPort = await unusedPort()
      const first = await startWithEarlyRequest(workdir, firstPort)
      let cookie: string
      try {
        assert.equal(first.early.status, 200)
        assert.equal(
          (await post(firstPort, '/api/wizard/admin', credentials)).status,
          200,
        )
        const login = await post(firstPort, '/api/login', credentials)
        assert.equal(login.status, 201, await login.text())
        cookie = login.headers.getSetCookie()[0].split(';')[0]
      } finally {
        await stop(first.server)
      }
      assert.ok(
        (await readFile(join(workdir, 'data/.session-password'), 'utf8')).trim()
          .length >= 32,
      )

      // Warm restart: the key file exists and the old cookie must stay valid.
      const secondPort = await unusedPort()
      const second = await startWithEarlyRequest(workdir, secondPort)
      try {
        assert.equal(second.early.status, 200)
        const login = await post(secondPort, '/api/login', credentials)
        assert.equal(login.status, 201, await login.text())
        const session = await fetch(`${base(secondPort)}/api/_auth/session`, {
          headers: { cookie },
          signal: AbortSignal.timeout(5000),
        })
        const body = (await session.json()) as { user?: unknown }
        assert.ok(body.user, 'old session cookie should remain valid')
      } finally {
        await stop(second.server)
      }
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  },
)

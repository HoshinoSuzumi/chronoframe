import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const entry = process.argv[2]
if (!['cloud', 'site'].includes(entry))
  throw new Error('Expected cloud or site')
const port = entry === 'cloud' ? 8787 : 8788
const originHost = process.env.CHRONOFRAME_SMOKE_HOST
const portalOrigin = originHost === 'app.chronoframe.art'
const require = createRequire(import.meta.url)
const cli = resolve(
  dirname(require.resolve('wrangler/package.json')),
  'bin/wrangler.js',
)
const worker = spawn(
  process.execPath,
  [
    cli,
    'dev',
    '--local',
    ...(originHost ? ['--local-upstream', originHost] : []),
    '--config',
    `apps/${entry}/.output/server/wrangler.json`,
    '--port',
    String(port),
    '--ip',
    '127.0.0.1',
    '--show-interactive-dev-session=false',
  ],
  {
    cwd: root,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let output = ''
for (const stream of [worker.stdout, worker.stderr])
  stream.on('data', (chunk) => {
    output = (output + chunk).slice(-16000)
  })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (worker.exitCode !== null) throw new Error(`Worker exited: ${output}`)
    const response = await fetch(base + '/api/health', {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null)
    if (response?.ok) {
      assert.deepEqual(await response.json(), {
        service: `chronoframe-${entry}`,
        status: 'bootstrap',
      })
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.ok(ready, output)
  for (const endpoint of [
    '/api/photos',
    '/api/photos/visible',
    '/api/system/settings/all',
    '/api/wizard/submit',
    '/api/_auth/session',
    '/API/_auth/session',
    '/%61pi/_auth/session',
  ]) {
    const response = await fetch(base + endpoint, {
      headers: { cookie: 'nuxt-session=untrusted-self-hosted-cookie' },
    })
    assert.equal(response.status, 503, endpoint)
    assert.equal(response.headers.get('cache-control'), 'no-store', endpoint)
  }
  const home = await fetch(base, { redirect: 'manual' })
  assert.equal(
    home.status,
    entry === 'cloud' ? (portalOrigin ? 302 : 200) : 503,
  )
  const html = await home.text()
  if (!portalOrigin)
    assert.match(
      html,
      entry === 'cloud' ? /Every frame\./ : /service unavailable/i,
    )
  if (entry === 'cloud') {
    assert.equal((await fetch(base + '/signin')).status, 200)
    const dashboard = await fetch(base + '/dashboard/photos', {
      redirect: 'manual',
    })
    assert.equal(dashboard.status, 302)
    assert.ok(
      ['/sites', '/signin'].includes(
        new URL(dashboard.headers.get('location'), base).pathname,
      ),
    )
    assert.equal(
      (await fetch(base + '/DASHBOARD', { redirect: 'manual' })).status,
      302,
    )
    assert.equal(
      (await fetch(base + '/sites', { redirect: 'manual' })).status,
      302,
    )
    assert.equal((await fetch(base + '/albums')).status, 404)
    if (portalOrigin) {
      assert.ok(
        ['/sites', '/signin'].includes(
          new URL(home.headers.get('location'), base).pathname,
        ),
      )
    }
    if (originHost === 'chronoframe.art') {
      const links = [...html.matchAll(/\bhref="([^"]*)"/g)]
      assert.ok(
        links.some(([, href]) => href === 'https://app.chronoframe.art/signin'),
        'Marketing sign-in link must target the exact portal URL',
      )
      const forgedPortal = await fetch(base, {
        headers: { 'x-forwarded-host': 'app.chronoframe.art' },
        redirect: 'manual',
      })
      assert.equal(forgedPortal.status, 200)
    }
  } else {
    assert.equal((await fetch(base + '/albums')).status, 503)
    // Administrative redirects require a published Host and configured platform data.
    for (const path of ['/dashboard', '/admin'])
      assert.equal(
        (await fetch(base + path, { redirect: 'manual' })).status,
        503,
      )
  }
  console.log(
    `PASS ${entry}: actual workerd SSR, entry routes, unavailable platform APIs, and Self-hosted session isolation`,
  )
} catch (error) {
  console.error(output)
  throw error
} finally {
  worker.kill('SIGTERM')
  await new Promise((resolve) => {
    if (worker.exitCode !== null) return resolve()
    worker.once('exit', resolve)
    setTimeout(() => {
      worker.kill('SIGKILL')
      resolve()
    }, 5000).unref()
  })
}

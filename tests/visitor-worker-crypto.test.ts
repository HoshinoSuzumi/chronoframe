import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { pbkdf2Sync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { VISITOR_PBKDF2_ITERATIONS } from '../apps/shared/platform/crypto.ts'

test('visitor password hashing stays within the portable Workers budget and executes in workerd', async () => {
  assert.ok(
    VISITOR_PBKDF2_ITERATIONS > 0 && VISITOR_PBKDF2_ITERATIONS <= 100_000,
  )
  const require = createRequire(import.meta.url)
  const wranglerRequire = createRequire(
    require.resolve('wrangler/package.json'),
  )
  const { build } = wranglerRequire('esbuild')
  const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')
  const module = fileURLToPath(
    new URL('../apps/shared/platform/crypto.ts', import.meta.url),
  )
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      contents: `import {visitorPasswordHash} from ${JSON.stringify(module)};export default {async fetch(){return Response.json({hash:await visitorPasswordHash('test-password','unique-test-salt')})}}`,
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  })
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-22',
      script: bundle.outputFiles[0].text,
    }),
  )
  try {
    const result = await mf.dispatchFetch('http://worker.example.com')
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), {
      hash: pbkdf2Sync(
        'test-password',
        'unique-test-salt',
        VISITOR_PBKDF2_ITERATIONS,
        32,
        'sha256',
      ).toString('hex'),
    })
  } finally {
    await mf.dispose()
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareSelfHostedRuntime } from '../apps/self-hosted/build/prepare-runtime.mjs'

function withServerDir(
  run: (serverDir: string, root: string) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'chronoframe-prepare-runtime-'))
  const serverDir = join(root, 'server')
  mkdirSync(serverDir)
  return run(serverDir, root).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  )
}

test('prepared entry preserves named exports alongside the default export', async () => {
  await withServerDir(async (serverDir, root) => {
    writeFileSync(
      join(serverDir, 'index.mjs'),
      `export const marker = 'named-export-ok'
export const seenSecret = process.env.NUXT_APP_SECRET
export default { kind: 'default-export' }
`,
    )
    await prepareSelfHostedRuntime(serverDir)
    mkdirSync(join(root, 'data'))
    const secret = 'preview-runtime-secret-32chars!!'
    writeFileSync(join(root, 'data/.app-secret'), secret)
    const previous = process.cwd()
    const previousNitro = process.env.NITRO_APP_SECRET
    const previousNuxt = process.env.NUXT_APP_SECRET
    const previousLegacy = process.env.NUXT_OG_IMAGE_SECRET
    delete process.env.NITRO_APP_SECRET
    delete process.env.NUXT_APP_SECRET
    delete process.env.NUXT_OG_IMAGE_SECRET
    process.chdir(root)
    try {
      const mod = await import(
        `${pathToFileURL(join(serverDir, 'index.mjs')).href}?t=${Date.now()}`
      )
      assert.equal(mod.marker, 'named-export-ok')
      assert.equal(JSON.parse(mod.seenSecret), secret)
      assert.deepEqual(mod.default, { kind: 'default-export' })
    } finally {
      process.chdir(previous)
      if (previousNitro === undefined) delete process.env.NITRO_APP_SECRET
      else process.env.NITRO_APP_SECRET = previousNitro
      if (previousNuxt === undefined) delete process.env.NUXT_APP_SECRET
      else process.env.NUXT_APP_SECRET = previousNuxt
      if (previousLegacy === undefined) delete process.env.NUXT_OG_IMAGE_SECRET
      else process.env.NUXT_OG_IMAGE_SECRET = previousLegacy
    }
  })
})

test('a later prepare rewrites a stale wrapper when index.runtime.mjs already exists', async () => {
  await withServerDir(async (serverDir) => {
    writeFileSync(
      join(serverDir, 'index.mjs'),
      `export const marker = 'fresh'
export default { ok: true }
`,
    )
    await prepareSelfHostedRuntime(serverDir)
    const current = readFileSync(join(serverDir, 'index.mjs'), 'utf8')
    assert.match(current, /export \* from '\.\/index\.runtime\.mjs'/)
    writeFileSync(
      join(serverDir, 'index.mjs'),
      `// ChronoFrame private app-secret bootstrap
export default (await import('./index.runtime.mjs')).default
`,
    )
    await prepareSelfHostedRuntime(serverDir)
    const regenerated = readFileSync(join(serverDir, 'index.mjs'), 'utf8')
    assert.equal(regenerated, current)
    assert.match(regenerated, /export \* from '\.\/index\.runtime\.mjs'/)
    assert.match(
      regenerated,
      /export \{ default \} from '\.\/index\.runtime\.mjs'/,
    )
    assert.equal(
      readFileSync(join(serverDir, 'index.runtime.mjs'), 'utf8'),
      `export const marker = 'fresh'
export default { ok: true }
`,
    )
  })
})

test('a fresh Nitro entry replaces a stale runtime snapshot', async () => {
  await withServerDir(async (serverDir) => {
    writeFileSync(
      join(serverDir, 'index.runtime.mjs'),
      `export const marker = 'stale'
export default { stale: true }
`,
    )
    writeFileSync(
      join(serverDir, 'index.mjs'),
      `export const marker = 'fresh'
export default { fresh: true }
`,
    )
    await prepareSelfHostedRuntime(serverDir)
    const runtime = readFileSync(join(serverDir, 'index.runtime.mjs'), 'utf8')
    assert.match(runtime, /marker = 'fresh'/)
    assert.doesNotMatch(runtime, /stale/)
    const entry = readFileSync(join(serverDir, 'index.mjs'), 'utf8')
    assert.match(entry, /export \* from '\.\/index\.runtime\.mjs'/)
  })
})

test('an existing wrapper without its runtime entry fails loudly', async () => {
  await withServerDir(async (serverDir) => {
    writeFileSync(
      join(serverDir, 'index.mjs'),
      `// ChronoFrame private app-secret bootstrap
export default {}
`,
    )
    await assert.rejects(
      prepareSelfHostedRuntime(serverDir),
      /index\.runtime\.mjs is missing/,
    )
  })
})

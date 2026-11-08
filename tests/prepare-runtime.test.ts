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

function withServerDir(run: (serverDir: string, root: string) => Promise<void>) {
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
export default { kind: 'default-export' }
`,
    )
    await prepareSelfHostedRuntime(serverDir)
    mkdirSync(join(root, 'data'))
    writeFileSync(join(root, 'data/.app-secret'), 'preview-runtime-secret-32chars!!')
    const previous = process.cwd()
    process.chdir(root)
    try {
      const mod = await import(
        `${pathToFileURL(join(serverDir, 'index.mjs')).href}?t=${Date.now()}`
      )
      assert.equal(mod.marker, 'named-export-ok')
      assert.deepEqual(mod.default, { kind: 'default-export' })
    } finally {
      process.chdir(previous)
      delete process.env.NITRO_APP_SECRET
      delete process.env.NUXT_APP_SECRET
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
    assert.match(regenerated, /export \{ default \} from '\.\/index\.runtime\.mjs'/)
    assert.equal(
      readFileSync(join(serverDir, 'index.runtime.mjs'), 'utf8'),
      `export const marker = 'fresh'
export default { ok: true }
`,
    )
  })
})

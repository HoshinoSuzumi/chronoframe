import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { ensureAppSecret } from '../apps/self-hosted/server/utils/app-secret.mjs'
import { prepareSelfHostedRuntime } from '../apps/self-hosted/build/prepare-runtime.mjs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync } from 'node:fs'

function fixture(run: (file: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'chronoframe-app-secret-'))
  try {
    run(join(directory, 'data/.app-secret'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('an app secret persists privately across restarts without changing sessions', () => {
  fixture((file) => {
    const env = { NUXT_SESSION_PASSWORD: 'session'.repeat(8) }
    const first = ensureAppSecret(file, env)
    assert.equal(first.source, 'generated')
    const stored = readFileSync(file, 'utf8')
    assert.ok(stored.length >= 32)
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.equal(env.NUXT_SESSION_PASSWORD, 'session'.repeat(8))
    assert.equal(ensureAppSecret(file, {}).secret, stored)
    assert.equal(ensureAppSecret(file, {}).source, 'file')
  })
})

test('explicit app secrets take precedence and create no file', () => {
  fixture((file) => {
    const secret = 'n'.repeat(32)
    assert.deepEqual(
      ensureAppSecret(file, {
        NUXT_APP_SECRET: secret,
        NUXT_OG_IMAGE_SECRET: 'legacy'.repeat(8),
      }),
      { secret, source: 'env' },
    )
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
  })
})

test('Nitro app secret precedes Nuxt, legacy and persisted secrets without creating a file', () => {
  fixture((file) => {
    const secret = 'nitro-secret'.repeat(4)
    const env = {
      NITRO_APP_SECRET: JSON.stringify(secret),
      NUXT_APP_SECRET: 'invalid-lower-priority',
      NUXT_OG_IMAGE_SECRET: 'legacy'.repeat(8),
    }
    assert.deepEqual(ensureAppSecret(file, env), { secret, source: 'env' })
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, 'invalid-persisted-secret')
    assert.equal(ensureAppSecret(file, env).secret, secret)
    assert.equal(readFileSync(file, 'utf8'), 'invalid-persisted-secret')
    assert.equal(
      ensureAppSecret(file, {
        ...env,
        NUXT_APP_SECRET: 'nuxt-secret'.repeat(4),
      }).secret,
      secret,
    )
  })
})

test('invalid Nitro app secrets fail before lower-priority secrets without leaking values', () => {
  fixture((file) => {
    for (const value of [
      '',
      'short-nitro-value',
      'x'.repeat(31),
      '1'.repeat(40),
      JSON.stringify(['private'.repeat(8)]),
    ]) {
      assert.throws(
        () =>
          ensureAppSecret(file, {
            NITRO_APP_SECRET: value,
            NUXT_APP_SECRET: 'valid-nuxt-secret'.repeat(4),
            NUXT_OG_IMAGE_SECRET: 'valid-legacy-secret'.repeat(4),
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /NITRO_APP_SECRET.*(?:32|string)/)
          if (value) assert.ok(!error.message.includes(value))
          return true
        },
      )
    }
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
  })
})

test('the legacy OG key stays intact without generating a replacement', () => {
  fixture((file) => {
    const secret = 'legacy-root'.repeat(8)
    const env = { NUXT_OG_IMAGE_SECRET: secret }
    assert.deepEqual(ensureAppSecret(file, env), { secret, source: 'legacy' })
    assert.deepEqual(env, { NUXT_OG_IMAGE_SECRET: secret })
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
  })
})

test('app-secret environment values follow Nitro string parsing and reject non-string JSON', () => {
  fixture((file) => {
    const secret = 'quoted-root'.repeat(5)
    assert.equal(
      ensureAppSecret(file, { NUXT_APP_SECRET: JSON.stringify(secret) }).secret,
      secret,
    )
    for (const value of ['1'.repeat(40), JSON.stringify(['a'.repeat(40)])])
      assert.throws(
        () => ensureAppSecret(file, { NUXT_APP_SECRET: value }),
        /string/,
      )
    assert.equal(
      ensureAppSecret(file, { NUXT_OG_IMAGE_SECRET: '1'.repeat(40) }).secret,
      '1'.repeat(40),
      'the legacy fallback is read directly, without Nitro JSON parsing',
    )
  })
})

test('invalid explicit secrets fail without exposing their values or falling back', () => {
  fixture((file) => {
    for (const env of [
      {
        NUXT_APP_SECRET: 'private-short-value',
        NUXT_OG_IMAGE_SECRET: 'valid'.repeat(12),
      },
      { NUXT_OG_IMAGE_SECRET: 'private-short-value' },
      { NUXT_APP_SECRET: 'x'.repeat(31) },
      { NUXT_OG_IMAGE_SECRET: 'x'.repeat(31) },
    ]) {
      assert.throws(
        () => ensureAppSecret(file, env),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /at least 32/)
          assert.doesNotMatch(error.message, /private-short-value/)
          return true
        },
      )
    }
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
  })
})

test('invalid stored keys and filesystem errors fail instead of silently rotating', () => {
  fixture((file) => {
    ensureAppSecret(file, {})
    writeFileSync(file, 'short')
    assert.throws(() => ensureAppSecret(file, {}), /app-secret/)
    assert.equal(readFileSync(file, 'utf8'), 'short')
    assert.throws(() => ensureAppSecret(join(file, 'nested'), {}))
  })
})

test('the production entry initializes a single root before frozen config imports, including concurrent starts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'chronoframe-secret-entry-'))
  try {
    const serverDir = join(directory, 'server')
    mkdirSync(serverDir)
    writeFileSync(
      join(serverDir, 'index.mjs'),
      `
      import { createHash } from 'node:crypto'
      let appSecret = process.env.NITRO_APP_SECRET ?? process.env.NUXT_APP_SECRET
      try { appSecret = JSON.parse(appSecret) } catch {}
      const config = Object.freeze({ appSecret })
      if (typeof config.appSecret !== 'string' || config.appSecret.length < 32) throw new Error('Root missing before config initialization')
      process.stdout.write(createHash('sha256').update(config.appSecret).digest('hex'))
      export default config
    `,
    )
    await prepareSelfHostedRuntime(serverDir)
    const wrapped = readFileSync(join(serverDir, 'index.mjs'), 'utf8')
    await prepareSelfHostedRuntime(serverDir)
    assert.equal(readFileSync(join(serverDir, 'index.mjs'), 'utf8'), wrapped)
    const env = { ...process.env }
    delete env.NITRO_APP_SECRET
    delete env.NUXT_APP_SECRET
    delete env.NUXT_OG_IMAGE_SECRET
    const start = async (overrides: NodeJS.ProcessEnv = {}) => {
      const child = spawn(process.execPath, [join(serverDir, 'index.mjs')], {
        cwd: directory,
        env: { ...env, ...overrides },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = '',
        errors = ''
      child.stdout.on('data', (chunk) => {
        output += chunk
      })
      child.stderr.on('data', (chunk) => {
        errors += chunk
      })
      const [code] = await once(child, 'exit')
      assert.equal(code, 0, errors)
      return output
    }
    const hashes = await Promise.all(Array.from({ length: 8 }, start))
    assert.equal(new Set(hashes).size, 1)
    assert.match(hashes[0], /^[a-f0-9]{64}$/)
    assert.equal(
      await start(),
      hashes[0],
      'restart must reuse the persisted root',
    )
    // A persisted string must not become a number through Nitro's env parsing.
    writeFileSync(join(directory, 'data/.app-secret'), '1'.repeat(40))
    assert.match(await start(), /^[a-f0-9]{64}$/)
    const nitroSecret = 'nitro-bootstrap-secret'.repeat(3)
    assert.equal(
      await start({
        NITRO_APP_SECRET: JSON.stringify(nitroSecret),
        NUXT_APP_SECRET: 'invalid-nuxt-secret',
      }),
      createHash('sha256').update(nitroSecret).digest('hex'),
      'bootstrap must validate the secret Nitro actually selects before config freezes',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

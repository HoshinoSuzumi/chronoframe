import assert from 'node:assert/strict'
import {
  resolveAppSecretCandidate,
  validateAppSecret as validateSharedAppSecret,
} from '../scripts/app-secret-validation.mjs'
import fs from 'node:fs'
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import test, { type TestContext } from 'node:test'
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

function publicationMocks(t: TestContext) {
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  })
}

test('mounts rejecting hard links publish a complete private key through a relative symlink', (t) => {
  publicationMocks(t)
  let code = ''
  t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('Hard links unavailable'), { code })
  })
  const symlink = fs.symlinkSync
  t.mock.method(fs, 'symlinkSync', (...args: Parameters<typeof symlink>) => {
    const candidate = join(dirname(String(args[1])), String(args[0]))
    assert.ok(readFileSync(candidate, 'utf8').length >= 32)
    if (process.platform !== 'win32')
      assert.equal(statSync(candidate).mode & 0o777, 0o600)
    assert.throws(() => lstatSync(args[1]), { code: 'ENOENT' })
    return symlink(...args)
  })
  syncBuiltinESMExports()
  for (code of ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']) {
    fixture((file) => {
      const result = ensureAppSecret(file, {})
      assert.equal(result.source, 'generated')
      assert.equal(readFileSync(file, 'utf8'), result.secret)
      assert.ok(lstatSync(file).isSymbolicLink())
      if (process.platform !== 'win32')
        assert.equal(statSync(file).mode & 0o777, 0o600)
      assert.match(readlinkSync(file), /^\.app-secret\.[a-f0-9]+\.key$/)
      assert.deepEqual(
        readdirSync(dirname(file)).sort(),
        ['.app-secret', readlinkSync(file)].sort(),
      )
      assert.deepEqual(ensureAppSecret(file, {}), {
        secret: result.secret,
        source: 'file',
      })
      const moved = join(dirname(dirname(file)), 'moved-data')
      renameSync(dirname(file), moved)
      assert.equal(
        ensureAppSecret(join(moved, '.app-secret'), {}).secret,
        result.secret,
      )
    })
  }
})

test('the fallback reuses a concurrent winner without replacing it or retaining the losing key', (t) => {
  publicationMocks(t)
  const winner = 'concurrent-winner'.repeat(4)
  t.mock.method(fs, 'linkSync', (_candidate: string, file: string) => {
    writeFileSync(file, winner, { flag: 'wx', mode: 0o600 })
    throw Object.assign(new Error('Hard links unavailable'), { code: 'EPERM' })
  })
  syncBuiltinESMExports()
  fixture((file) => {
    assert.deepEqual(ensureAppSecret(file, {}), {
      secret: winner,
      source: 'file',
    })
    assert.equal(readFileSync(file, 'utf8'), winner)
    assert.deepEqual(readdirSync(dirname(file)), ['.app-secret'])
    if (process.platform !== 'win32')
      assert.equal(statSync(file).mode & 0o777, 0o600)
  })
})

test('unrelated publication errors propagate without invoking the fallback', (t) => {
  publicationMocks(t)
  let code = ''
  t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('Publication failed'), { code })
  })
  const fallback = t.mock.method(fs, 'symlinkSync')
  syncBuiltinESMExports()
  for (code of ['EACCES', 'EIO', 'ENOSPC', 'EXDEV']) {
    fixture((file) => {
      assert.throws(() => ensureAppSecret(file, {}), { code })
      assert.deepEqual(readdirSync(dirname(file)), [])
    })
  }
  assert.equal(fallback.mock.callCount(), 0)
})

test('failed symlink publication stops startup and removes the unpublished key', (t) => {
  publicationMocks(t)
  t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('Hard links unavailable'), {
      code: 'ENOTSUP',
    })
  })
  t.mock.method(fs, 'symlinkSync', () => {
    throw Object.assign(new Error('Symlinks unavailable'), { code: 'EPERM' })
  })
  syncBuiltinESMExports()
  fixture((file) => {
    assert.throws(() => ensureAppSecret(file, {}), { code: 'EPERM' })
    assert.deepEqual(readdirSync(dirname(file)), [])
  })
})

test('an app secret persists privately across restarts without changing sessions', () => {
  fixture((file) => {
    const env = { NUXT_SESSION_PASSWORD: 'session'.repeat(8) }
    const first = ensureAppSecret(file, env)
    assert.equal(first.source, 'generated')
    const stored = readFileSync(file, 'utf8')
    assert.ok(stored.length >= 32)
    if (process.platform !== 'win32')
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

test('an empty NUXT_APP_SECRET does not discard a valid legacy key', () => {
  fixture((file) => {
    const secret = 'legacy-root'.repeat(8)
    const env = { NUXT_APP_SECRET: '', NUXT_OG_IMAGE_SECRET: secret }
    assert.deepEqual(ensureAppSecret(file, env), {
      secret,
      source: 'legacy',
    })
    assert.equal(resolveAppSecretCandidate('', env), secret)
    assert.throws(() => readFileSync(file), { code: 'ENOENT' })
  })
})

test('an empty NUXT_APP_SECRET without a legacy key generates and persists', () => {
  fixture((file) => {
    const first = ensureAppSecret(file, { NUXT_APP_SECRET: '' })
    assert.equal(first.source, 'generated')
    assert.ok(first.secret.length >= 32)
    assert.deepEqual(ensureAppSecret(file, {}), {
      secret: first.secret,
      source: 'file',
    })
  })
})

test('an empty NUXT_APP_SECRET leaves the configured runtime secret in charge', () => {
  const configured = 'runtime-config-secret'.repeat(2)
  assert.equal(
    resolveAppSecretCandidate(configured, { NUXT_APP_SECRET: '' }),
    configured,
  )
})

test('app-secret environment values follow Nitro string parsing and reject non-string JSON', () => {
  fixture((file) => {
    const secret = 'quoted-root'.repeat(5)
    assert.equal(
      ensureAppSecret(file, { NUXT_APP_SECRET: JSON.stringify(secret) }).secret,
      secret,
    )
    const numeric = '1'.repeat(40)
    assert.deepEqual(ensureAppSecret(file, { NUXT_APP_SECRET: numeric }), {
      secret: numeric,
      source: 'env',
    })
    assert.deepEqual(
      ensureAppSecret(file, {
        NITRO_APP_SECRET: numeric,
        NUXT_APP_SECRET: 'ignored-lower-priority',
      }),
      { secret: numeric, source: 'env' },
    )
    for (const value of [
      JSON.stringify(['a'.repeat(40)]),
      'true',
      'null',
      '{}',
    ])
      assert.throws(
        () => ensureAppSecret(file, { NUXT_APP_SECRET: value }),
        /string/,
      )
    assert.equal(
      ensureAppSecret(file, { NUXT_OG_IMAGE_SECRET: numeric }).secret,
      numeric,
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

test('the production entry initializes a single root before frozen config imports, including concurrent starts', () =>
  checkProductionEntry(false))

test('concurrent production entries on a mount without hard links reuse one private symlink target', () =>
  checkProductionEntry(true))

async function checkProductionEntry(rejectHardLinks: boolean) {
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
    const preload = join(directory, 'reject-hard-links.mjs')
    if (rejectHardLinks) {
      mkdirSync(join(directory, 'ready'))
      writeFileSync(
        preload,
        `
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
fs.linkSync = () => {
  fs.writeFileSync(new URL('./ready/' + process.pid, import.meta.url), '')
  const deadline = Date.now() + 10_000
  // All eight starts reach publication before any may choose the winning key.
  while (fs.readdirSync(new URL('./ready/', import.meta.url)).length < 8) {
    if (Date.now() > deadline) throw new Error('Concurrent publication barrier timed out')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
  }
  throw Object.assign(new Error('Hard links unavailable'), { code: 'ENOTSUP' })
}
syncBuiltinESMExports()
`,
      )
    }
    const start = async (overrides: NodeJS.ProcessEnv = {}) => {
      const child = spawn(
        process.execPath,
        [
          ...(rejectHardLinks ? ['--import', preload] : []),
          join(serverDir, 'index.mjs'),
        ],
        {
          cwd: directory,
          env: { ...env, ...overrides },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
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
    if (rejectHardLinks) {
      const file = join(directory, 'data/.app-secret')
      assert.ok(lstatSync(file).isSymbolicLink())
      if (process.platform !== 'win32')
        assert.equal(statSync(file).mode & 0o777, 0o600)
      assert.deepEqual(
        readdirSync(dirname(file)).sort(),
        ['.app-secret', readlinkSync(file)].sort(),
      )
      assert.equal(
        hashes[0],
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      )
    }
    assert.equal(
      await start(),
      hashes[0],
      'restart must reuse the persisted root',
    )
    // A persisted string must not become a number through Nitro's env parsing.
    const numericSecret = '1'.repeat(40)
    writeFileSync(join(directory, 'data/.app-secret'), numericSecret)
    assert.equal(
      await start(),
      createHash('sha256').update(numericSecret).digest('hex'),
      'bootstrap must preserve the exact persisted string through config initialization',
    )
    const nitroSecret = 'nitro-bootstrap-secret'.repeat(3)
    assert.equal(
      await start({
        NITRO_APP_SECRET: JSON.stringify(nitroSecret),
        NUXT_APP_SECRET: 'invalid-nuxt-secret',
      }),
      createHash('sha256').update(nitroSecret).digest('hex'),
      'bootstrap must validate the secret Nitro actually selects before config freezes',
    )
    // Digit-only env secrets must be re-quoted before Nitro parses them.
    const numericEnvSecret = '2'.repeat(40)
    assert.equal(
      await start({ NUXT_APP_SECRET: numericEnvSecret }),
      createHash('sha256').update(numericEnvSecret).digest('hex'),
    )
    assert.equal(
      await start({
        NITRO_APP_SECRET: numericEnvSecret,
        NUXT_APP_SECRET: 'invalid-nuxt-secret',
      }),
      createHash('sha256').update(numericEnvSecret).digest('hex'),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('shared validateAppSecret accepts strings of at least 32 characters', () => {
  const secret = 'a'.repeat(32)
  assert.equal(validateSharedAppSecret(secret, 'unused'), secret)
})

test('numeric-looking NITRO_APP_SECRET keeps the original env string over coerced runtimeConfig', () => {
  const digits = '1'.repeat(40)
  const secret = resolveAppSecretCandidate(Number(digits), {
    NITRO_APP_SECRET: digits,
  })
  assert.equal(secret, digits)
  assert.equal(typeof secret, 'string')
  assert.equal(validateSharedAppSecret(secret, 'unused'), digits)
})

test('JSON-quoted env secrets decode to the inner string and NITRO precedes NUXT', () => {
  const secret = 'quoted-app-secret-value'.repeat(2)
  assert.equal(
    resolveAppSecretCandidate(undefined, {
      NITRO_APP_SECRET: JSON.stringify(secret),
      NUXT_APP_SECRET: 'ignored-lower-priority'.repeat(2),
    }),
    secret,
  )
})

test('legacy NUXT_OG_IMAGE_SECRET remains the empty-app-secret fallback', () => {
  const legacy = 'legacy-og-image-secret-value'.repeat(2)
  assert.equal(
    resolveAppSecretCandidate('', { NUXT_OG_IMAGE_SECRET: legacy }),
    legacy,
  )
})

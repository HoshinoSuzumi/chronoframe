import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import Database from 'better-sqlite3'
import { validateAppSecret } from '../apps/self-hosted/server/utils/app-secret-validation.mjs'

const { parse: parseDotenv } = createRequire(
  import.meta.resolve('nuxt/package.json'),
)('dotenv')

// Execute the actual .env read/seed/write flow without provisioning D1/accounts
// or touching the developer's apps/cloud/.env.
async function seedEnvironment(directory: string) {
  const source = readFileSync('scripts/setup-cloud-local.mjs', 'utf8')
  const start = source.indexOf('const envPath =')
  const end = source.indexOf('await mkdir(')
  assert.ok(start >= 0 && end > start)
  const seed = vm.compileFunction(
    `return (async () => { ${source.slice(start, end)} })()`,
    [
      'cloudApp',
      'join',
      'readFile',
      'writeFile',
      'randomBytes',
      'parseDotenv',
      'validateAppSecret',
    ],
  )
  await seed(
    directory,
    join,
    readFile,
    writeFile,
    randomBytes,
    parseDotenv,
    validateAppSecret,
  )
  return readFile(join(directory, '.env'), 'utf8')
}

test('Local Cloud setup fills missing and blank app secrets and reuses them on rerun', async () => {
  for (const assignment of [
    undefined,
    '',
    'NUXT_APP_SECRET=',
    '  NUXT_APP_SECRET =   ',
    'NUXT_APP_SECRET=""',
    "NUXT_APP_SECRET=''",
    'NUXT_APP_SECRET=``',
    'NUXT_APP_SECRET=" "',
    "NUXT_APP_SECRET=' \t '",
    'NUXT_APP_SECRET=`  \t `',
    'export NUXT_APP_SECRET=" \t " # signing key\r',
    'NUXT_APP_SECRET=" \n\t "',
    "NUXT_APP_SECRET='\r\n  '",
    'NUXT_APP_SECRET=`\n \t `',
    'NUXT_APP_SECRET= # signing key',
    'export NUXT_APP_SECRET=',
    'NUXT_APP_SECRET=\r',
  ]) {
    const directory = await mkdtemp(join(tmpdir(), 'chronoframe-cloud-env-'))
    try {
      if (assignment !== undefined) {
        await writeFile(
          join(directory, '.env'),
          `# Local settings\n${assignment}\nKEEP=this-value\n`,
        )
      }
      const first = await seedEnvironment(directory)
      const secret = first.match(
        /^[ \t]*(?:export[ \t]+)?NUXT_APP_SECRET[ \t]*=([A-Za-z0-9_-]+)(?:[ \t]*#[^\r\n]*)?\r?$/m,
      )?.[1]
      assert.ok(
        secret && secret.length >= 32,
        'setup must generate a usable app secret',
      )
      if (assignment !== undefined) assert.match(first, /^KEEP=this-value$/m)
      assert.equal(
        (first.match(/^\s*(?:export\s+)?NUXT_APP_SECRET\s*=/gm) || []).length,
        1,
      )
      assert.equal(
        await seedEnvironment(directory),
        first,
        'rerun must preserve the generated secret and other settings',
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

test('Local Cloud setup preserves nonblank app secrets and existing unrelated values', async () => {
  for (const assignment of [
    'NUXT_APP_SECRET=existing-app-secret-that-must-stay',
    'NUXT_APP_SECRET=' + 'a'.repeat(32),
    `NUXT_APP_SECRET='${JSON.stringify('j'.repeat(32))}'`,
    ' NUXT_APP_SECRET = "quoted-existing-value-that-must-stay" # keep comment',
    "NUXT_APP_SECRET='single-quoted-value-that-must-stay'",
    'NUXT_APP_SECRET=" padded-existing-value-that-must-stay "',
    "NUXT_APP_SECRET=' \t existing-value-that-must-stay \t '",
    'NUXT_APP_SECRET=` padded-existing-value-that-must-stay `',
    'export NUXT_APP_SECRET=exported-existing-value-that-must-stay',
  ]) {
    const directory = await mkdtemp(join(tmpdir(), 'chronoframe-cloud-env-'))
    try {
      const original = `# Local settings\n${assignment}\nNUXT_SESSION_PASSWORD=existing-session\nNUXT_PLATFORM_SECRET=existing-platform\nKEEP=this-value\n`
      await writeFile(join(directory, '.env'), original)
      const result = await seedEnvironment(directory)
      assert.ok(
        result.startsWith(original),
        'existing assignments and comments must remain intact',
      )
      assert.equal(
        (result.match(/^[ \t]*(?:export[ \t]+)?NUXT_APP_SECRET[ \t]*=/gm) || [])
          .length,
        1,
        'setup must not append an overriding assignment for a nonblank secret',
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

test('Local Cloud setup rejects short existing app secrets without changing the file or exposing the value', async () => {
  for (const assignment of [
    'NUXT_APP_SECRET=short-but-owned',
    'NUXT_APP_SECRET=' + 'a'.repeat(31),
    ' NUXT_APP_SECRET = "quoted-short-value" # this long comment must not count',
    "NUXT_APP_SECRET='single-quoted-short'",
    'NUXT_APP_SECRET=`backtick-short`',
    'export NUXT_APP_SECRET=exported-short-value',
    'NUXT_APP_SECRET=" \t padded-short \t "',
    `NUXT_APP_SECRET='${JSON.stringify('j'.repeat(31))}'`,
  ]) {
    const directory = await mkdtemp(join(tmpdir(), 'chronoframe-cloud-env-'))
    try {
      const original = `# Keep this file\n${assignment}\nKEEP=this-value\n`
      await writeFile(join(directory, '.env'), original)
      await assert.rejects(seedEnvironment(directory), (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /NUXT_APP_SECRET.*at least 32/)
        assert.match(error.message, /Replace.*rerun pnpm setup:cloud/)
        assert.ok(
          !error.message.includes(parseDotenv(original).NUXT_APP_SECRET),
        )
        return true
      })
      assert.equal(await readFile(join(directory, '.env'), 'utf8'), original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

test('Local account seeding synchronizes regenerated credentials without replacing the account', () => {
  const source = readFileSync('scripts/setup-cloud-local.mjs', 'utf8')
  const sql = source.match(/`(INSERT INTO platform_accounts[^`]+)`/)?.[1]
  assert.ok(sql)
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE platform_users(id INTEGER PRIMARY KEY, email TEXT UNIQUE);
      CREATE TABLE platform_accounts(
        id INTEGER PRIMARY KEY, account_id TEXT, provider_id TEXT,
        user_id INTEGER, password TEXT, created_at INTEGER, updated_at INTEGER,
        UNIQUE(provider_id, account_id)
      );
      INSERT INTO platform_users VALUES(1, 'developer@localhost.test');
    `)
    const seed = db.prepare(sql)
    seed.run('original-hash', 10, 10, 'developer@localhost.test')
    seed.run('regenerated-hash', 20, 20, 'developer@localhost.test')
    assert.deepEqual(db.prepare('SELECT * FROM platform_accounts').all(), [
      {
        id: 1,
        account_id: '1',
        provider_id: 'credential',
        user_id: 1,
        password: 'regenerated-hash',
        created_at: 10,
        updated_at: 20,
      },
    ])
  } finally {
    db.close()
  }
})

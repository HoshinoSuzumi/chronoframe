import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unstable_splitSqlQuery as splitSqlQuery } from 'wrangler'
import { cloudApp, localCloudPlatform } from './cloud-local.mjs'

const envPath = join(cloudApp, '.env')
let env
try {
  env = await readFile(envPath, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  env = ''
}
const defaults = {
  NUXT_PLATFORM_PORTAL_ORIGIN: 'http://localhost:3001',
  NUXT_SESSION_PASSWORD: randomBytes(32).toString('hex'),
  NUXT_PLATFORM_SECRET: randomBytes(32).toString('hex'),
  NUXT_PLATFORM_STORAGE_SECRET: randomBytes(32).toString('hex'),
  NUXT_PLATFORM_EMAIL_FROM: 'verify@localhost.test',
}
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp(`^\\s*${key}\\s*=`, 'm').test(env))
    env += `\n${key}=${value}\n`
}
await writeFile(envPath, env)
await mkdir(join(cloudApp, '.data'), { recursive: true })
const credentialsPath = join(cloudApp, '.data', 'local-account.json')
let credentials
try {
  credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  credentials = {
    email: 'developer@localhost.test',
    password: randomBytes(24).toString('base64url'),
  }
  await writeFile(
    credentialsPath,
    JSON.stringify(credentials, null, 2) + '\n',
    { mode: 0o600 },
  )
}
const platform = await localCloudPlatform()
try {
  const db = platform.env.DB
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS cloud_local_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
    )
    .run()
  const directory = fileURLToPath(
    new URL('../packages/platform/migrations/', import.meta.url),
  )
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = await readFile(join(directory, name), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const applied = await db
      .prepare('SELECT checksum FROM cloud_local_migrations WHERE name=?')
      .bind(name)
      .first()
    if (applied) {
      if (applied.checksum !== checksum)
        throw new Error(`Applied migration changed: ${name}`)
      continue
    }
    await db.batch([
      ...splitSqlQuery(sql).map((query) => db.prepare(query)),
      db
        .prepare(
          'INSERT INTO cloud_local_migrations(name,checksum) VALUES(?,?)',
        )
        .bind(name, checksum),
    ])
    console.info(`Applied ${name}`)
  }
  const require = createRequire(join(cloudApp, 'package.json'))
  const { hashPassword } = await import(
    pathToFileURL(require.resolve('better-auth/crypto')).href
  )
  const now = Date.now()
  const password = await hashPassword(credentials.password)
  await db.batch([
    db
      .prepare(
        'INSERT INTO platform_users(email,name,email_verified,created_at,updated_at,last_login_at) VALUES(?,?,1,?,?,?) ON CONFLICT(email) DO NOTHING',
      )
      .bind(credentials.email, 'Local Developer', now, now, now),
    db
      .prepare(`INSERT INTO platform_accounts(account_id,provider_id,user_id,password,created_at,updated_at)
      SELECT CAST(id AS TEXT),'credential',id,?,?,? FROM platform_users WHERE email=?
      ON CONFLICT(provider_id,account_id) DO UPDATE SET password=excluded.password,updated_at=excluded.updated_at`)
      .bind(password, now, now, credentials.email),
    db
      .prepare(`INSERT INTO platform_workspaces(name,owner_user_id,created_at)
      SELECT 'Local Studio',id,? FROM platform_users WHERE email=?
      ON CONFLICT(owner_user_id) DO NOTHING`)
      .bind(now, credentials.email),
    db
      .prepare(`INSERT INTO platform_memberships(user_id,workspace_id,role)
      SELECT owner_user_id,id,'admin' FROM platform_workspaces WHERE owner_user_id=(SELECT id FROM platform_users WHERE email=?)
      ON CONFLICT(user_id,workspace_id) DO NOTHING`)
      .bind(credentials.email),
    db
      .prepare(`INSERT INTO platform_workspace_plans(workspace_id,plan_id,starts_at,source)
      SELECT id,'free',?,'default' FROM platform_workspaces WHERE owner_user_id=(SELECT id FROM platform_users WHERE email=?)
      ON CONFLICT(workspace_id) DO NOTHING`)
      .bind(now, credentials.email),
    db
      .prepare(`INSERT INTO platform_sites(workspace_id,name,slug,created_at,provision_key,gallery_title,gallery_author)
      SELECT id,'Local Gallery','local-gallery',?,'local-demo','Local Gallery','Local Developer'
      FROM platform_workspaces WHERE owner_user_id=(SELECT id FROM platform_users WHERE email=?)
      ON CONFLICT(workspace_id,provision_key) DO NOTHING`)
      .bind(now, credentials.email),
  ])
  console.info(
    `Local Cloud ready. Account: ${credentials.email}\nCredentials: ${credentialsPath}\nRun pnpm dev:cloud, then open http://localhost:3001/signin`,
  )
} finally {
  await platform.dispose()
}

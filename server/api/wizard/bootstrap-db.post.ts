import { z } from 'zod'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import Database from 'better-sqlite3'
import {
  readBootstrapDbConfig,
  writeBootstrapDbConfig,
} from '~~/server/utils/db-bootstrap'

const execFileAsync = promisify(execFile)
const REQUIRED_TABLES = [
  'users',
  'photos',
  'pipeline_queue',
  'photo_reactions',
  'albums',
  'album_photos',
  'settings',
  'settings_storage_providers',
] as const

const payloadSchema = z.discriminatedUnion('adapter', [
  z.object({
    adapter: z.literal('sqlite'),
    sqlite: z
      .object({
        path: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    adapter: z.literal('postgres'),
    postgres: z.object({
      url: z.string().min(1),
    }),
  }),
])

export default eventHandler(async (event) => {
  const existing = await readBootstrapDbConfig()
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Database adapter is already initialized and cannot be changed.',
    })
  }

  const body = await readValidatedBody(event, payloadSchema.parse)

  if (body.adapter === 'sqlite') {
    const sqlitePath = body.sqlite?.path || 'data/app.sqlite3'
    const resolvedPath = resolve(process.cwd(), sqlitePath)
    await mkdir(dirname(resolvedPath), { recursive: true })

    await pushSchemaWithDrizzleKit({
      adapter: 'sqlite',
      sqlitePath: resolvedPath,
    })

    await verifySqliteTables(resolvedPath)
  } else {
    const pool = new Pool({
      connectionString: body.postgres.url,
      max: 1,
      connectionTimeoutMillis: 5000,
    })
    try {
      await pool.query('select 1')
      await pushSchemaWithDrizzleKit({
        adapter: 'postgres',
        postgresUrl: body.postgres.url,
      })

      await verifyPostgresTables(pool)
    } catch (error) {
      throw createError({
        statusCode: 400,
        statusMessage:
          error instanceof Error
            ? error.message
            : 'Failed to connect or initialize PostgreSQL. Please verify connection URL and database compatibility.',
      })
    } finally {
      await pool.end()
    }
  }

  const config = await writeBootstrapDbConfig(body)

  return {
    success: true,
    adapter: config.adapter,
  }
})

async function pushSchemaWithDrizzleKit(input: {
  adapter: 'sqlite' | 'postgres'
  sqlitePath?: string
  postgresUrl?: string
}) {
  const workspaceRoot = process.cwd()
  const schemaPath =
    input.adapter === 'sqlite'
      ? resolve(workspaceRoot, 'server/database/schema.ts')
      : resolve(workspaceRoot, 'server/database/schema.pg.ts')

  const tempDir = await mkdtemp(resolve(tmpdir(), 'chronoframe-drizzle-'))
  const configPath = resolve(tempDir, 'drizzle.config.mjs')

  const configText =
    input.adapter === 'sqlite'
      ? `import { defineConfig } from 'drizzle-kit'\nexport default defineConfig({ dialect: 'sqlite', schema: ${JSON.stringify(schemaPath)}, dbCredentials: { url: ${JSON.stringify(`file:${input.sqlitePath}`)} } })\n`
      : `import { defineConfig } from 'drizzle-kit'\nexport default defineConfig({ dialect: 'postgresql', schema: ${JSON.stringify(schemaPath)}, dbCredentials: { url: ${JSON.stringify(input.postgresUrl)} } })\n`

  try {
    await writeFile(configPath, configText, 'utf-8')

    await execFileAsync(
      'pnpm',
      ['exec', 'drizzle-kit', 'push', '--config', configPath],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          CI: '1',
        },
        timeout: 120000,
      },
    )
  } catch (error: any) {
    const stderr = error?.stderr ? String(error.stderr) : ''
    const stdout = error?.stdout ? String(error.stdout) : ''
    const message = stderr || stdout || error?.message || 'Drizzle push failed'
    throw new Error(message)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function verifyPostgresTables(pool: Pool) {
  const result = await pool.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [REQUIRED_TABLES],
  )

  const existing = new Set(result.rows.map((row) => row.table_name))
  const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

  if (missing.length > 0) {
    throw new Error(
      `PostgreSQL schema bootstrap incomplete. Missing tables: ${missing.join(', ')}`,
    )
  }
}

async function verifySqliteTables(sqlitePath: string) {
  const sqlite = new Database(sqlitePath)

  try {
    const rows = sqlite
      .prepare(
        `
          select name
          from sqlite_master
          where type = 'table'
        `,
      )
      .all() as Array<{ name: string }>

    const existing = new Set(rows.map((row) => row.name))
    const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

    if (missing.length > 0) {
      throw new Error(
        `SQLite schema bootstrap incomplete. Missing tables: ${missing.join(', ')}`,
      )
    }
  } finally {
    sqlite.close()
  }
}

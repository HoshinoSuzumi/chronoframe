import { z } from 'zod'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator'
import {
  readBootstrapDbConfig,
  writeBootstrapDbConfig,
} from '~~/server/utils/db-bootstrap'

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
  const migrationsFolder = resolve(process.cwd(), 'server/database/migrations')

  if (body.adapter === 'sqlite') {
    const sqlitePath = body.sqlite?.path || 'data/app.sqlite3'
    const resolvedPath = resolve(process.cwd(), sqlitePath)
    await mkdir(dirname(resolvedPath), { recursive: true })

    const sqlite = new Database(resolvedPath)
    try {
      const db = drizzle(sqlite)
      migrateSqlite(db, {
        migrationsFolder,
      })
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'Failed to migrate SQLite database.',
      })
    } finally {
      sqlite.close()
    }
  } else {
    const pool = new Pool({
      connectionString: body.postgres.url,
      max: 1,
      connectionTimeoutMillis: 5000,
    })
    try {
      await pool.query('select 1')
      const db = drizzlePg(pool)
      await migratePostgres(db, {
        migrationsFolder,
      })
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage:
          'Failed to connect or migrate PostgreSQL. Please verify connection URL and database compatibility.',
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

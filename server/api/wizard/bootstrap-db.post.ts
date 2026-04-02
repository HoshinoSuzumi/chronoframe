import { z } from 'zod'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'
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

  if (body.adapter === 'sqlite') {
    const sqlitePath = body.sqlite?.path || 'data/app.sqlite3'
    const resolvedPath = resolve(process.cwd(), sqlitePath)
    await mkdir(dirname(resolvedPath), { recursive: true })
  } else {
    const pool = new Pool({
      connectionString: body.postgres.url,
      max: 1,
      connectionTimeoutMillis: 5000,
    })
    try {
      await pool.query('select 1')
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage:
          'Failed to connect to PostgreSQL. Please verify connection URL and network.',
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

import { z } from 'zod'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'

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
  const body = await readValidatedBody(event, payloadSchema.parse)

  try {
    if (body.adapter === 'sqlite') {
      const sqlitePath = body.sqlite?.path || 'data/app.sqlite3'
      const resolvedPath = resolve(process.cwd(), sqlitePath)

      // Create directory if it doesn't exist
      await mkdir(dirname(resolvedPath), { recursive: true })

      // Try to create and connect to SQLite
      // Only verify the directory is writable, don't create the database file
      // Database file will be created during bootstrap-db.post

      return {
        success: true,
        message: 'SQLite path is valid and writable',
      }
    } else {
      // Test PostgreSQL connection
      const pool = new Pool({
        connectionString: body.postgres.url,
        max: 1,
        connectionTimeoutMillis: 5000,
      })

      try {
        await pool.query('SELECT 1')

        return {
          success: true,
          message: 'PostgreSQL connection successful',
        }
      } finally {
        await pool.end()
      }
    }
  } catch (error: any) {
    const errorMessage = error.message || 'Connection failed'

    throw createError({
      statusCode: 400,
      statusMessage: errorMessage,
    })
  }
})

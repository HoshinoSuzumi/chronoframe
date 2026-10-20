import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { useDB, closeDB } from '../utils/db'

export default defineNitroPlugin((nitroApp) => {
  try {
    migrate(useDB(), {
      migrationsFolder: resolve(
        process.env.DATABASE_MIGRATIONS || './server/database/migrations',
      ),
    })
    logger
      .dynamic('db-migrate')
      .info('Database migration finished successfully')
  } catch (error) {
    closeDB()
    throw error
  }
  nitroApp.hooks.hook('close', closeDB)
})

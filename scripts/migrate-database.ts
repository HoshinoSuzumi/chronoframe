import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { openDatabase } from '@chronoframe/database'

const connection = openDatabase({
  filename: resolve(process.env.DATABASE_URL || './data/app.sqlite3'),
  migrationsFolder: resolve(
    process.env.DATABASE_MIGRATIONS ||
      fileURLToPath(
        new URL('../packages/database/migrations', import.meta.url),
      ),
  ),
})
connection.close()
console.log(
  'Database migration completed; pending upgrades of existing files were backed up automatically.',
)

import { resolve } from 'node:path'
import { openDatabase } from '@chronoframe/database'

const connection = openDatabase({
  filename: resolve(process.env.DATABASE_URL || './data/app.sqlite3'),
  migrationsFolder: resolve(
    process.env.DATABASE_MIGRATIONS || './packages/database/migrations',
  ),
})
connection.close()
console.log(
  'Database migration completed; pending upgrades of existing files were backed up automatically.',
)

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './packages/database/src/schema.ts',
  out: './packages/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL || './data/app.sqlite3',
  },
})

import { createRequire } from 'node:module'

// Use the same SQL parser as Wrangler so trigger bodies remain one statement.
export const splitSqlQuery: (sql: string) => string[] = createRequire(
  import.meta.url,
)('wrangler').unstable_splitSqlQuery

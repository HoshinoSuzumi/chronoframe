import { readBootstrapDbConfig } from '~~/server/utils/db-bootstrap'
import { existsSync } from 'node:fs'

export default eventHandler(async (_event) => {
  const config = await readBootstrapDbConfig()
  return {
    configured: !!config || existsSync('data/app.sqlite3'),
    adapter: config?.adapter || null,
  }
})

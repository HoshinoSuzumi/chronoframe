import { readBootstrapDbConfig } from '~~/server/utils/db-bootstrap'

export default eventHandler(async (_event) => {
  const config = await readBootstrapDbConfig()
  return {
    configured: !!config,
    adapter: config?.adapter || null,
  }
})

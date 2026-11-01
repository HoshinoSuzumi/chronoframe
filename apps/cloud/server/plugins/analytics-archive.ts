import { archiveAnalytics } from '../../../../packages/platform/src/analytics-archive'
import type { PlatformD1 } from '../../../../packages/platform/src/index'
export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    if (!env.DB || !env.ANALYTICS_API_TOKEN || !env.ANALYTICS_DATASET) return
    try {
      await archiveAnalytics(env.DB as PlatformD1, {
        accountId: String(env.ANALYTICS_ACCOUNT_ID ?? ''),
        token: String(env.ANALYTICS_API_TOKEN),
        dataset: String(env.ANALYTICS_DATASET),
      })
    } catch {
      console.error('analytics_archive_failed')
    }
  })
})

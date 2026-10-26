import { reconcileSubscriptions } from '../../../../packages/platform/src/subscriptions'
import { domainServices } from '../../../shared/platform/domains'
import type { PlatformD1 } from '@chronoframe/platform'
/** A maximum of 20 provider reservations plus 10 unverified claims bounds this one-host-per-minute queue. */
export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    if (!db) return
    await reconcileSubscriptions(db)
    const runtime = {
      public: {
        siteBaseDomain: String(
          env.NUXT_PUBLIC_SITE_BASE_DOMAIN || 'chronoframe.art',
        ),
      },
      platform: {
        domainEnabled: env.NUXT_PLATFORM_DOMAIN_ENABLED,
        domainRoutingReady: env.NUXT_PLATFORM_DOMAIN_ROUTING_READY,
        domainProviderToken: env.NUXT_PLATFORM_DOMAIN_PROVIDER_TOKEN,
        domainZoneId: env.NUXT_PLATFORM_DOMAIN_ZONE_ID,
        domainCnameTarget: env.NUXT_PLATFORM_DOMAIN_CNAME_TARGET,
        domainSiteWorker: env.NUXT_PLATFORM_DOMAIN_SITE_WORKER,
        domainResourceLimit: env.NUXT_PLATFORM_DOMAIN_RESOURCE_LIMIT,
      },
    }
    const services = domainServices(db, runtime)
    if (!services.config.enabled) return
    await services.manager.reconcile(undefined, 1)
    await db
      .prepare(
        'DELETE FROM platform_domain_audit WHERE id IN (SELECT id FROM platform_domain_audit WHERE created_at<? ORDER BY id LIMIT 100)',
      )
      .bind(Date.now() - 30 * 86400000)
      .run()
  })
})

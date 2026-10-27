import { closeAccountPayments } from '../../../../packages/platform/src/payments'
import {
  scanAccounts,
  lifecycleStages,
  deliverLifecycleMail,
} from '../../../../packages/platform/src/account-lifecycle'
import { purgeAccounts } from '../../../../packages/platform/src/account-purge'
import type { PlatformD1 } from '@chronoframe/platform'
import { createStorageVault } from '../../../../packages/platform/src/storage-vault'
import { createStorageCipher } from '@chronoframe/storage/credential-cipher'
import { createCloudS3 } from '@chronoframe/storage/s3-edge'
import { domainServices } from '../../../shared/platform/domains'
import type { MailBinding } from '../../../../packages/platform/src/mail'
export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    if (!db) return
    const now = Date.now()
    await lifecycleStages(
      db,
      {
        scan: () => scanAccounts(db, now),
        mail: () =>
          deliverLifecycleMail(
            db,
            env.EMAIL as MailBinding,
            String(
              env.NUXT_PLATFORM_PORTAL_ORIGIN || 'https://app.chronoframe.art',
            ),
            now,
          ),
        purge: async () => {
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
            },
          }
          const domains = domainServices(db, runtime)
          for (let i = 0; i < 3; i++)
            await purgeAccounts(
              db,
              {
                billing: (userId) =>
                  closeAccountPayments(
                    db,
                    String(env.NUXT_PLATFORM_STORAGE_SECRET || ''),
                    userId,
                  ),
                async domains(siteId) {
                  await db
                    .prepare(
                      "UPDATE platform_custom_domains SET state='deleting',purge_requested=1,next_check_at=0,revision=revision+1,lease_token=NULL,lease_until=NULL WHERE site_id=? AND (state<>'deleted' OR purge_requested=0 OR provider_id IS NOT NULL OR route_id IS NOT NULL OR provider_attempted=1 OR route_attempted=1)",
                    )
                    .bind(siteId)
                    .run()
                  const domain = await db
                    .prepare(
                      'SELECT hostname FROM platform_custom_domains WHERE site_id=? LIMIT 1',
                    )
                    .bind(siteId)
                    .first<{ hostname: string }>()
                  if (domain) {
                    if (!domains.config.enabled)
                      throw new Error('Domain service required')
                    await domains.manager.reconcile(domain.hostname, 1)
                  }
                  return !(await db
                    .prepare(
                      'SELECT hostname FROM platform_custom_domains WHERE site_id=? LIMIT 1',
                    )
                    .bind(siteId)
                    .first())
                },
                async storage(siteId, connectionId, revision) {
                  const key = String(env.NUXT_PLATFORM_STORAGE_SECRET || '')
                  if (key.length < 32)
                    throw new Error('Storage credentials required')
                  const vault = createStorageVault(
                    db,
                    siteId,
                    await createStorageCipher(key),
                  )
                  const connection = await vault.resolve(connectionId, revision)
                  if (!connection)
                    throw new Error('Storage connection unavailable')
                  return createCloudS3(
                    { ...connection.config, ...connection.credentials },
                    {
                      allowedHosts: [
                        ...String(env.NUXT_PLATFORM_S3_ENDPOINT_HOSTS || '')
                          .split(',')
                          .map((h) => h.trim())
                          .filter(Boolean),
                        ...('poolId' in connection
                          ? [new URL(connection.config.endpoint).hostname]
                          : []),
                      ],
                    },
                  ).purgeTenant(siteId)
                },
              },
              now,
            )
        },
        outbox: async () => {
          await db
            .prepare(
              "DELETE FROM platform_mail_outbox WHERE state IN('sent','cancelled','failed') AND available_at<?",
            )
            .bind(now - 30 * 86400000)
            .run()
        },
      },
      now,
    )
  })
})

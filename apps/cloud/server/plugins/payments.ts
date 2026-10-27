import { syncPaymentProducts } from '../../../../packages/platform/src/payment-product-sync'
import { expirePaymentEventPayloads } from '../../../../packages/platform/src/payment-events'
import { reconcilePayments } from '../../../../packages/platform/src/payments'
import type { PlatformD1 } from '@chronoframe/platform'
export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    if (db) {
      await syncPaymentProducts(
        db,
        String(env.NUXT_PLATFORM_STORAGE_SECRET || ''),
      ).catch(() => undefined)
      await expirePaymentEventPayloads(db)
      await reconcilePayments(
        db,
        String(env.NUXT_PLATFORM_STORAGE_SECRET || ''),
      )
    }
  })
})

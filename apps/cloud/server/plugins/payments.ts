import {
  syncDodoProducts,
  reconcileDodoPayments,
} from '../../../../packages/platform/src/dodo-payments'
import { expirePaymentEventPayloads } from '../../../../packages/platform/src/payment-events'
import type { PlatformD1 } from '@chronoframe/platform'

export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    // Local data retention continues independently of payment availability.
    if (db) {
      const secret = String(env.NUXT_PLATFORM_STORAGE_SECRET || '')
      await syncDodoProducts(db, secret).catch(() =>
        console.error('dodo_product_sync_failed'),
      )
      await reconcileDodoPayments(db, secret).catch(() =>
        console.error('dodo_reconciliation_failed'),
      )
      await expirePaymentEventPayloads(db).catch(() =>
        console.error('payment_payload_expiry_failed'),
      )
    }
  })
})

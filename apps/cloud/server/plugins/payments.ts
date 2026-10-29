import { expirePaymentEventPayloads } from '../../../../packages/platform/src/payment-events'
import type { PlatformD1 } from '@chronoframe/platform'

export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    // Local data retention continues independently of payment availability.
    if (db)
      await expirePaymentEventPayloads(db).catch(() =>
        console.error('payment_payload_expiry_failed'),
      )
  })
})

import {
  createPaymentCheckout,
  createPaymentPortal,
  refreshPaymentCheckout,
} from '../../../../../packages/platform/src/payments'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { siteManagementBody } from '../../utils/site-management'
import { createError } from 'h3'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  const user = await requirePlatformSession(event, config)
  platformPortalOrigin(event, config.portalOrigin, true)
  const b = await siteManagementBody(event, 4096),
    db = platformDatabase(event)
  if (b.action === 'checkout')
    return createPaymentCheckout(
      db,
      config.storageSecret,
      user.userId,
      {
        workspaceId: Number(b.workspaceId),
        planId: String(b.planId),
        interval: Number(b.interval),
        requestId: String(b.requestId),
      },
      config.portalOrigin,
    )
  if (b.action === 'refresh')
    return refreshPaymentCheckout(
      db,
      config.storageSecret,
      user.userId,
      Number(b.workspaceId),
      String(b.checkoutId),
      undefined,
      undefined,
      {
        providerCheckoutId:
          b.providerCheckoutId === undefined
            ? undefined
            : String(b.providerCheckoutId),
        subscriptionId:
          b.subscriptionId === undefined ? undefined : String(b.subscriptionId),
      },
    )
  if (b.action === 'portal')
    return createPaymentPortal(
      db,
      config.storageSecret,
      user.userId,
      Number(b.workspaceId),
    )
  throw createError({ statusCode: 400 })
})

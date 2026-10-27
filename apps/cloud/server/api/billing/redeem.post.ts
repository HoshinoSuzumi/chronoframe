import {
  previewActivation,
  redeemActivation,
} from '../../../../../packages/platform/src/activation'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { createError } from 'h3'
import { siteManagementBody } from '../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const user = await requirePlatformSession(
    event,
    useRuntimeConfig(event).platform,
  )
  platformPortalOrigin(
    event,
    useRuntimeConfig(event).platform.portalOrigin,
    true,
  )
  const body = await siteManagementBody(event, 4096),
    id = Number(body?.workspaceId)
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !['preview', 'redeem'].includes(body?.action)
  )
    throw createError({ statusCode: 400 })
  const db = platformDatabase(event)
  return body.action === 'preview'
    ? previewActivation(db, user.userId, id, body.code)
    : redeemActivation(db, user.userId, id, {
        code: body.code,
        requestId: body.requestId,
        revision: body.revision,
      })
})

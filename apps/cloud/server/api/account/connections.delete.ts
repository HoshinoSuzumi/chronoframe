import { createError, getRequestHeaders, setResponseHeader } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { cloudAccount } from '../../utils/cloud-account'
import { siteManagementBody } from '../../utils/site-management'
import { unlinkLoginAccount } from '../../../../../packages/platform/src/account-connections'
export default definePlatformHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, true)
  const user = await requirePlatformSession(event, config)
  const session = await (
    await cloudAccount(event)
  ).api.getSession({
    headers: new Headers(getRequestHeaders(event) as HeadersInit),
  })
  const createdAt = session
    ? new Date(session.session.createdAt).getTime()
    : NaN
  if (
    !session ||
    Number(session.user.id) !== user.userId ||
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > 10 * 60_000
  )
    throw createError({
      statusCode: 401,
      data: { code: 'SESSION_IS_NOT_FRESH' },
    })
  const body = await siteManagementBody(event)
  if (
    !(await unlinkLoginAccount(
      platformDatabase(event),
      config.storageSecret,
      user.userId,
      body.id,
    ))
  )
    throw createError({
      statusCode: 400,
      data: { code: 'LOGIN_METHOD_REQUIRED' },
    })
  return { success: true }
})

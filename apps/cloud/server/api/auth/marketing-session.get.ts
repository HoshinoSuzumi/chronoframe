import { createError, getHeader, setResponseHeaders } from 'h3'
import {
  definePlatformHandler,
  platformPortalOrigin,
  platformSession,
} from '../../../../shared/platform/runtime'
/** Share only login presence with the first-party marketing site, never profile data or cookies. */
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin)
  const origin = getHeader(event, 'origin')
  const marketing =
    config.portalOrigin === 'https://app.chronoframe.art' &&
    origin === 'https://chronoframe.art'
  if (origin && origin !== config.portalOrigin && !marketing)
    throw createError({ statusCode: 403 })
  setResponseHeaders(event, {
    'cache-control': 'private, no-store',
    vary: 'Origin, Cookie',
    ...(marketing
      ? {
          'access-control-allow-origin': origin!,
          'access-control-allow-credentials': 'true',
        }
      : {}),
  })
  return { authenticated: !!(await platformSession(event, config.secret)) }
})

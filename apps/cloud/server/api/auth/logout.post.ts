import { definePlatformHandler } from '../../../../platform.runtime'
import { createD1Sessions } from '../../../../../packages/platform/src/index'
import { createEmailCodeCrypto } from '../../../../platform-crypto'
import {
  PLATFORM_COOKIE,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../platform.runtime'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, true)
  const token = getCookie(event, PLATFORM_COOKIE)
  if (token) {
    const crypto = await createEmailCodeCrypto(config.secret)
    await createD1Sessions(platformDatabase(event)).revoke(
      await crypto.mac(['platform-session', token]),
    )
  }
  deleteCookie(event, PLATFORM_COOKIE, {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return { authenticated: false }
})

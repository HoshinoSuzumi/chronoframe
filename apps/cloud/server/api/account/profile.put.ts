import { createError, setResponseHeader } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { siteManagementBody } from '../../utils/site-management'
import { parseAccountProfile } from '../../../../../packages/contracts/src/account-profile'
export default definePlatformHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, true)
  const session = await requirePlatformSession(event, config)
  let profile
  try {
    profile = parseAccountProfile(await siteManagementBody(event, 98304))
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid account profile',
    })
  }
  const user = await platformDatabase(event)
    .prepare(
      'UPDATE platform_users SET name=?,image=?,updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=platform_users.id) RETURNING id,name,email,image',
    )
    .bind(profile.name, profile.image, Date.now(), session.userId)
    .first<{ id: number; name: string; email: string; image: string | null }>()
  if (!user) throw createError({ statusCode: 404 })
  return { user }
})

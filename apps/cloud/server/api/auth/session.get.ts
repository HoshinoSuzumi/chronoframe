import { definePlatformHandler } from '../../../../shared/platform/runtime'
import {
  platformPortalOrigin,
  platformDatabase,
  platformSession,
} from '../../../../shared/platform/runtime'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin)
  const session = await platformSession(event, config.secret)
  if (!session) return { authenticated: false, user: null }
  const profile = await platformDatabase(event)
    .prepare('SELECT name,email FROM platform_users WHERE id=?')
    .bind(session.userId)
    .first<{ name: string | null; email: string }>()
  return profile
    ? { authenticated: true, user: { id: session.userId, ...profile } }
    : { authenticated: false, user: null }
})

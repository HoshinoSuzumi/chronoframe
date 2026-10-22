import { platformEmailReady } from '../../../../platform-email'
import {
  platformRequestURL,
  platformDatabase,
} from '../../../../platform.runtime'
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  const origin = platformRequestURL(event).origin
  const configured =
    origin === config.portalOrigin &&
    platformEmailReady(
      event.context.cloudflare?.env?.EMAIL,
      config.emailFrom,
    ) &&
    config.secret.length >= 32 &&
    !!event.context.cloudflare?.env?.PLATFORM_DB
  if (!configured) return { enabled: false }
  try {
    await platformDatabase(event)
      .prepare('SELECT id FROM platform_users LIMIT 1')
      .first()
    return { enabled: true }
  } catch {
    return { enabled: false }
  }
})

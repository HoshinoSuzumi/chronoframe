import { platformEmailReady } from '../../../../shared/platform/email'
import {
  platformRequestURL,
  platformDatabase,
} from '../../../../shared/platform/runtime'
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  const origin = platformRequestURL(event).origin
  const configured =
    origin === config.portalOrigin &&
    platformEmailReady(
      event.context.cloudflare?.env?.EMAIL,
      'verify@noreply.chronoframe.art',
    ) &&
    config.secret.length >= 32 &&
    !!event.context.cloudflare?.env?.DB
  if (!configured) return { enabled: false }
  try {
    await platformDatabase(event)
      .prepare('SELECT id FROM platform_auth_sessions LIMIT 1')
      .first()
    return { enabled: true }
  } catch {
    return { enabled: false }
  }
})

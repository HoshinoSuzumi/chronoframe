import { socialLoginProviders } from '../../../../../packages/platform/src/social-login'
import { setResponseHeader } from 'h3'
import { platformEmailReady } from '../../../../shared/platform/email'
import {
  platformRequestURL,
  platformDatabase,
} from '../../../../shared/platform/runtime'
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event).platform
  const origin = platformRequestURL(event).origin
  const configured =
    origin === config.portalOrigin &&
    config.secret.length >= 32 &&
    !!event.context.cloudflare?.env?.DB
  if (!configured)
    return { enabled: false, emailEnabled: false, providers: [] as string[] }
  try {
    await platformDatabase(event)
      .prepare('SELECT id FROM platform_auth_sessions LIMIT 1')
      .first()
    const providers = await socialLoginProviders(
      platformDatabase(event),
      config.storageSecret,
    )
    return {
      enabled: true,
      emailEnabled: platformEmailReady(
        event.context.cloudflare?.env?.EMAIL,
        'verify@noreply.chronoframe.art',
      ),
      providers: Object.keys(providers),
    }
  } catch {
    return { enabled: false, emailEnabled: false, providers: [] as string[] }
  }
})

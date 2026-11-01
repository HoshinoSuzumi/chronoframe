import { getRequestURL, type H3Event } from 'h3'
import type { BetterAuthOptions } from 'better-auth'
import { socialLoginProviders } from '../../../../packages/platform/src/social-login'
import { createAccountAuth } from './account-auth'
import { platformDatabase } from '../../../shared/platform/runtime'
import type { PlatformEmailBinding } from '../../../shared/platform/email'
/** Cache only within this H3 request; never share an identity between requests. */
export async function cloudAccount(event: H3Event) {
  if (!event.context.cloudAccountAuth) {
    const config = useRuntimeConfig(event).platform
    const execution = event.context.cloudflare?.context as
      | { waitUntil(task: Promise<unknown>): void }
      | undefined
    const path = getRequestURL(event).pathname
    const providers =
      path === '/api/auth/sign-in/social' ||
      path.startsWith('/api/auth/callback/')
        ? await socialLoginProviders(
            platformDatabase(event),
            config.storageSecret,
          )
        : {}
    const socialProviders = Object.fromEntries(
      Object.entries(providers).map(([id, credentials]) => [
        id,
        { ...credentials, requireEmailVerification: true },
      ]),
    )
    event.context.cloudAccountAuth = createAccountAuth(
      platformDatabase(event) as unknown as BetterAuthOptions['database'],
      { ...config, socialProviders, localDevelopment: import.meta.dev },
      event.context.cloudflare?.env?.EMAIL as PlatformEmailBinding,
      execution ? (task) => execution.waitUntil(task) : undefined,
    )
  }
  return event.context.cloudAccountAuth as ReturnType<typeof createAccountAuth>
}

import type { H3Event } from 'h3'
import type { BetterAuthOptions } from 'better-auth'
import { createAccountAuth } from './account-auth'
import { platformDatabase } from '../../../shared/platform/runtime'
import type { PlatformEmailBinding } from '../../../shared/platform/email'
/** Cache only within this H3 request; never share an identity between requests. */
export function cloudAccount(event: H3Event) {
  if (!event.context.cloudAccountAuth) {
    const config = useRuntimeConfig(event).platform
    const execution = event.context.cloudflare?.context as
      | { waitUntil(task: Promise<unknown>): void }
      | undefined
    event.context.cloudAccountAuth = createAccountAuth(
      platformDatabase(event) as unknown as BetterAuthOptions['database'],
      { ...config, localDevelopment: import.meta.dev },
      event.context.cloudflare?.env?.EMAIL as PlatformEmailBinding,
      execution ? (task) => execution.waitUntil(task) : undefined,
    )
  }
  return event.context.cloudAccountAuth as ReturnType<typeof createAccountAuth>
}

import { StorageConnectionError } from '@chronoframe/storage/connection-probe'
import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getRequestURL,
  sendError,
  setResponseHeader,
} from 'h3'
import type { H3Event, EventHandler, EventHandlerRequest } from 'h3'
import {
  createD1Directory,
  createD1Sessions,
} from '../../../packages/platform/src/index.ts'
import type { PlatformD1 } from '../../../packages/platform/src/index.ts'
import { createPlatformAccess } from '../../../packages/core/src/platform.ts'
import type { PlatformSession } from '../../../packages/core/src/platform.ts'
import { createEmailCodeCrypto } from './crypto.ts'

export const PLATFORM_COOKIE = '__Host-chronoframe-session'
export function platformDatabase(event: H3Event): PlatformD1 {
  const db = event.context.cloudflare?.env?.DB as PlatformD1 | undefined
  if (!db?.prepare || !db.batch)
    throw createError({
      statusCode: 503,
      statusMessage: 'Platform service unavailable',
    })
  return db
}
/** Prefer the original Worker Request, not Nitro's synthetic internal HTTP socket. */
export function platformRequestURL(event: H3Event): URL {
  const request = event.context.cloudflare?.request as Request | undefined
  return request
    ? new URL(request.url)
    : getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
}
export function platformPortalOrigin(
  event: H3Event,
  origin: string,
  requireOriginHeader = false,
): void {
  const request = platformRequestURL(event)
  if (
    request.origin !== origin ||
    (requireOriginHeader && getHeader(event, 'origin') !== origin)
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Portal origin required',
    })
  }
}
export async function platformSession(
  event: H3Event,
  secret: string,
): Promise<PlatformSession | null> {
  if (event.context.platformSessionResolver)
    return event.context.platformSessionResolver()
  const token = getCookie(event, PLATFORM_COOKIE)
  if (!token || secret.length < 32) return null
  if (!/^[a-f0-9-]{36}$/.test(token)) return null
  const crypto = await createEmailCodeCrypto(secret)
  return createD1Sessions(platformDatabase(event)).get(
    await crypto.mac(['platform-session', token]),
    Date.now(),
  )
}
export function platformAccess(event: H3Event) {
  return createPlatformAccess(createD1Directory(platformDatabase(event)))
}

/** Keep API failures in JSON instead of handing them to Nuxt's cached HTML error renderer. */
export function definePlatformHandler<T>(
  handler: (event: H3Event) => Promise<T>,
): EventHandler<EventHandlerRequest, T> {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      if (error instanceof StorageConnectionError) {
        setResponseHeader(event, 'Cache-Control', 'no-store')
        return sendError(
          event,
          createError({
            statusCode: 502,
            statusMessage: 'Storage connection check failed',
            data: {
              code: error.code,
              ...(error.providerCode
                ? { providerCode: error.providerCode }
                : {}),
              ...(error.providerStatus
                ? { providerStatus: error.providerStatus }
                : {}),
            },
          }),
          false,
        )
      }
      const code = (error as { statusCode?: number })?.statusCode
      const messages: Record<number, string> = {
        400: 'Invalid request',
        401: 'Authentication required or invalid code',
        403: 'Permission denied',
        404: 'Site not found',
        405: 'Method not allowed',
        409: 'Site address or settings conflict; reload and try again',
        429: 'Please wait before trying again',
        503: 'Platform service unavailable',
      }
      const statusCode = code && Object.hasOwn(messages, code) ? code : 503
      setResponseHeader(event, 'Cache-Control', 'no-store')
      sendError(
        event,
        createError({ statusCode, statusMessage: messages[statusCode] }),
        false,
      )
    }
  }) as EventHandler<EventHandlerRequest, T>
}

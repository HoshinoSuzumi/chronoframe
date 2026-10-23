import {
  createError,
  getRequestURL,
  getRequestHeaders,
  readRawBody,
  getHeader,
  sendWebResponse,
} from 'h3'
import type { H3Event } from 'h3'
import {
  platformDatabase,
  platformPortalOrigin,
  platformRequestURL,
} from '../../../shared/platform/runtime'
import { createEmailCodeCrypto } from '../../../shared/platform/crypto'
import { cloudAccount } from './cloud-account'
import { accountRouteAllowed } from './account-routes'

/** Keep credentials on the canonical origin and share account-level limits across Workers. */
export async function forwardAccountRequest(event: H3Event, rewrite?: string) {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, event.method !== 'GET')
  const path = rewrite ? '/api/auth' + rewrite : getRequestURL(event).pathname
  if (!accountRouteAllowed(path, event.method))
    throw createError({ statusCode: 404 })
  if (Number(getHeader(event, 'content-length')) > 32 * 1024)
    throw createError({ statusCode: 400 })
  const raw = event.method === 'GET' ? undefined : await readRawBody(event)
  if (raw && new TextEncoder().encode(raw).length > 32 * 1024)
    throw createError({ statusCode: 400 })
  if (
    raw &&
    [
      '/api/auth/sign-up/email',
      '/api/auth/sign-in/email',
      '/api/auth/sign-in/email-otp',
      '/api/auth/email-otp/send-verification-otp',
      '/api/auth/request-password-reset',
    ].includes(path)
  ) {
    let body: { email?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      throw createError({ statusCode: 400 })
    }
    if (typeof body.email === 'string' && body.email.length <= 254) {
      const mac = await createEmailCodeCrypto(config.secret)
      const key = await mac.mac([
        'account-attempt',
        path,
        body.email.trim().toLowerCase(),
      ])
      const now = Math.floor(Date.now() / (15 * 60_000))
      const row = await platformDatabase(event)
        .prepare(`INSERT INTO platform_auth_attempts(key, window_start, attempts) VALUES (?, ?, 1)
        ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END, window_start = excluded.window_start RETURNING attempts`)
        .bind(key, now)
        .first<{ attempts: number }>()
      const max = path.includes('sign-in') ? 15 : 5
      if (!row || row.attempts > max) throw createError({ statusCode: 429 })
    }
  }
  const url = new URL(
    path + getRequestURL(event).search,
    platformRequestURL(event).origin,
  )
  const request = new Request(url, {
    method: event.method,
    headers: new Headers(getRequestHeaders(event) as HeadersInit),
    ...(raw ? { body: raw } : {}),
  })
  const response = await cloudAccount(event).handler(request)
  response.headers.set('cache-control', 'no-store')
  response.headers.set('referrer-policy', 'no-referrer')
  return sendWebResponse(event, response)
}

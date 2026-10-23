import { createError, getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'
import type {
  PublicSiteContext,
  SiteVisitorGrant,
} from '../../../packages/core/src/platform.ts'
import { hasSiteVisitorGrant } from '../../../packages/core/src/platform.ts'
import { platformDatabase, platformRequestURL } from './runtime.ts'
import { createEmailCodeCrypto, visitorPasswordHash } from './crypto.ts'
export { visitorPasswordHash } from './crypto.ts'

const encoder = new TextEncoder()
const COOKIE = '__Host-chronoframe-visitor'
const TTL = 60 * 60 * 1000
/** Import the independent visitor MAC key, rejecting unconfigured deployments. */
async function signingKey(secret: string) {
  if (encoder.encode(secret).length < 32) throw createError({ statusCode: 503 })
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
/** Sign Host-bound Site/album grants without carrying any platform identity. */
export async function encodeVisitorGrants(
  secret: string,
  host: string,
  grants: readonly SiteVisitorGrant[],
): Promise<string> {
  const body = btoa(
    String.fromCharCode(...encoder.encode(JSON.stringify(grants))),
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(JSON.stringify(['visitor-v1', host, body])),
  )
  return body + '.' + btoa(String.fromCharCode(...new Uint8Array(signature)))
}
/** Verify the Host MAC and retain well-formed grants with bounded, unexpired lifetimes. */
export async function decodeVisitorGrants(
  secret: string,
  host: string,
  token: string | undefined,
): Promise<SiteVisitorGrant[]> {
  if (!token || token.length > 4096) return []
  try {
    const [body, signature, extra] = token.split('.')
    if (!body || !signature || extra) return []
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
      encoder.encode(JSON.stringify(['visitor-v1', host, body])),
    )
    if (!valid) return []
    const grants = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
      ),
    )
    if (!Array.isArray(grants) || grants.length > 10) return []
    return grants.filter(
      (g) =>
        g &&
        Number.isSafeInteger(g.siteId) &&
        g.siteId > 0 &&
        Number.isSafeInteger(g.albumId) &&
        g.albumId > 0 &&
        typeof g.revision === 'string' &&
        Number.isFinite(g.expiresAt) &&
        g.expiresAt > Date.now() &&
        g.expiresAt <= Date.now() + TTL,
    )
  } catch {
    return []
  }
}
/** Load this Site's album policy, rejecting absent or malformed verifier records. */
async function policy(
  event: H3Event,
  context: PublicSiteContext,
  albumId: number,
) {
  if (!Number.isSafeInteger(albumId) || albumId < 1)
    throw createError({ statusCode: 404 })
  const result = await platformDatabase(event)
    .prepare(
      'SELECT revision, salt, password_hash AS passwordHash FROM platform_album_access WHERE site_id = ? AND album_id = ?',
    )
    .bind(context.site.id, albumId)
    .first<{ revision: string; salt: string; passwordHash: string }>()
  if (!result) throw createError({ statusCode: 404 })
  if (
    !result.revision ||
    result.revision.length > 128 ||
    !result.salt ||
    result.salt.length > 128 ||
    !/^[0-9a-f]{64}$/.test(result.passwordHash)
  )
    throw createError({ statusCode: 503 })
  return result
}
/** Check the current password revision against visitor grants, never platform cookies. */
export async function visitorAccess(
  event: H3Event,
  context: PublicSiteContext,
  albumId: number,
  secret: string,
) {
  const current = await policy(event, context, albumId)
  const grants = await decodeVisitorGrants(
    secret,
    context.host,
    getCookie(event, COOKIE),
  )
  return {
    albumId,
    unlocked: hasSiteVisitorGrant(context, grants, albumId, current.revision),
  }
}
/** Verify a same-origin, rate-limited password attempt and issue a scoped visitor grant. */
export async function unlockVisitor(
  event: H3Event,
  context: PublicSiteContext,
  albumId: number,
  password: unknown,
  secret: string,
) {
  if (getHeader(event, 'origin') !== platformRequestURL(event).origin)
    throw createError({ statusCode: 403 })
  if (
    typeof password !== 'string' ||
    password.length < 1 ||
    password.length > 1024
  )
    throw createError({ statusCode: 400 })
  const current = await policy(event, context, albumId)
  const client = getHeader(event, 'cf-connecting-ip')
  if (!event.context.cloudflare || !client)
    throw createError({ statusCode: 503 })
  const mac = await createEmailCodeCrypto(secret)
  const clientKey = await mac.mac([
    'visitor-attempt',
    String(context.site.id),
    client,
  ])
  const window = Math.floor(Date.now() / 60_000)
  const row = await platformDatabase(event)
    .prepare(`INSERT INTO platform_visitor_limits(key, window_start, attempts) VALUES(?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END, window_start = excluded.window_start RETURNING attempts`)
    .bind(clientKey, window)
    .first<{ attempts: number }>()
  if (!row || row.attempts > 5) throw createError({ statusCode: 429 })
  const hash = await visitorPasswordHash(password, current.salt)
  // Verify equality with Web Crypto rather than comparing password-derived strings.
  const hashKey = await signingKey(secret)
  const proof = await crypto.subtle.sign(
    'HMAC',
    hashKey,
    encoder.encode(current.passwordHash),
  )
  if (
    !(await crypto.subtle.verify('HMAC', hashKey, proof, encoder.encode(hash)))
  )
    throw createError({ statusCode: 401 })
  const grants = (
    await decodeVisitorGrants(secret, context.host, getCookie(event, COOKIE))
  ).filter((g) => g.siteId === context.site.id && g.albumId !== albumId)
  grants.push({
    siteId: context.site.id,
    albumId,
    revision: current.revision,
    expiresAt: Date.now() + TTL,
  })
  setCookie(
    event,
    COOKIE,
    await encodeVisitorGrants(secret, context.host, grants.slice(-10)),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TTL / 1000,
    },
  )
  return { albumId, unlocked: true }
}

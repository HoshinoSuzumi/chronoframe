import {
  createHmac,
  randomBytes,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { tables, useDB } from './db'

const cookieName = 'album_access'
const grantLifetimeSeconds = 7 * 24 * 60 * 60
const maxGrants = 30
type Grant = { id: number; hash: string; expiresAt: number }
const scryptAsync = promisify(scrypt)
function sessionSecret(): string {
  const secret = process.env.NUXT_SESSION_PASSWORD
  if (!secret) {
    throw new Error('NUXT_SESSION_PASSWORD is not configured')
  }
  return secret
}

const passwordVersion = (hash: string) =>
  createHmac('sha256', sessionSecret())
    .update('album-password-version\0')
    .update(hash)
    .digest('hex')
    .slice(0, 32)

export function hashAlbumPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export async function verifyAlbumPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split(':')
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false
  const actual = await scryptAsync(password, salt, 64)
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}

function signature(payload: string): string {
  return createHmac('sha256', sessionSecret())
    .update('album-access-cookie\0')
    .update(payload)
    .digest('base64url')
}

function readGrants(event: H3Event): Grant[] {
  const token = getCookie(event, cookieName)
  if (!token || token.length > 4000) return []
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return []
  const [, payload, mac] = match
  const actual = signature(payload)
  if (
    mac.length !== actual.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(actual))
  )
    return []
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    )
    if (!Array.isArray(parsed) || parsed.length > maxGrants) return []
    const now = Date.now()
    if (
      !parsed.every(
        (item): item is Grant =>
          Number.isSafeInteger(item?.id) &&
          item.id > 0 &&
          typeof item?.hash === 'string' &&
          /^[a-f0-9]{32}$/.test(item.hash) &&
          Number.isSafeInteger(item?.expiresAt) &&
          item.expiresAt <= now + grantLifetimeSeconds * 1000,
      )
    )
      return []
    return parsed.filter((grant) => grant.expiresAt > now)
  } catch {
    return []
  }
}

export function grantAlbumAccess(
  event: H3Event,
  id: number,
  hash: string,
): void {
  const grants = readGrants(event).filter((grant) => grant.id !== id)
  grants.push({
    id,
    hash: passwordVersion(hash),
    expiresAt: Date.now() + grantLifetimeSeconds * 1000,
  })
  const payload = Buffer.from(
    JSON.stringify(grants.slice(-maxGrants)),
  ).toString('base64url')
  const secure =
    getHeader(event, 'x-forwarded-proto') === 'https' ||
    getRequestURL(event).protocol === 'https:'
  setCookie(event, cookieName, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  })
}

export async function albumAccess(event: H3Event) {
  const session = await getUserSession(event)
  const admin = Boolean(session.user)
  const grants = readGrants(event)
  const canAccess = (album: {
    id: number
    isHidden: boolean
    passwordHash: string | null
  }) =>
    admin ||
    (!album.isHidden &&
      (!album.passwordHash ||
        grants.some(
          (grant) =>
            grant.id === album.id &&
            grant.hash === passwordVersion(album.passwordHash!),
        )))
  return { admin, canAccess }
}

export async function assertPhotoAccess(
  event: H3Event,
  key: string,
  requireKnown = false,
): Promise<boolean> {
  const { admin, canAccess } = await albumAccess(event)
  // Match the local storage provider's path cleanup, but never silently
  // authorize a non-canonical spelling that the provider would normalize.
  const isAbsoluteUrl = /^https?:\/\//i.test(key)
  const cleanKey = isAbsoluteUrl
    ? key
    : key.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '')
  if (!isAbsoluteUrl && key !== cleanKey) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }

  const db = useDB()
  const values = [cleanKey, `/storage/${cleanKey}`, `/image/${cleanKey}`]
  const photos = db
    .select()
    .from(tables.photos)
    .where(
      or(
        ...values.flatMap((value) => [
          eq(tables.photos.id, value),
          eq(tables.photos.storageKey, value),
          eq(tables.photos.thumbnailKey, value),
          eq(tables.photos.originalUrl, value),
          eq(tables.photos.thumbnailUrl, value),
          eq(tables.photos.livePhotoVideoKey, value),
          eq(tables.photos.livePhotoVideoUrl, value),
        ]),
      ),
    )
    .all()
  const normalized = db.select().from(tables.photos).all()
  const matches = normalized.filter((photo) =>
    [
      photo.id,
      photo.storageKey,
      photo.thumbnailKey,
      photo.originalUrl,
      photo.thumbnailUrl,
      photo.livePhotoVideoKey,
      photo.livePhotoVideoUrl,
    ]
      .filter((value): value is string => Boolean(value))
      .some(
        (value) =>
          value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '') ===
          cleanKey,
      ),
  )
  const matchedPhotos = [
    ...new Map(
      [...photos, ...matches].map((photo) => [photo.id, photo]),
    ).values(),
  ]
  if (matchedPhotos.length === 0) {
    if (!admin || requireKnown) {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
    return false
  }
  let restricted = false
  for (const photo of matchedPhotos) {
    const memberships = db
      .select({ album: tables.albums })
      .from(tables.albumPhotos)
      .innerJoin(
        tables.albums,
        eq(tables.albumPhotos.albumId, tables.albums.id),
      )
      .where(eq(tables.albumPhotos.photoId, photo.id))
      .all()
    if (memberships.some(({ album }) => album.isHidden || album.passwordHash)) {
      restricted = true
    }
    if (
      !admin &&
      (memberships.some(({ album }) => album.isHidden) ||
        (memberships.some(({ album }) => album.passwordHash) &&
          !memberships.some(
            ({ album }) => album.passwordHash && canAccess(album),
          )))
    ) {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
  }
  return restricted
}

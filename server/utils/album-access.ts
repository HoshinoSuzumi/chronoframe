import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { eq, inArray } from 'drizzle-orm'
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

export async function hashAlbumPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
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

type AlbumAccessTarget = {
  id: number
  isHidden: boolean
  passwordHash: string | null
}

function photoNotFound() {
  return createError({ statusCode: 404, statusMessage: 'Photo not found' })
}

function photoAccessDenied(
  admin: boolean,
  memberships: { album: AlbumAccessTarget }[],
  canAccess: (album: AlbumAccessTarget) => boolean,
): boolean {
  if (admin) return false
  return (
    memberships.some(({ album }) => album.isHidden) ||
    (memberships.some(({ album }) => album.passwordHash) &&
      !memberships.some(({ album }) => album.passwordHash && canAccess(album)))
  )
}

export async function albumAccess(event: H3Event) {
  const session = await getUserSession(event)
  const admin = Boolean(session.user)
  const grants = readGrants(event)
  const canAccess = (album: AlbumAccessTarget) =>
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
    throw photoNotFound()
  }

  const db = useDB()
  // photo_access_keys is filled when a photo is written, including tidied
  // aliases of storage keys and /storage or /image URLs. This is one index
  // lookup; it does not read photo payloads.
  const matchedPhotos = db
    .select({ id: tables.photoAccessKeys.photoId })
    .from(tables.photoAccessKeys)
    .where(eq(tables.photoAccessKeys.accessKey, cleanKey))
    .all()
  if (matchedPhotos.length === 0) {
    if (!admin || requireKnown) throw photoNotFound()
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
    if (photoAccessDenied(admin, memberships, canAccess)) throw photoNotFound()
  }
  return restricted
}

const photoIdQueryChunkSize = 500

// Indexed photo-id check with the same album rule as assertPhotoAccess.
// Unknown ids and photos in hidden or locked albums are both omitted, so a
// guessed id cannot be confirmed. Reactions are keyed by photo id, so this
// looks those ids up directly instead of matching storage keys.
export async function filterAccessiblePhotoIds(
  event: H3Event,
  photoIds: string[],
): Promise<Set<string>> {
  const uniqueIds = [...new Set(photoIds.filter((id) => id.length > 0))]
  if (uniqueIds.length === 0) return new Set()

  const { admin, canAccess } = await albumAccess(event)
  const db = useDB()
  const accessible = new Set<string>()

  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += photoIdQueryChunkSize
  ) {
    const chunk = uniqueIds.slice(offset, offset + photoIdQueryChunkSize)
    const existing = db
      .select({ id: tables.photos.id })
      .from(tables.photos)
      .where(inArray(tables.photos.id, chunk))
      .all()
    if (existing.length === 0) continue

    const ids = existing.map((photo) => photo.id)
    if (admin) {
      for (const id of ids) accessible.add(id)
      continue
    }

    const rows = db
      .select({
        photoId: tables.albumPhotos.photoId,
        album: tables.albums,
      })
      .from(tables.albumPhotos)
      .innerJoin(
        tables.albums,
        eq(tables.albumPhotos.albumId, tables.albums.id),
      )
      .where(inArray(tables.albumPhotos.photoId, ids))
      .all()
    const membershipsByPhoto = new Map<string, { album: AlbumAccessTarget }[]>()
    for (const row of rows) {
      const memberships = membershipsByPhoto.get(row.photoId)
      const membership = { album: row.album }
      if (memberships) memberships.push(membership)
      else membershipsByPhoto.set(row.photoId, [membership])
    }

    for (const id of ids) {
      const memberships = membershipsByPhoto.get(id) ?? []
      if (!photoAccessDenied(admin, memberships, canAccess)) accessible.add(id)
    }
  }

  return accessible
}

export async function assertPhotoIdAccess(event: H3Event, photoId: string) {
  const accessible = await filterAccessiblePhotoIds(event, [photoId])
  if (!accessible.has(photoId)) throw photoNotFound()
}

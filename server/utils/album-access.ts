import {
  createHash,
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
type Grant = { id: number; hash: string }
const scryptAsync = promisify(scrypt)
const passwordVersion = (hash: string) =>
  createHash('sha256').update(hash).digest('hex').slice(0, 16)

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
  const secret = process.env.NUXT_SESSION_PASSWORD
  if (!secret) {
    throw new Error('NUXT_SESSION_PASSWORD is not configured')
  }
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function readGrants(event: H3Event): Grant[] {
  const token = getCookie(event, cookieName)
  if (!token || token.length > 4000) return []
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return []
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
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is Grant =>
        Number.isSafeInteger(item?.id) && typeof item?.hash === 'string',
    )
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
  grants.push({ id, hash: passwordVersion(hash) })
  const payload = Buffer.from(JSON.stringify(grants.slice(-60))).toString(
    'base64url',
  )
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
): Promise<boolean> {
  const db = useDB()
  const values = [key, `/storage/${key}`, `/image/${key}`]
  const photo = db
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
    .get()
  if (!photo) return false
  const { admin, canAccess } = await albumAccess(event)
  const memberships = db
    .select({ album: tables.albums })
    .from(tables.albumPhotos)
    .innerJoin(tables.albums, eq(tables.albumPhotos.albumId, tables.albums.id))
    .where(eq(tables.albumPhotos.photoId, photo.id))
    .all()
  const restricted = memberships.some(
    ({ album }) => album.isHidden || album.passwordHash,
  )
  if (admin) return restricted
  if (
    memberships.some(({ album }) => album.isHidden) ||
    (memberships.some(({ album }) => album.passwordHash) &&
      !memberships.some(({ album }) => album.passwordHash && canAccess(album)))
  ) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }
  return restricted
}

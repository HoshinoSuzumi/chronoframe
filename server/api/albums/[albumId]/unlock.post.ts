import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { grantAlbumAccess, verifyAlbumPassword } from '../../../utils/album-access'

const UNLOCK_WINDOW_MS = 60_000
const UNLOCK_MAX_ATTEMPTS = 8
const UNLOCK_MAX_ENTRIES = 5_000
const unlockAttempts = new Map<string, { count: number; resetAt: number }>()

function pruneUnlockAttempts(now: number) {
  for (const [key, attempt] of unlockAttempts) {
    if (attempt.resetAt <= now) unlockAttempts.delete(key)
  }
}

function assertUnlockRateLimit(event: H3Event, albumId: number) {
  const ip = getRequestIP(event, { xForwardedFor: false }) || 'unknown'
  const now = Date.now()
  pruneUnlockAttempts(now)
  const key = `${albumId}:${ip}`
  const attempt = unlockAttempts.get(key)
  if (!attempt || attempt.resetAt <= now) {
    if (unlockAttempts.size >= UNLOCK_MAX_ENTRIES) {
      unlockAttempts.delete(unlockAttempts.keys().next().value as string)
    }
    unlockAttempts.set(key, { count: 1, resetAt: now + UNLOCK_WINDOW_MS })
    return
  }
  if (attempt.count >= UNLOCK_MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: 'Too many unlock attempts' })
  }
  attempt.count += 1
}

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(event,
    z.object({ albumId: z.coerce.number().int().positive() }).parse)
  const { password } = await readValidatedBody(event,
    z.object({ password: z.string().min(1).max(128) }).parse)
  const clientIp = getRequestIP(event, { xForwardedFor: false }) || 'unknown'
  const album = useDB().select().from(tables.albums)
    .where(eq(tables.albums.id, albumId)).get()
  if (!album || album.isHidden || !album.passwordHash) {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }
  assertUnlockRateLimit(event, albumId)
  if (!await verifyAlbumPassword(password, album.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect album password' })
  }
  unlockAttempts.delete(`${albumId}:${clientIp}`)
  grantAlbumAccess(event, album.id, album.passwordHash)
  return { ok: true }
})

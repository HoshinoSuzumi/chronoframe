import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  grantAlbumAccess,
  verifyAlbumPassword,
} from '../../../utils/album-access'
import {
  assertAlbumUnlockRateLimit,
  clearAlbumUnlockClient,
} from '../../../utils/album-unlock-limit'

const trustProxy = process.env.NUXT_TRUST_PROXY === 'true'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({ albumId: z.coerce.number().int().positive() }).parse,
  )
  const { password } = await readValidatedBody(
    event,
    z.object({ password: z.string().min(1).max(128) }).parse,
  )
  const clientIp =
    getRequestIP(event, { xForwardedFor: trustProxy }) || 'unknown'
  const album = useDB()
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()
  if (!album || album.isHidden || !album.passwordHash) {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }
  assertAlbumUnlockRateLimit(albumId, clientIp)
  if (!(await verifyAlbumPassword(password, album.passwordHash))) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Incorrect album password',
    })
  }
  clearAlbumUnlockClient(albumId, clientIp)
  grantAlbumAccess(event, album.id, album.passwordHash)
  return { ok: true }
})

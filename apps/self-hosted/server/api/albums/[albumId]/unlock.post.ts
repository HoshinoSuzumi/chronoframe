import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { ALBUM_PASSWORD_MAX_LENGTH } from '#shared/utils/album'
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
  // Keep min(1) so albums set before the stronger length policy can still unlock.
  const { password } = await readValidatedBody(
    event,
    z.object({ password: z.string().min(1).max(ALBUM_PASSWORD_MAX_LENGTH) })
      .parse,
  )
  const clientIp =
    getRequestIP(event, { xForwardedFor: trustProxy }) || 'unknown'
  const album = useDB()
    .select()
    .from(tables.albums)
    .where(
      siteAnd(
        eq(tables.albums.id, albumId),
        siteEq(tables.albums.siteId, DEFAULT_SITE.id),
      ),
    )
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

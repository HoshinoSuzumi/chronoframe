import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { grantAlbumAccess, verifyAlbumPassword } from '../../../utils/album-access'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(event,
    z.object({ albumId: z.coerce.number().int().positive() }).parse)
  const { password } = await readValidatedBody(event,
    z.object({ password: z.string().min(1).max(128) }).parse)
  const album = useDB().select().from(tables.albums)
    .where(eq(tables.albums.id, albumId)).get()
  if (!album || album.isHidden || !album.passwordHash) {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }
  if (!verifyAlbumPassword(password, album.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect album password' })
  }
  grantAlbumAccess(event, album.id, album.passwordHash)
  return { ok: true }
})

import { eq } from 'drizzle-orm'
import z from 'zod'

import { fetchAlbumPhotos } from '../../../utils/album-visibility'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const db = useDB()

  const album = db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // 检查相册是否隐藏，如果隐藏则需要用户登录才能访问
  const session = await getUserSession(event)
  const isLoggedIn = Boolean(session.user)

  if (album.isHidden && !isLoggedIn) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // Anonymous viewers must not see photos that are also members of any
  // hidden album — otherwise a photo shared between a public and a hidden
  // album would leak through the public album (see issue #299).
  const photos = await fetchAlbumPhotos(db, tables, albumId, isLoggedIn)

  return {
    ...album,
    photos,
  }
})

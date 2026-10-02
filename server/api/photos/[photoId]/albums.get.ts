import { eq } from 'drizzle-orm'
import z from 'zod'
import { albumAccess } from '../../../utils/album-access'

export default eventHandler(async (event) => {
  const { photoId } = await getValidatedRouterParams(
    event,
    z.object({
      photoId: z.string(),
    }).parse,
  )

  const db = useDB()
  const { canAccess } = await albumAccess(event)

  // 获取包含该照片的所有相册
  const albums = await db
    .select({
      id: tables.albums.id,
      isHidden: tables.albums.isHidden,
      passwordHash: tables.albums.passwordHash,
      title: tables.albums.title,
      description: tables.albums.description,
      coverPhotoId: tables.albums.coverPhotoId,
      createdAt: tables.albums.createdAt,
      updatedAt: tables.albums.updatedAt,
    })
    .from(tables.albums)
    .innerJoin(
      tables.albumPhotos,
      eq(tables.albums.id, tables.albumPhotos.albumId),
    )
    .where(eq(tables.albumPhotos.photoId, photoId))
    .all()

  return albums.filter(canAccess).map(({ passwordHash, ...album }) => ({
    ...album, hasPassword: Boolean(passwordHash),
  }))
})

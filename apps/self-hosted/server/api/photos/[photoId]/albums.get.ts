import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
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
      slug: tables.albumSlugs.slug,
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
    .leftJoin(
      tables.albumSlugs,
      siteAnd(
        eq(tables.albumSlugs.albumId, tables.albums.id),
        eq(tables.albumSlugs.siteId, tables.albums.siteId),
        eq(tables.albumSlugs.isCurrent, true),
      ),
    )
    .where(
      siteAnd(
        eq(tables.albumPhotos.photoId, photoId),
        siteEq(tables.albums.siteId, DEFAULT_SITE.id),
      ),
    )
    .all()

  return albums.filter(canAccess).map(({ passwordHash, ...album }) => ({
    ...album,
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString(),
    hasPassword: Boolean(passwordHash),
  }))
})

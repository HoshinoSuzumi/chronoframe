import { eq } from 'drizzle-orm'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const photoId = getRouterParam(event, 'photoId')

  if (!photoId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Photo ID is required',
    })
  }

  try {
    const db = useDB()

    // 查询照片信息
    const photos = await db
      .select()
      .from(tables.photos)
      .where(eq(tables.photos.id, photoId))
      .limit(1)

    if (photos.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Photo not found',
      })
    }

    const photo = photos[0]

    return {
      id: photo.id,
      title: photo.title,
      isLivePhoto: Boolean(photo.isLivePhoto),
      livePhotoVideoUrl: photo.livePhotoVideoUrl,
      originalUrl: photo.originalUrl,
      thumbnailUrl: photo.thumbnailUrl,
    }
  } catch (error) {
    logger.chrono.error('Failed to get photo details:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get photo details',
    })
  }
})

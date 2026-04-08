import { photos } from '~~/server/database/schema'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const method = getMethod(event)

  if (method === 'GET') {
    // 获取最新处理完成的照片
    const recentPhotos = await useDB()
      .select()
      .from(photos)
      .orderBy(photos.lastModified)
      .limit(10)
      .all()

    return {
      recentPhotos,
      timestamp: new Date().toISOString(),
    }
  } else {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed',
    })
  }
})

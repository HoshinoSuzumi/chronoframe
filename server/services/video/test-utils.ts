import { eq, and, inArray } from 'drizzle-orm'
import { findLivePhotoVideoForImage } from '../video/livephoto'

/**
 * 测试 LivePhoto 检测功能的工具函数
 */
export const testLivePhotoDetection = async (imageKey: string) => {
  logger.chrono.info(`Testing LivePhoto detection for: ${imageKey}`)

  try {
    const result = await findLivePhotoVideoForImage(imageKey)

    if (result) {
      logger.chrono.success(`LivePhoto video found:`, {
        imageKey,
        videoKey: result.videoKey,
        videoSize: result.videoSize,
      })
      return {
        found: true,
        videoKey: result.videoKey,
        videoSize: result.videoSize,
      }
    } else {
      logger.chrono.info(`No LivePhoto video found for: ${imageKey}`)
      return {
        found: false,
      }
    }
  } catch (error) {
    logger.chrono.error(
      `LivePhoto detection test failed for ${imageKey}:`,
      error,
    )
    return {
      found: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 批量测试现有照片的 LivePhoto 检测
 */
export const batchTestLivePhotoDetection = async (photoIds?: string[]) => {
  const db = useDB()

  try {
    let photos

    if (photoIds && Array.isArray(photoIds) && photoIds.length > 0) {
      // 只处理指定的照片
      photos = await db
        .select()
        .from(tables.photos)
        .where(
          and(
            eq(tables.photos.isLivePhoto, 0),
            inArray(tables.photos.id, photoIds),
          ),
        )
    } else {
      // 获取所有还不是 LivePhoto 的照片
      photos = await db
        .select()
        .from(tables.photos)
        .where(eq(tables.photos.isLivePhoto, 0))
    }

    logger.chrono.info(
      `Testing ${photos.length} photos for LivePhoto detection`,
    )

    const results = []

    for (const photo of photos) {
      const result = await testLivePhotoDetection(photo.storageKey!)
      results.push({
        photoId: photo.id,
        storageKey: photo.storageKey,
        ...result,
      })

      // 避免过快请求存储
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const foundCount = results.filter((r) => r.found).length
    logger.chrono.success(
      `LivePhoto detection test completed. Found ${foundCount} potential LivePhotos out of ${photos.length} photos`,
    )

    return {
      total: photos.length,
      processed: photos.length,
      found: foundCount,
      results: results.filter((r) => r.found), // 只返回找到的
    }
  } catch (error) {
    logger.chrono.error('Batch LivePhoto detection test failed:', error)
    throw error
  }
}

import {
  processSpecificLivePhotoVideo,
  scanAndProcessExistingLivePhotos,
} from '~~/server/services/video/scanner'
import { eq } from 'drizzle-orm'
import { findLivePhotoVideoForImage } from '~~/server/services/video/livephoto'
import { getStorageManager } from '~~/server/plugins/2_storage'
import { batchTestLivePhotoDetection } from '~~/server/services/video/test-utils'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readBody(event)
  const { action, videoKey, photoId, photoIds } = body

  if (!action) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Action is required',
    })
  }

  try {
    switch (action) {
      case 'scan': { // 扫描现有文件
        const scanResults = await scanAndProcessExistingLivePhotos()
        return {
          message: 'Scan completed',
          results: scanResults,
        }
      }

      case 'detect': { // 批量检测现有照片的 LivePhoto 视频
        const results = await batchTestLivePhotoDetection(photoIds)
        return {
          message: 'Batch LivePhoto detection completed',
          results,
        }
      }

      case 'process': { // 处理特定文件
        if (!videoKey) {
          throw createError({
            statusCode: 400,
            statusMessage: 'videoKey is required for process action',
          })
        }

        const success = await processSpecificLivePhotoVideo(videoKey)
        return {
          message: success
            ? 'LivePhoto processed successfully'
            : 'Failed to process LivePhoto',
          success,
          videoKey,
        }
      }

      case 'update-photo': // 为特定照片检查和更新 LivePhoto 状态
      {
        if (!photoId) {
          throw createError({
            statusCode: 400,
            statusMessage: 'photoId is required for update-photo action',
          })
        }

        const db = useDB()
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
        const livePhotoVideo = await findLivePhotoVideoForImage(
          photo.storageKey!,
        )

        if (livePhotoVideo) {
          const storageProvider = getStorageManager().getProvider()

          await db
            .update(tables.photos)
            .set({
              isLivePhoto: 1,
              livePhotoVideoUrl: storageProvider.getPublicUrl(
                livePhotoVideo.videoKey,
              ),
              livePhotoVideoKey: livePhotoVideo.videoKey,
            })
            .where(eq(tables.photos.id, photoId))

          return {
            message: 'Photo updated to LivePhoto successfully',
            success: true,
            photoId,
            videoKey: livePhotoVideo.videoKey,
          }
        } else {
          return {
            message: 'No matching video found for this photo',
            success: false,
            photoId,
          }
        }
      }

      default:
        throw createError({
          statusCode: 400,
          statusMessage:
            'Invalid action. Use "scan", "detect", "process", or "update-photo"',
        })
    }
  } catch (error) {
    logger.chrono.error('LivePhoto management error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process LivePhoto management request',
    })
  }
})

import { createSiteRepository } from '@chronoframe/database'
import { storageForPhoto } from '../../utils/object-storage'
import type { StorageProvider } from '@chronoframe/storage'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { isLivePhotoVideo } from '@chronoframe/media/livephoto'
import path from 'path'
import { eq } from 'drizzle-orm'
import { getStorageManager } from '~~/server/plugins/3.storage'

/**
 * 处理 LivePhoto MOV 文件，匹配相同文件名的照片并更新 LivePhoto 信息
 */
export const processLivePhotoVideo = async (
  videoKey: string,
  _videoSize: number,
): Promise<boolean> => {
  let storageProvider = getStorageManager().getProvider()
  const db = useDB()

  try {
    // 从视频文件名提取基础名称（去除扩展名）
    const videoBaseName = path.basename(videoKey, path.extname(videoKey))
    const videoDir = path.dirname(videoKey)

    logger.chrono.info(
      `Processing LivePhoto video: ${videoKey}, looking for photo with base name: ${videoBaseName}`,
    )

    // 查找可能匹配的照片文件名模式
    // LivePhoto 通常会有相同的基础文件名，但照片可能是 .HEIC/.JPG 等格式
    const possiblePhotoKeys = [
      path.join(videoDir, `${videoBaseName}.HEIC`).replace(/\\/g, '/'),
      path.join(videoDir, `${videoBaseName}.heic`).replace(/\\/g, '/'),
      path.join(videoDir, `${videoBaseName}.JPG`).replace(/\\/g, '/'),
      path.join(videoDir, `${videoBaseName}.jpg`).replace(/\\/g, '/'),
      path.join(videoDir, `${videoBaseName}.JPEG`).replace(/\\/g, '/'),
      path.join(videoDir, `${videoBaseName}.jpeg`).replace(/\\/g, '/'),
    ]

    // 在数据库中查找匹配的照片
    let matchedPhoto = null
    for (const photoKey of possiblePhotoKeys) {
      const photos = await db
        .select()
        .from(tables.photos)
        .where(
          siteAnd(
            eq(tables.photos.storageKey, photoKey),
            siteEq(tables.photos.siteId, DEFAULT_SITE.id),
          ),
        )
        .limit(1)

      if (photos.length > 0) {
        matchedPhoto = photos[0]
        logger.chrono.info(`Found matching photo: ${photoKey}`)
        break
      }
    }

    if (!matchedPhoto) {
      logger.chrono.warn(
        `No matching photo found for LivePhoto video: ${videoKey}`,
      )
      return false
    }

    const repository = createSiteRepository(db, DEFAULT_SITE)
    const snapshot = await repository.capturePhoto(matchedPhoto.id)
    if (!snapshot) return false
    storageProvider = await storageForPhoto(matchedPhoto.id, storageProvider)
    if (!(await storageProvider.getFileMeta(videoKey))) return false
    await repository.updatePhotoSnapshot(matchedPhoto.id, snapshot.version, {
      isLivePhoto: 1,
      livePhotoVideoUrl: storageProvider.getPublicUrl(videoKey),
      livePhotoVideoKey: videoKey,
    })

    logger.chrono.success(
      `Successfully processed LivePhoto: ${matchedPhoto.id}, video: ${videoKey}`,
    )
    return true
  } catch (error) {
    logger.chrono.error(`Failed to process LivePhoto video ${videoKey}:`, error)
    return false
  }
}

/**
 * 检查存储桶中是否有与照片对应的 LivePhoto 视频文件
 */
export const findLivePhotoVideoForImage = async (
  imageKey: string,
  storageProvider: StorageProvider = getStorageManager().getProvider(),
): Promise<{ videoKey: string; videoSize: number } | null> => {
  try {
    // 从图片文件名提取基础名称（去除扩展名）
    const imageBaseName = path.basename(imageKey, path.extname(imageKey))
    const imageDir = path.dirname(imageKey)

    logger.chrono.info(
      `Checking for LivePhoto video for image: ${imageKey}, base name: ${imageBaseName}`,
    )

    // 查找可能匹配的视频文件名模式
    const possibleVideoKeys = [
      path.join(imageDir, `${imageBaseName}.MOV`).replace(/\\/g, '/'),
      path.join(imageDir, `${imageBaseName}.mov`).replace(/\\/g, '/'),
    ]

    // 检查存储中是否存在对应的视频文件
    for (const videoKey of possibleVideoKeys) {
      try {
        const meta = await storageProvider.getFileMeta(videoKey)
        if (meta) {
          // Custom metadata endpoints may omit size; retain a compatibility fallback.
          const videoSize =
            typeof meta.size === 'number' &&
            Number.isFinite(meta.size) &&
            meta.size >= 0
              ? meta.size
              : (await storageProvider.get(videoKey))?.length
          if (videoSize === undefined) continue

          // 检查是否符合 LivePhoto 视频的特征
          const fileName = path.basename(videoKey)
          if (isLivePhotoVideo(fileName, videoSize)) {
            logger.chrono.info(`Found matching LivePhoto video: ${videoKey}`)
            return { videoKey, videoSize }
          } else {
            logger.chrono.warn(
              `Video file found but doesn't match LivePhoto criteria: ${videoKey} (size: ${videoSize})`,
            )
          }
        }
      } catch {
        // 文件不存在，继续检查下一个
        continue
      }
    }

    logger.chrono.info(
      `No matching LivePhoto video found for image: ${imageKey}`,
    )
    return null
  } catch (error) {
    logger.chrono.error(
      `Failed to check for LivePhoto video for ${imageKey}:`,
      error,
    )
    return null
  }
}

/**
 * 检查文件是否为 MOV 视频格式
 */
export const isVideoFile = (fileName: string): boolean => {
  const extName = path.extname(fileName).toLowerCase()
  return ['.mov', '.mp4'].includes(extName)
}

/**
 * 检查文件是否可能是 LivePhoto 的 MOV 文件
 * LivePhoto 的 MOV 文件通常很小（几MB以内）
 */
export { isLivePhotoVideo }

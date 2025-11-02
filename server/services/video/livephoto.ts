import path from 'path'
import { eq } from 'drizzle-orm'
import { getStorageManager } from '~~/server/plugins/3.storage'

/**
 * 处理 LivePhoto MOV 文件，匹配相同文件名的照片并更新 LivePhoto 信息
 */
export const processLivePhotoVideo = async (
  videoKey: string,
  _videoSize: number
): Promise<boolean> => {
  const storageProvider = getStorageManager().getProvider()
  const db = useDB()
  
  try {
    // 从视频文件名提取基础名称（去除扩展名）
    const videoBaseName = path.basename(videoKey, path.extname(videoKey))
    const videoDir = path.dirname(videoKey)
    
    logger.chrono.info(`Processing LivePhoto video: ${videoKey}, looking for photo with base name: ${videoBaseName}`)
    
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
        .where(eq(tables.photos.storageKey, photoKey))
        .limit(1)
      
      if (photos.length > 0) {
        matchedPhoto = photos[0]
        logger.chrono.info(`Found matching photo: ${photoKey}`)
        break
      }
    }
    
    if (!matchedPhoto) {
      logger.chrono.warn(`No matching photo found for LivePhoto video: ${videoKey}`)
      return false
    }
    
    // 获取视频的公共 URL
    const videoUrl = storageProvider.getPublicUrl(videoKey)
    
    // 更新照片记录，设置 LivePhoto 信息
    await db
      .update(tables.photos)
      .set({
        isLivePhoto: 1,
        livePhotoVideoUrl: videoUrl,
        livePhotoVideoKey: videoKey,
      })
      .where(eq(tables.photos.id, matchedPhoto.id))
    
    logger.chrono.success(`Successfully processed LivePhoto: ${matchedPhoto.id}, video: ${videoKey}`)
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
  imageKey: string
): Promise<{ videoKey: string; videoSize: number } | null> => {
  const storageProvider = getStorageManager().getProvider()
  
  try {
    // 从图片文件名提取基础名称（去除扩展名）
    const imageBaseName = path.basename(imageKey, path.extname(imageKey))
    const imageDir = path.dirname(imageKey)
    
    logger.chrono.info(`Checking for LivePhoto video for image: ${imageKey}, base name: ${imageBaseName}`)
    
    // 查找可能匹配的视频文件名模式
    const possibleVideoKeys = [
      path.join(imageDir, `${imageBaseName}.MOV`).replace(/\\/g, '/'),
      path.join(imageDir, `${imageBaseName}.mov`).replace(/\\/g, '/'),
    ]
    
    // 检查存储中是否存在对应的视频文件
    for (const videoKey of possibleVideoKeys) {
      try {
        const videoBuffer = await storageProvider.get(videoKey)
        if (videoBuffer) {
          const videoSize = videoBuffer.length
          
          // 检查是否符合 LivePhoto 视频的特征
          const fileName = path.basename(videoKey)
          if (isLivePhotoVideo(fileName, videoSize)) {
            logger.chrono.info(`Found matching LivePhoto video: ${videoKey}`)
            return { videoKey, videoSize }
          } else {
            logger.chrono.warn(`Video file found but doesn't match LivePhoto criteria: ${videoKey} (size: ${videoSize})`)
          }
        }
      } catch {
        // 文件不存在，继续检查下一个
        continue
      }
    }
    
    logger.chrono.info(`No matching LivePhoto video found for image: ${imageKey}`)
    return null
    
  } catch (error) {
    logger.chrono.error(`Failed to check for LivePhoto video for ${imageKey}:`, error)
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
export const isLivePhotoVideo = (fileName: string, fileSize: number): boolean => {
  const extName = path.extname(fileName).toLowerCase()
  
  // 检查是否为 MOV 格式
  if (extName !== '.mov') {
    return false
  }
  
  const maxLivePhotoSize = 12 * 1024 * 1024 // 12MB
  return fileSize <= maxLivePhotoSize
}

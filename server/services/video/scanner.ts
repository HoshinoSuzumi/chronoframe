import { getStorageManager } from '~~/server/plugins/3.storage'
import { processLivePhotoVideo, isLivePhotoVideo } from '../video/livephoto'

/**
 * 批量扫描存储中的 MOV 文件，尝试匹配 LivePhoto
 */
export const scanAndProcessExistingLivePhotos = async (): Promise<{
  processed: number
  matched: number
  errors: string[]
}> => {
  const results = {
    processed: 0,
    matched: 0,
    errors: [] as string[],
  }

  try {
    logger.chrono.info('Starting scan for existing LivePhoto videos...')

    // 这里需要根据你的存储提供商实现列出所有文件的功能
    // 如果你的存储提供商支持列出文件，可以使用类似的逻辑：
    // const allFiles = await storageProvider.list()

    // 由于大多数存储提供商不直接提供列出所有文件的功能，
    // 这个函数可以作为管理工具，手动调用处理特定的 MOV 文件

    logger.chrono.info(
      'Scan completed. Use processSpecificLivePhotoVideo for individual files.',
    )

    return results
  } catch (error) {
    logger.chrono.error('Failed to scan existing LivePhotos:', error)
    results.errors.push(error instanceof Error ? error.message : String(error))
    return results
  }
}

/**
 * 处理特定的 MOV 文件
 */
export const processSpecificLivePhotoVideo = async (
  videoKey: string,
): Promise<boolean> => {
  try {
    const storageProvider = getStorageManager().getProvider()

    // 获取文件信息
    const fileBuffer = await storageProvider.get(videoKey)
    if (!fileBuffer) {
      logger.chrono.error(`Video file not found: ${videoKey}`)
      return false
    }

    const fileName = videoKey.split('/').pop() || videoKey

    // 检查是否为可能的 LivePhoto 视频
    if (!isLivePhotoVideo(fileName, fileBuffer.length)) {
      logger.chrono.warn(
        `File does not appear to be a LivePhoto video: ${videoKey}`,
      )
      return false
    }

    // 处理 LivePhoto 视频
    return await processLivePhotoVideo(videoKey, fileBuffer.length)
  } catch (error) {
    logger.chrono.error(
      `Failed to process specific LivePhoto video ${videoKey}:`,
      error,
    )
    return false
  }
}

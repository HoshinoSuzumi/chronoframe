import type { StorageProvider } from '@chronoframe/storage'
import path from 'node:path'
import { getStorageManager } from '../../plugins/3.storage'
import { logger } from '../../utils/logger'
import { createImageProcessor } from '@chronoframe/media/processor'
export type {
  ImageMeta,
  ProcessedImageData,
} from '@chronoframe/media/processor'
export const {
  convertHeicToJpeg,
  convertBitmapToSharpInst,
  preprocessImageBuffer,
  processImageMetadataAndSharp,
} = createImageProcessor(logger.image)
export const preprocessImageWithJpegUpload = async (
  s3key: string,
  storageProvider: StorageProvider = getStorageManager().getProvider(),
): Promise<{
  raw: Buffer
  processed: Buffer
  jpegKey?: string // HEIC 转换后上传的 JPEG 文件的 key
} | null> => {
  if (!storageProvider) return null

  try {
    const rawImageBuffer = await storageProvider.get(s3key)
    if (!rawImageBuffer) {
      logger.image.error(`Image not found in storage: ${s3key}`)
      return null
    }

    const extName = path.extname(s3key).toLowerCase()
    let processedBuffer: Buffer
    let jpegKey: string | undefined
    let jpegStorageKey: string | undefined

    if (['.heic', '.heif', '.hif'].includes(extName)) {
      logger.image.info(
        'HEIC image detected, converting and uploading JPEG version',
        s3key,
      )

      try {
        processedBuffer = await convertHeicToJpeg(rawImageBuffer)

        // 生成 JPEG 版本的 key（替换扩展名为 .jpg）
        const baseName = path.basename(s3key, path.extname(s3key))
        jpegKey = `${baseName}.jpeg`

        // 上传 JPEG 版本到存储
        jpegStorageKey = (
          await storageProvider.create(jpegKey, processedBuffer, 'image/jpeg')
        ).key
        logger.image.info(`Uploaded JPEG version to: ${jpegKey}`)
      } catch (err) {
        logger.image.error(`HEIC conversion failed: ${s3key}`, err)
        return null
      }
    } else {
      processedBuffer = rawImageBuffer
    }

    return {
      raw: rawImageBuffer,
      processed: processedBuffer,
      jpegKey: jpegStorageKey,
    }
  } catch (err) {
    logger.image.error(`Image preprocessing failed: ${s3key}`, err)
    return null
  }
}

export const preprocessImage = async (
  s3key: string,
): Promise<{
  raw: Buffer
  processed: Buffer
} | null> => {
  const storageProvider = getStorageManager().getProvider()
  if (!storageProvider) return null

  try {
    const rawImageBuffer = await storageProvider.get(s3key)
    if (!rawImageBuffer) {
      logger.image.error(`Image not found in storage: ${s3key}`)
      return null
    }

    let imageOrHeicBuffer: Buffer
    try {
      imageOrHeicBuffer = await preprocessImageBuffer(rawImageBuffer, s3key)
    } catch (err) {
      logger.image.error(`Image preprocessing failed: ${s3key}`, err)
      return null
    }

    return {
      raw: rawImageBuffer,
      processed: imageOrHeicBuffer,
    }
  } catch (err) {
    logger.image.error(`Image preprocessing failed: ${s3key}`, err)
    return null
  }
}

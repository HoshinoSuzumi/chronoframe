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
  jpegKey?: string
} | null> => {
  if (!storageProvider) return null

  try {
    const rawImageBuffer = await storageProvider.get(s3key)
    if (!rawImageBuffer) {
      logger.image.error(`Image not found in storage: ${s3key}`)
      return null
    }

    const processedBuffer = await preprocessImageBuffer(rawImageBuffer, s3key)
    let jpegStorageKey: string | undefined

    if (processedBuffer !== rawImageBuffer) {
      const baseName = path.basename(s3key, path.extname(s3key))
      jpegStorageKey = (
        await storageProvider.create(
          `${baseName}.jpeg`,
          processedBuffer,
          'image/jpeg',
        )
      ).key
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

import type { MediaLogger } from './logger.ts'
import path from 'path'
import bmp from '@vingle/bmp-js'
import heicConvert from 'heic-convert'
import sharp, { type Sharp } from 'sharp'
import { withRetry, RetryPresets, RetryConditions } from './retry.ts'

export interface ProcessedImageData {
  sharpInst: Sharp
  imageBuffer: Buffer
  metadata: ImageMeta
}

export interface ImageMeta {
  width: number
  height: number
  format: string
}

export interface ImageProcessorOptions {
  /** Defaults preserve existing Self-hosted behavior. */
  limitInputPixels?: number | boolean
  maxInputBytes?: number
  /** Cooperative cancellation; native work must settle before its slot is released. */
  signal?: AbortSignal
}

/** Create image decoding and conversion helpers with optional resource limits and cancellation. */
export function createImageProcessor(
  logger: MediaLogger,
  options: ImageProcessorOptions = {},
) {
  const checkInput = (buffer: Buffer) => {
    options.signal?.throwIfAborted()
    if (
      options.maxInputBytes !== undefined &&
      buffer.length > options.maxInputBytes
    ) {
      throw new RangeError('Media input exceeds configured byte limit')
    }
  }

  // Minimal JPEG size extractor as last-resort fallback
  const tryExtractJpegSize = (
    buffer: Buffer,
  ): { width: number; height: number } | null => {
    // JPEG starts with 0xFFD8
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
      return null
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buffer.readUInt8(offset + 1)
      offset += 2
      // Skip padding FFs
      if (marker === 0xff) continue
      // Standalone markers without length
      if (marker === 0xd8 || marker === 0xd9) continue
      const length = buffer.readUInt16BE(offset)
      if (length < 2) break
      // SOF0..SOF3 and SOF5..SOF7 indicate dimensions
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7)
      ) {
        if (offset + 7 >= buffer.length) break
        const height = buffer.readUInt16BE(offset + 3)
        const width = buffer.readUInt16BE(offset + 5)
        if (width > 0 && height > 0) return { width, height }
        break
      }
      offset += length
    }
    return null
  }

  const isBitmap = (buffer: Buffer) => {
    if (buffer.length < 2) return false
    const header = buffer.toString('hex', 0, 2)
    return header === '424d'
  }

  const getMetadataWithSharp = async (
    sharpInst: Sharp,
  ): Promise<ImageMeta | null> => {
    try {
      return await withRetry(
        async () => {
          options.signal?.throwIfAborted()
          let metadata = await sharpInst.metadata()
          options.signal?.throwIfAborted()

          // Fallback 1: try rotate() which can populate dimensions for some orientations
          if (!metadata.height || !metadata.width || !metadata.format) {
            try {
              metadata = await sharpInst.clone().rotate().metadata()
            } catch {
              /* empty */
            }
          }

          // Fallback 2: re-instantiate sharp from a fresh buffer
          if (!metadata.height || !metadata.width || !metadata.format) {
            try {
              const buf = await sharpInst.clone().toBuffer()
              metadata = await sharp(buf).metadata()
            } catch {
              /* empty */
            }
          }

          // Fallback 3: force re-encode to JPEG then read metadata
          if (!metadata.height || !metadata.width || !metadata.format) {
            try {
              const jpegBuf = await sharpInst.clone().jpeg().toBuffer()
              metadata = await sharp(jpegBuf).metadata()
              if (!metadata.height || !metadata.width) {
                const dims = tryExtractJpegSize(jpegBuf)
                if (dims) {
                  metadata.width = dims.width
                  metadata.height = dims.height
                  metadata.format = metadata.format || 'jpeg'
                }
              }
            } catch {
              /* empty */
            }
          }

          if (!metadata.height || !metadata.width || !metadata.format) {
            logger.warn('Incomplete metadata received:', {
              hasHeight: !!metadata.height,
              hasWidth: !!metadata.width,
              hasFormat: !!metadata.format,
            })
            return null
          }

          const { orientation } = metadata
          let { width, height } = metadata

          if (orientation && [5, 6, 7, 8].includes(orientation)) {
            ;[width, height] = [height, width]
          }

          logger.info(
            `Successfully extracted metadata: ${width}x${height} ${metadata.format}`,
          )
          return {
            width: width,
            height: height,
            format: metadata.format,
          }
        },
        {
          ...RetryPresets.fast,
          timeout: 10000,
          retryCondition: RetryConditions.resourceErrors,
        },
        logger,
      )
    } catch (error) {
      logger.error('All metadata extraction attempts failed:', error)
      return null
    }
  }

  const convertHeicToJpeg = async (heicBuffer: Buffer) => {
    checkInput(heicBuffer)
    return await withRetry(
      async () => {
        // 检查文件大小，如果太大则降低质量
        const fileSizeMB = heicBuffer.length / (1024 * 1024)
        const quality = fileSizeMB > 10 ? 0.8 : 0.95

        const jpegBuffer = await heicConvert({
          buffer: heicBuffer,
          format: 'JPEG',
          quality,
        })

        logger.info(`Successfully converted HEIC to JPEG (quality: ${quality})`)
        options.signal?.throwIfAborted()
        return Buffer.from(jpegBuffer)
      },
      {
        ...RetryPresets.slow, // HEIC 转换是重量级操作
        timeout: 30000,
        retryCondition: (error) => {
          // HEIC 转换错误通常是资源相关的
          return (
            RetryConditions.resourceErrors(error) ||
            error.message.includes('memory') ||
            error.message.includes('timeout')
          )
        },
      },
      logger,
    )
  }

  const convertBitmapToSharpInst = async (bitmapBuffer: Buffer) => {
    checkInput(bitmapBuffer)
    logger.info('Converting Bitmap to JPEG...')
    const bmpImage = bmp.decode(bitmapBuffer, true)
    if (!bmpImage) {
      throw new Error('Failed to decode BMP image')
    }

    const channels = bmpImage.data.length / (bmpImage.width * bmpImage.height)
    if (channels !== 3 && channels !== 4) {
      throw new Error(`Unsupported BMP channel count: ${channels}`)
    }

    return sharp(bmpImage.data, {
      raw: { width: bmpImage.width, height: bmpImage.height, channels },
    }).jpeg()
  }

  const preprocessImageBuffer = async (
    buffer: Buffer,
    key: string,
  ): Promise<Buffer> => {
    checkInput(buffer)
    const extName = path.extname(key).toLowerCase()

    if (['.heic', '.heif', '.hif'].includes(extName)) {
      logger.info('HEIC image detected', key)
      return await convertHeicToJpeg(buffer)
    }

    return buffer
  }

  const processImageMetadataAndSharp = async (
    buffer: Buffer,
    s3key: string,
  ): Promise<ProcessedImageData | null> => {
    try {
      // Preserve the legacy default unless the caller supplies a pixel limit.
      checkInput(buffer)
      let sharpInst = sharp(buffer, {
        limitInputPixels: options.limitInputPixels ?? false,
      })
      let convertedBuffer = buffer

      if (isBitmap(buffer)) {
        logger.info('Bitmap image detected, converting to JPEG...', s3key)
        try {
          sharpInst = await convertBitmapToSharpInst(buffer)
          convertedBuffer = await sharpInst.toBuffer()
        } catch (err) {
          logger.error(`Bitmap conversion failed: ${s3key}`, err)
          return null
        }
      }

      const metadata = await getMetadataWithSharp(sharpInst)
      if (!metadata) {
        logger.error(
          'Metadata extraction returned null (after fallbacks):',
          s3key,
        )
        return null
      }

      return {
        sharpInst,
        imageBuffer: convertedBuffer,
        metadata,
      }
    } catch (err) {
      logger.error(`Image processing with Sharp failed: ${s3key}`, err)
      return null
    }
  }

  return {
    convertHeicToJpeg,
    convertBitmapToSharpInst,
    preprocessImageBuffer,
    processImageMetadataAndSharp,
  }
}

import sharp from 'sharp'
import { generateBlurHash } from './blurhash'
import { withRetry, RetryPresets } from '../../utils/retry'

export const generateThumbnailAndHash = async (
  buffer: Buffer,
  logger?: Logger[keyof Logger],
) => {
  return await withRetry(
    async () => {
      const sharpInst = sharp(buffer).rotate()

      // 根据文件大小调整缩略图质量
      const fileSizeMB = buffer.length / (1024 * 1024)
      const quality = fileSizeMB > 5 ? 85 : 100

      const thumbnailBuffer = await sharpInst
        .resize(600, null, {
          withoutEnlargement: true,
          fastShrinkOnLoad: false, // 提高质量
        })
        .webp({ quality })
        .toBuffer()

      logger?.info(`Successfully generated thumbnail (quality: ${quality})`)

      // 生成BlurHash
      const thumbnailHash = await generateBlurHash(thumbnailBuffer, logger)

      return { thumbnailBuffer, thumbnailHash }
    },
    {
      ...RetryPresets.standard,
      timeout: 15000,
      delayStrategy: 'linear', // 图像处理适合线性退避
    },
    logger,
  )
}

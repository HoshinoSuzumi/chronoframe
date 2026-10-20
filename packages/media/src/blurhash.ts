import type { MediaLogger } from './logger.ts'
import sharp from 'sharp'
import { rgbaToThumbHash } from 'thumbhash'

/** Generate a ThumbHash from a downscaled image; return null when decoding fails. */
export const generateBlurHash = async (
  buffer: Buffer,
  logger?: MediaLogger,
) => {
  try {
    const { data, info } = await sharp(buffer)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .ensureAlpha()
      .toBuffer({
        resolveWithObject: true,
      })

    const thumbHash = rgbaToThumbHash(info.width, info.height, data)
    return thumbHash
  } catch (error) {
    logger?.error('Generate thumbhash failed', error)
    return null
  }
}

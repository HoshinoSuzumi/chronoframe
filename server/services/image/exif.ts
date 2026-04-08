import path from 'node:path'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import type { Metadata } from 'sharp'
import sharp from 'sharp'
import type { NeededExif, PhotoInfo } from '../../../shared/types/photo'
import type { ExifDateTime, Tags } from 'exiftool-vendored'
import { exiftool } from 'exiftool-vendored'
import { noop } from 'es-toolkit'
import { withRetry, RetryPresets, RetryConditions } from '../../utils/retry'

const neededKeys: Array<keyof Tags | (string & {})> = [
  'Title',
  'XPTitle',
  'Subject',
  'Keywords',
  'XPKeywords',

  'Description',
  'ImageDescription',
  'Caption-Abstract',
  'XPComment',
  'UserComment',

  'tz',
  'tzSource',
  'Orientation',
  'Make',
  'Model',
  'Software',
  'Artist',
  'Copyright',
  'ExposureTime',

  'FNumber',
  'ExposureProgram',
  'ISO',
  'OffsetTime',
  'OffsetTimeOriginal',
  'OffsetTimeDigitized',
  'ShutterSpeedValue',
  'ApertureValue',
  'BrightnessValue',
  'ExposureCompensationSet',
  'ExposureCompensationMode',
  'ExposureCompensationSetting',

  'ExposureCompensation',
  'MaxApertureValue',
  'LightSource',
  'Flash',
  'FocalLength',

  'ColorSpace',
  'ExposureMode',
  'FocalLengthIn35mmFormat',
  'SceneCaptureType',
  'LensMake',
  'LensModel',
  'MeteringMode',
  'WhiteBalance',
  'WBShiftAB',
  'WBShiftGM',
  'WhiteBalanceBias',
  'WhiteBalanceFineTune',
  'FlashMeteringMode',
  'SensingMethod',
  'FocalPlaneXResolution',
  'FocalPlaneYResolution',

  'Aperture',
  'ScaleFactor35efl',
  'ShutterSpeed',
  'LightValue',
  'Rating',

  'GPSAltitude',
  'GPSCoordinates',
  'GPSAltitudeRef',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',

  'MPImageType',

  // Motion Photo (XMP) related keys
  'MotionPhoto',
  'MotionPhotoVersion',
  'MotionPhotoPresentationTimestampUs',
  'MicroVideo',
  'MicroVideoVersion',
  'MicroVideoOffset',
  'MicroVideoPresentationTimestampUs',
]

const formatExifDate = (date: string | ExifDateTime | undefined) => {
  if (!date) {
    return
  }

  if (typeof date === 'string') {
    return new Date(date).toISOString()
  }

  return date.toISOString()
}

/**
 * 从 Sharp metadata 中推断颜色空间信息
 */
const inferColorSpaceFromMetadata = (
  metadata: Metadata,
): string | undefined => {
  // 优先使用 ICC 配置文件信息
  if (metadata.icc) {
    const colorSpace = parseICCProfile(metadata.icc)
    if (colorSpace) {
      return colorSpace
    }
  }

  // 根据图片格式和通道数推断
  if (metadata.space) {
    const colorSpace = mapSharpSpaceToColorSpace(metadata.space)
    if (colorSpace) {
      return colorSpace
    }
  }

  // 根据图片类型的默认颜色空间
  if (metadata.format) {
    const colorSpace = getDefaultColorSpaceForFormat(metadata.format)
    if (colorSpace) {
      return colorSpace
    }
  }

  return undefined
}

/**
 * 解析 ICC 配置文件以确定颜色空间
 */
const parseICCProfile = (iccBuffer: Buffer): string | undefined => {
  try {
    const iccString = iccBuffer.toString('latin1')

    // 常见的颜色空间标识符
    if (iccString.includes('sRGB') || iccString.includes('IEC61966-2.1')) {
      return 'sRGB'
    }
    if (iccString.includes('Adobe RGB') || iccString.includes('ADOBERGB')) {
      return 'Adobe RGB'
    }
    if (iccString.includes('Display P3') || iccString.includes('P3')) {
      return 'Display P3'
    }
    if (iccString.includes('ProPhoto') || iccString.includes('ROMM')) {
      return 'ProPhoto RGB'
    }
    if (iccString.includes('Wide Gamut') || iccString.includes('WideGamut')) {
      return 'Wide Gamut RGB'
    }
    if (iccString.includes('Rec2020') || iccString.includes('ITU-R BT.2020')) {
      return 'Rec. 2020'
    }
    if (iccString.includes('DCI-P3') || iccString.includes('DCI')) {
      return 'DCI-P3'
    }
    if (iccString.includes('Rec709') || iccString.includes('ITU-R BT.709')) {
      return 'Rec. 709'
    }

    // 检查 ICC 配置文件头部的颜色空间签名（偏移量 16-19）
    if (iccBuffer.length >= 20) {
      const colorSpaceSignature = iccBuffer.toString('ascii', 16, 20)
      switch (colorSpaceSignature) {
        case 'RGB ':
          return 'RGB'
        case 'CMYK':
          return 'CMYK'
        case 'GRAY':
          return 'Grayscale'
        case 'LAB ':
          return 'Lab'
        case 'XYZ ':
          return 'XYZ'
        default:
          break
      }
    }
  } catch {
    // 忽略解析错误，继续尝试其他方法
  }

  return undefined
}

/**
 * 将 Sharp 的 space 映射到标准颜色空间名称
 */
const mapSharpSpaceToColorSpace = (space: string): string | undefined => {
  switch (space) {
    case 'srgb':
      return 'sRGB'
    case 'rgb16':
      return 'RGB'
    case 'cmyk':
      return 'CMYK'
    case 'lab':
      return 'Lab'
    case 'xyz':
      return 'XYZ'
    case 'grey16':
    case 'b-w':
      return 'Grayscale'
    default:
      return undefined
  }
}

/**
 * 根据图片格式获取默认颜色空间
 */
const getDefaultColorSpaceForFormat = (format: string): string | undefined => {
  const formatLower = format.toLowerCase()
  switch (formatLower) {
    case 'jpeg':
    case 'jpg':
      return 'sRGB' // JPEG 默认使用 sRGB
    case 'png':
      return 'sRGB' // PNG 通常使用 sRGB
    case 'webp':
      return 'sRGB' // WebP 通常使用 sRGB
    case 'tiff':
    case 'tif':
      return 'sRGB' // TIFF 可能使用各种颜色空间，默认 sRGB
    case 'heif':
    case 'heic':
      return 'Display P3' // HEIC 通常支持 Display P3
    case 'avif':
      return 'sRGB' // AVIF 通常使用 sRGB，但也可能支持其他
    case 'gif':
      return 'sRGB' // GIF 使用 sRGB
    case 'bmp':
      return 'sRGB' // BMP 通常使用 sRGB
    default:
      return undefined
  }
}

const processExifData = (exifData: Tags, metadata: Metadata): NeededExif => {
  const date = {
    DateTimeOriginal: formatExifDate(exifData.DateTimeOriginal),
    DateTimeDigitized: formatExifDate(exifData.DateTimeDigitized),
    OffsetTime: exifData.OffsetTime,
    OffsetTimeOriginal: exifData.OffsetTimeOriginal,
    OffsetTimeDigitized: exifData.OffsetTimeDigitized,
  }

  const size = {
    ImageWidth: exifData.ExifImageWidth || metadata.width,
    ImageHeight: exifData.ExifImageHeight || metadata.height,
  }

  const result: any = structuredClone(exifData)
  for (const key in result) {
    Reflect.deleteProperty(result, key)
  }
  for (const key of neededKeys) {
    result[key] = (exifData as any)[key]
  }

  // 优先从 metadata 推断颜色空间
  const inferredColorSpace = inferColorSpaceFromMetadata(metadata)
  if (inferredColorSpace) {
    result.ColorSpace = inferredColorSpace
  } else if (!result.ColorSpace) {
    // 推断失败且 exif 中也没有 ColorSpace
    // ignore
  }

  return {
    ...date,
    ...size,
    ...result,
  }
}

export const extractExifData = async (
  imageBuffer: Buffer,
  rawImageBuffer?: Buffer,
  logger?: Logger[keyof Logger],
): Promise<NeededExif | null> => {
  try {
    return await withRetry(
      async () => {
        let tempImagePath: string | null = null

        try {
          // 提取基础元数据
          let metadata = await sharp(imageBuffer).metadata()

          // 如果主buffer没有EXIF，尝试原始buffer
          if (!metadata.exif && rawImageBuffer) {
            try {
              metadata = await sharp(rawImageBuffer).metadata()
            } catch (err) {
              logger?.warn(
                'Error extracting EXIF data from raw image buffer:',
                err,
              )
            }
          }

          if (!metadata.exif) {
            logger?.warn('No EXIF data found in image metadata')
            return null
          }

          logger?.info('Extracting EXIF data using exiftool...')

          // 创建临时工作目录
          const tempDir = path.resolve(process.cwd(), 'data/.exif_workdir')
          await mkdir(tempDir, { recursive: true })
          tempImagePath = path.resolve(tempDir, `${crypto.randomUUID()}.jpg`)

          // 写入临时文件
          await writeFile(tempImagePath, rawImageBuffer || imageBuffer)

          // 使用 exiftool 读取详细 EXIF 数据
          const exifData = await exiftool.read(tempImagePath)
          const result = processExifData(exifData, metadata)

          // 记录颜色空间信息
          if (result.ColorSpace) {
            logger?.success(`Inferred ColorSpace: ${result.ColorSpace}`)
          } else {
            logger?.info('ColorSpace could not be determined')
          }

          return result
        } finally {
          // 确保清理临时文件
          if (tempImagePath) {
            await unlink(tempImagePath).catch(noop)
          }
        }
      },
      {
        ...RetryPresets.standard,
        timeout: 15000, // EXIF 处理可能需要更长时间
        retryCondition: (error) => {
          // 组合多种重试条件
          return (
            RetryConditions.fileSystemErrors(error) ||
            RetryConditions.resourceErrors(error) ||
            error.message.includes('timeout')
          )
        },
      },
      logger,
    )
  } catch (error) {
    logger?.error('EXIF extraction failed after all retries:', error)
    return null
  }
}

const normalizeText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeText(item)
      if (normalized) {
        return normalized
      }
    }
    return undefined
  }

  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

const collectTextValues = (
  value: unknown,
  options?: { splitDelimited?: boolean },
): string[] => {
  const splitDelimited = options?.splitDelimited ?? false
  const results: string[] = []

  const append = (input: string) => {
    if (splitDelimited) {
      for (const part of input.split(/[;,]/)) {
        const chunk = part.trim()
        if (chunk.length > 0) {
          results.push(chunk)
        }
      }
    } else if (input.length > 0) {
      results.push(input)
    }
  }

  if (value === null || value === undefined) {
    return results
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeText(item)
      if (normalized) {
        append(normalized)
      }
    }
    return results
  }

  const normalized = normalizeText(value)
  if (normalized) {
    append(normalized)
  }

  return results
}

const pickFirstText = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

export const extractPhotoInfo = (
  s3key: string,
  exifData?: NeededExif | null,
): PhotoInfo => {
  const fileName = path.basename(s3key, path.extname(s3key))

  let dateTaken = new Date().toISOString()
  const tagsSet = new Set<string>()

  for (const tag of collectTextValues(exifData?.Subject)) {
    tagsSet.add(tag)
  }

  for (const tag of collectTextValues(exifData?.Keywords)) {
    tagsSet.add(tag)
  }

  for (const tag of collectTextValues(exifData?.XPKeywords, {
    splitDelimited: true,
  })) {
    tagsSet.add(tag)
  }

  if (exifData?.DateTimeOriginal) {
    try {
      const dateTimeOriginal = new Date(exifData.DateTimeOriginal)

      if (dateTimeOriginal instanceof Date) {
        dateTaken = dateTimeOriginal.toISOString()
      }
    } catch (error) {
      logger.image.warn(
        `Parse EXIF DateTimeOriginal failed: ${exifData.DateTimeOriginal}`,
        error,
      )
    }
  } else {
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/)
    if (dateMatch) {
      dateTaken = new Date(dateMatch[1]).toISOString()
    }
  }

  const titleFromExif = pickFirstText(
    exifData?.Title,
    exifData?.XPTitle,
    exifData?.Description,
    exifData?.ImageDescription,
    exifData?.CaptionAbstract,
  )

  let title = titleFromExif
  const cleanedFileName = fileName
    .replaceAll(/\d{4}-\d{2}-\d{2}[_-]?/g, '')
    .replaceAll(/[_-]?\d+views?/gi, '')
    .replaceAll(/[_-]+/g, ' ')
    .trim()

  if (!title) {
    title = cleanedFileName || path.basename(s3key, path.extname(s3key))
  }

  const description =
    pickFirstText(
      exifData?.Description,
      exifData?.ImageDescription,
      exifData?.CaptionAbstract,
      exifData?.XPComment,
      exifData?.UserComment,
    ) || ''

  return {
    title,
    dateTaken,
    tags: [...tagsSet],
    description,
  }
}

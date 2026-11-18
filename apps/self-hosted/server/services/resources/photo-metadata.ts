import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exiftool } from 'exiftool-vendored'
import sharp from 'sharp'
import type { Photo } from '@chronoframe/contracts/resources'
import { CoreError, type PhotoMetadataInput } from '@chronoframe/core'
import type { StorageProvider } from '../storage/interfaces'
import { extractExifData } from '../image/exif'
import { logger } from '../../utils/logger'

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** Extensions exiftool can annotate, keyed by sharp's detected format. */
const WRITABLE_EXTENSIONS: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
  tiff: '.tiff',
  avif: '.avif',
  heif: '.heic',
}

/** MIME types for the extensions an edit can publish. */
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.hif': 'image/heif',
}

/**
 * exiftool validates a file's content against its extension and refuses to
 * write on a mismatch ("Not a valid JPG (looks more like a PNG)"). Uploads keep
 * the client-supplied file name, so a renamed or re-encoded file can carry an
 * extension that contradicts its bytes. Derive the working extension from the
 * content to keep editing such photos possible.
 */
async function resolveWorkingExtension(
  buffer: Buffer,
  declaredExtension: string,
): Promise<string> {
  try {
    const { format } = await sharp(buffer).metadata()
    const detected = format ? WRITABLE_EXTENSIONS[format] : undefined
    if (detected) return detected
  } catch (error) {
    logger.image.warn(
      'Failed to detect image format before metadata edit',
      error,
    )
  }
  return declaredExtension
}

/**
 * EXIF has no time zone: `DateTimeOriginal` carries the wall clock of the
 * capture, so format the instant in the server's zone rather than as UTC.
 */
function formatExifDateTime(date: Date): string {
  const day = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join(':')
  const time = [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join(':')
  return `${day} ${time}`
}

/** `OffsetTimeOriginal` records the zone the wall clock was read in. */
function formatExifOffset(date: Date): string {
  const totalMinutes = -date.getTimezoneOffset()
  const sign = totalMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(totalMinutes)
  return `${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`
}

/** Keep temporary files, EXIF tooling and object I/O in the application adapter. */
export async function editPhotoMetadata(
  photo: Photo & { storageKey: string; originalDerivedKey?: string | null },
  payload: PhotoMetadataInput,
  storageProvider: StorageProvider,
) {
  const originalBuffer = await storageProvider.get(photo.storageKey)
  if (!originalBuffer)
    throw new CoreError(
      404,
      'Photo file missing',
      'dashboard.photos.messages.photoFileMissing',
    )
  const normalizedTitle = payload.title
  const normalizedDescription = payload.description
  const normalizedTags = payload.tags
  const exifUpdates: Record<string, any> = {}

  if (normalizedTitle !== undefined) {
    const titleValue = normalizedTitle.length > 0 ? normalizedTitle : null
    exifUpdates.Title = titleValue
    exifUpdates.XPTitle = titleValue
  }

  if (normalizedDescription !== undefined) {
    const descriptionValue =
      normalizedDescription.length > 0 ? normalizedDescription : null
    exifUpdates.Description = descriptionValue
    exifUpdates.ImageDescription = descriptionValue
    exifUpdates.CaptionAbstract = descriptionValue
    exifUpdates.XPComment = descriptionValue
    exifUpdates.UserComment = descriptionValue
  }

  if (normalizedTags !== undefined) {
    const tagsValue = normalizedTags.length > 0 ? normalizedTags : null
    exifUpdates.Subject = tagsValue
    exifUpdates.Keywords = tagsValue
    exifUpdates.XPKeywords =
      normalizedTags.length > 0 ? normalizedTags.join('; ') : null
  }

  if (payload.location !== undefined) {
    if (payload.location) {
      const { latitude, longitude } = payload.location
      const latAbs = Math.abs(latitude)
      const lonAbs = Math.abs(longitude)
      exifUpdates.GPSLatitude = latAbs
      exifUpdates.GPSLatitudeRef = latitude >= 0 ? 'N' : 'S'
      exifUpdates.GPSLongitude = lonAbs
      exifUpdates.GPSLongitudeRef = longitude >= 0 ? 'E' : 'W'
      exifUpdates.GPSPosition = `${latitude} ${longitude}`
    } else {
      exifUpdates.GPSLatitude = null
      exifUpdates.GPSLatitudeRef = null
      exifUpdates.GPSLongitude = null
      exifUpdates.GPSLongitudeRef = null
      exifUpdates.GPSPosition = null
    }
  }

  if (payload.rating !== undefined) {
    exifUpdates.Rating = payload.rating !== null ? payload.rating : null
  }

  if (payload.dateTaken !== undefined) {
    const capturedAt = new Date(payload.dateTaken)
    const stamp = formatExifDateTime(capturedAt)
    exifUpdates.DateTimeOriginal = stamp
    exifUpdates.CreateDate = stamp
    exifUpdates.DateTimeDigitized = stamp
    exifUpdates.OffsetTimeOriginal = formatExifOffset(capturedAt)
    exifUpdates.OffsetTimeDigitized = exifUpdates.OffsetTimeOriginal
  }

  const tempRoot = tmpdir()
  await mkdir(tempRoot, { recursive: true })
  const tempDir = await mkdtemp(path.join(tempRoot, 'cframe-edit-'))
  const stagedKey = `.generated/metadata/${randomUUID()}/${path.posix.basename(photo.storageKey)}`
  let cleanupKey = stagedKey
  const ext = path.extname(photo.storageKey).toLowerCase() || '.jpg'
  // The stored object keeps its original key; only the working copy has to
  // carry an extension exiftool agrees with.
  const workingExt = await resolveWorkingExtension(originalBuffer, ext)
  // Publish the bytes under their real MIME; the stored key may disagree.
  const contentType = CONTENT_TYPES[workingExt] ?? 'application/octet-stream'
  const tempFile = path.join(tempDir, `edited${workingExt}`)

  try {
    await writeFile(tempFile, originalBuffer)

    if (Object.keys(exifUpdates).length > 0) {
      try {
        await exiftool.write(tempFile, exifUpdates, ['-overwrite_original'])
      } catch (error) {
        logger.image.error(
          `Cannot annotate photo ${photo.id} (${photo.storageKey})`,
          error,
        )
        throw new CoreError(
          400,
          'Photo file cannot be annotated',
          'dashboard.photos.messages.metadataFileUnsupported',
        )
      }
    }

    const updatedBuffer = await readFile(tempFile)
    // Publish to a unique object. The original stays untouched until the
    // database atomically selects this revision and enqueues follow-up work.
    const exifData = await extractExifData(updatedBuffer)
    const staged = await storageProvider.create(
      stagedKey,
      updatedBuffer,
      contentType,
    )
    cleanupKey = staged.key

    return {
      exif: exifData,
      fileSize: updatedBuffer.length,
      storageKey: staged.key,
      // HEIC originals retain their separately generated browser-readable JPEG.
      originalUrl: /\.(?:heic|heif|hif)$/i.test(photo.storageKey)
        ? photo.originalDerivedKey
          ? storageProvider.getPublicUrl(photo.originalDerivedKey)
          : photo.originalUrl
        : storageProvider.getPublicUrl(staged.key),
      discard: () => storageProvider.delete(staged.key),
    }
  } catch (error) {
    try {
      await storageProvider.delete(cleanupKey)
    } catch (cleanupError) {
      logger.image.warn(
        'Failed to discard staged metadata object',
        cleanupError,
      )
    }
    logger.image.error('Failed to update photo metadata', error)
    // Preserve actionable failures (e.g. an unannotatable file) instead of
    // collapsing every cause into an opaque 500.
    if (error instanceof CoreError) throw error
    throw new CoreError(
      500,
      'Failed to update photo metadata',
      'dashboard.photos.messages.metadataUpdateFailed',
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

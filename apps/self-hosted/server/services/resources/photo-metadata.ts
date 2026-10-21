import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exiftool } from 'exiftool-vendored'
import type { Photo } from '@chronoframe/contracts/resources'
import { CoreError, type PhotoMetadataInput } from '@chronoframe/core'
import type { StorageProvider } from '../storage/interfaces'
import { extractExifData } from '../image/exif'
import { logger } from '../../utils/logger'

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

  const tempRoot = tmpdir()
  await mkdir(tempRoot, { recursive: true })
  const tempDir = await mkdtemp(path.join(tempRoot, 'cframe-edit-'))
  const stagedKey = `.generated/metadata/${randomUUID()}/${path.posix.basename(photo.storageKey)}`
  let cleanupKey = stagedKey
  const ext = path.extname(photo.storageKey).toLowerCase() || '.jpg'
  const contentType =
    (
      {
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
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream'
  const tempFile = path.join(tempDir, `edited${ext}`)

  try {
    await writeFile(tempFile, originalBuffer)

    if (Object.keys(exifUpdates).length > 0) {
      await exiftool.write(tempFile, exifUpdates, ['-overwrite_original'])
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
    throw new CoreError(
      500,
      'Failed to update photo metadata',
      'dashboard.photos.messages.metadataUpdateFailed',
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

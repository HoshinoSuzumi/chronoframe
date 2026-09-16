import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { exiftool } from 'exiftool-vendored'
import { eq } from 'drizzle-orm'

import {
  extractExifData,
  extractPhotoInfo,
} from '~~/server/services/image/exif'
import { buildExifWriteTags } from '~~/server/services/image/exif-write'
import { EXIF_ENUM_OPTIONS } from '~~/shared/constants/exifOptions'
import { isValidExifDate, isValidUtcOffset } from '~~/shared/utils/exifDateTime'
import { tables, useDB } from '~~/server/utils/db'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import type { NeededExif } from '~~/shared/types/photo'

const paramsSchema = z.object({
  photoId: z.string().min(1),
})

/** "24", "24.5", "24 mm" — what exiftool accepts for FocalLength tags. */
const focalLengthSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^\d+(\.\d+)?( mm)?$/, 'Invalid focal length (expected e.g. 24 mm)')
  .nullish()

const bodySchema = z.object({
  title: z.string().trim().max(512).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().max(128)).max(64).optional(),
  location: z
    .union([
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
      z.null(),
    ])
    .optional(),
  rating: z.union([z.number().int().min(0).max(5), z.null()]).optional(),
  exif: z
    .object({
      Make: z.string().trim().max(256).nullish(),
      Model: z.string().trim().max(256).nullish(),
      LensMake: z.string().trim().max(256).nullish(),
      LensModel: z.string().trim().max(256).nullish(),
      FNumber: z.number().positive().max(1000).nullish(),
      ExposureTime: z
        .string()
        .trim()
        .max(32)
        .regex(/^(\d+(\.\d+)?|\d+\/\d+)$/, 'Invalid exposure time')
        .nullish(),
      ISO: z.number().int().min(0).max(10_000_000).nullish(),
      FocalLength: focalLengthSchema,
      FocalLengthIn35mmFormat: focalLengthSchema,
      Flash: z.enum(EXIF_ENUM_OPTIONS.flash).nullish(),
      SceneCaptureType: z.enum(EXIF_ENUM_OPTIONS.sceneCaptureType).nullish(),
      WhiteBalance: z.enum(EXIF_ENUM_OPTIONS.whiteBalance).nullish(),
      MeteringMode: z.enum(EXIF_ENUM_OPTIONS.meteringMode).nullish(),
      ExposureProgram: z.enum(EXIF_ENUM_OPTIONS.exposureProgram).nullish(),
      ExposureMode: z.enum(EXIF_ENUM_OPTIONS.exposureMode).nullish(),
      Artist: z.string().trim().max(256).nullish(),
      Copyright: z.string().trim().max(512).nullish(),
      Software: z.string().trim().max(256).nullish(),
      DateTimeOriginal: z
        .string()
        .trim()
        .refine(isValidExifDate, 'Invalid date (expected YYYY:MM:DD HH:MM:SS)')
        .nullish(),
      OffsetTimeOriginal: z
        .string()
        .trim()
        .refine(isValidUtcOffset, 'Invalid UTC offset (expected +HH:MM)')
        .nullish(),
      FocalPlaneXResolution: z.number().positive().max(1_000_000).nullish(),
      FocalPlaneYResolution: z.number().positive().max(1_000_000).nullish(),
    })
    .optional(),
})

const normalizeTags = (tags: string[] | undefined) => {
  if (!tags) return undefined
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const rawTag of tags) {
    const trimmed = rawTag.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }
  return normalized
}

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const t = await useTranslation(event)
  const { photoId } = paramsSchema.parse(event.context.params ?? {})
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue
        ? `${issue.path.join('.') || 'body'}: ${issue.message}`
        : 'Invalid request body',
    })
  }
  const payload = parsed.data

  const hasExifEdits =
    payload.exif !== undefined && Object.keys(payload.exif).length > 0

  if (
    payload.title === undefined &&
    payload.description === undefined &&
    payload.tags === undefined &&
    payload.location === undefined &&
    payload.rating === undefined &&
    !hasExifEdits
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.noChangesProvided'),
    })
  }

  const db = useDB()
  const photo = await db
    .select()
    .from(tables.photos)
    .where(eq(tables.photos.id, photoId))
    .get()

  if (!photo) {
    throw createError({
      statusCode: 404,
      statusMessage: t('dashboard.photos.messages.photoNotFound'),
    })
  }

  if (!photo.storageKey) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.noStorageKey'),
    })
  }

  const { storageProvider } = useStorageProvider(event)
  const originalBuffer = await storageProvider.get(photo.storageKey)

  if (!originalBuffer) {
    throw createError({
      statusCode: 404,
      statusMessage: t('dashboard.photos.messages.photoFileMissing'),
    })
  }

  const normalizedTitle =
    payload.title !== undefined ? payload.title.trim() : undefined
  const normalizedDescription =
    payload.description !== undefined ? payload.description.trim() : undefined
  const normalizedTags = normalizeTags(payload.tags)
  let pendingReverseGeocode: {
    latitude: number
    longitude: number
  } | null = null

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

  const advancedExif = hasExifEdits
    ? buildExifWriteTags(payload.exif!)
    : { writeTags: {}, dbOverlay: {}, dateTakenIso: undefined }

  Object.assign(exifUpdates, advancedExif.writeTags)

  const tempRoot = tmpdir()
  await mkdir(tempRoot, { recursive: true })
  const tempDir = await mkdtemp(path.join(tempRoot, 'cframe-edit-'))
  const ext = path.extname(photo.storageKey) || '.jpg'
  const tempFile = path.join(tempDir, `edited${ext}`)

  try {
    await writeFile(tempFile, originalBuffer)

    if (Object.keys(exifUpdates).length > 0) {
      await exiftool.write(tempFile, exifUpdates, ['-overwrite_original'])
    }

    const updatedBuffer = await readFile(tempFile)
    const prefix =
      storageProvider.config && 'prefix' in storageProvider.config
        ? storageProvider.config.prefix
        : ''
    await storageProvider.create(
      photo.storageKey.replace(prefix || '', ''),
      updatedBuffer,
    )

    const exifData = await extractExifData(updatedBuffer)

    const overlaidExif: Record<string, any> = { ...exifData }
    for (const [overlayKey, overlayValue] of Object.entries(
      advancedExif.dbOverlay,
    )) {
      if (overlayValue === undefined) {
        delete overlaidExif[overlayKey]
      } else {
        overlaidExif[overlayKey] = overlayValue
      }
    }

    const updateData: Record<string, any> = {
      exif: overlaidExif,
      fileSize: updatedBuffer.length,
      lastModified: new Date().toISOString(),
    }

    if (advancedExif.dateTakenIso !== undefined) {
      // Cleared date: fall back exactly as ingest does (filename date, else now)
      // so the column never holds NULL and a reprocess would yield the same value.
      updateData.dateTaken =
        advancedExif.dateTakenIso ??
        extractPhotoInfo(photo.storageKey, overlaidExif as NeededExif).dateTaken
    }

    if (normalizedTitle !== undefined) {
      updateData.title = normalizedTitle || null
    }

    if (normalizedDescription !== undefined) {
      updateData.description = normalizedDescription || null
    }

    if (normalizedTags !== undefined) {
      updateData.tags = normalizedTags
    }

    if (payload.location !== undefined) {
      if (payload.location) {
        updateData.latitude = payload.location.latitude
        updateData.longitude = payload.location.longitude
        updateData.country = null
        updateData.city = null
        updateData.locationName = null
        pendingReverseGeocode = {
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
        }
      } else {
        updateData.latitude = null
        updateData.longitude = null
        updateData.country = null
        updateData.city = null
        updateData.locationName = null
      }
    }

    await db
      .update(tables.photos)
      .set(updateData)
      .where(eq(tables.photos.id, photoId))

    const updatedPhoto = await db
      .select()
      .from(tables.photos)
      .where(eq(tables.photos.id, photoId))
      .get()

    if (pendingReverseGeocode) {
      const workerPool = globalThis.__workerPool
      if (workerPool) {
        try {
          await workerPool.addTask(
            {
              type: 'photo-reverse-geocoding',
              photoId,
              latitude: pendingReverseGeocode.latitude,
              longitude: pendingReverseGeocode.longitude,
            },
            {
              priority: 1,
            },
          )
        } catch (taskError) {
          logger.location.warn(
            `Failed to enqueue reverse geocoding for photo ${photoId}:`,
            taskError,
          )
        }
      } else {
        logger.location.warn(
          `Worker pool not initialized, skipping reverse geocoding enqueue for photo ${photoId}`,
        )
      }
    }

    return {
      success: true,
      photo: updatedPhoto,
    }
  } catch (error) {
    logger.image.error('Failed to update photo metadata', error)
    throw createError({
      statusCode: 500,
      statusMessage: t('dashboard.photos.messages.metadataUpdateFailed'),
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  createImageProcessor,
  generateThumbnailAndHash,
  processMotionPhotoFromXmp,
  type createExifService,
  type MediaLogger,
} from '@chronoframe/media'
import type { StorageProvider } from '@chronoframe/storage'
import { hasValidCoordinates } from '@chronoframe/contracts/location'
import type { NeededExif } from '@chronoframe/contracts/photo'
import type { Photo } from '@chronoframe/contracts/resources'
import type { LocationInfo } from '@chronoframe/geocoding'
import type { ProcessingStage } from '@chronoframe/contracts/queue'

export const EXIF_LOCATION_KEYS = [
  'GPSAltitude',
  'GPSAltitudeRef',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
  'GPSPosition',
  'GPSDateStamp',
  'GPSTimeStamp',
  'GPSImgDirection',
  'GPSImgDirectionRef',
  'GPSDestBearing',
  'GPSDestBearingRef',
] as const
export function stripLocationFromExif<
  T extends Record<string, any> | null | undefined,
>(exif: T): T {
  if (!exif) return exif
  const result = { ...exif }
  for (const key of EXIF_LOCATION_KEYS) delete result[key]
  return result as T
}
export type ProcessedPhoto = Photo & { originalDerivedKey: string | null }
export interface PhotoProcessingInput {
  photoId: string
  storageKey: string
  eraseLocation: boolean
  storage: StorageProvider
  stage(stage: ProcessingStage): Promise<void>
  sourceRead?(hash: string): void | Promise<void>
  signal?: AbortSignal
}
/** Compose media capabilities with explicit storage and site-resolved settings; never persist business state here. */
export function createPhotoProcessor(deps: {
  logger: MediaLogger
  exif: ReturnType<typeof createExifService>
  parseGPS(exif: NeededExif): { latitude?: number; longitude?: number }
  reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<LocationInfo | null>
  now?: () => Date
}) {
  return async (
    input: PhotoProcessingInput,
  ): Promise<{ photo: ProcessedPhoto; sourceHash: string }> => {
    const { storage, storageKey, photoId } = input
    const stage = async (value: ProcessingStage) => {
      input.signal?.throwIfAborted()
      await input.stage(value)
    }
    const media = createImageProcessor(deps.logger, { signal: input.signal })
    await stage('preprocessing')
    const raw = await storage.get(storageKey)
    if (!raw) throw new Error('Source object not found')
    const sourceHash = createHash('sha256').update(raw).digest('hex')
    await input.sourceRead?.(sourceHash)
    const storageObject = await storage.getFileMeta(storageKey)
    let processed = raw,
      originalDerivedKey: string | null = null
    const ext = path.extname(storageKey).toLowerCase()
    if (['.heic', '.heif', '.hif'].includes(ext)) {
      processed = await media.convertHeicToJpeg(raw)
      originalDerivedKey = (
        await storage.create(
          `${path.basename(storageKey, ext)}.jpeg`,
          processed,
          'image/jpeg',
        )
      ).key
    }
    await stage('metadata')
    const processedData = await media.processImageMetadataAndSharp(
      processed,
      storageKey,
    )
    if (!processedData) throw new Error('Metadata processing failed')
    const { imageBuffer, metadata } = processedData
    await stage('thumbnail')
    const { thumbnailBuffer, thumbnailHash } = await generateThumbnailAndHash(
      imageBuffer,
      deps.logger,
    )
    const thumbnail = await storage.create(
      `thumbnails/${photoId}.webp`,
      thumbnailBuffer,
      'image/webp',
    )
    await stage('exif')
    const extracted = await deps.exif.extractExifData(
      imageBuffer,
      raw,
      deps.logger,
    )
    const exif = input.eraseLocation
      ? stripLocationFromExif(extracted)
      : extracted
    const info = deps.exif.extractPhotoInfo(storageKey, exif)
    await stage('reverse-geocoding')
    let coordinates: { latitude: number; longitude: number } | null = null,
      location: LocationInfo | null = null
    if (!input.eraseLocation && exif) {
      const parsed = deps.parseGPS(exif)
      if (hasValidCoordinates(parsed.latitude, parsed.longitude)) {
        coordinates = {
          latitude: parsed.latitude!,
          longitude: parsed.longitude!,
        }
        location = await deps.reverseGeocode(
          coordinates.latitude,
          coordinates.longitude,
        )
      }
    }
    await stage('motion-photo')
    const motion = await processMotionPhotoFromXmp({
      photoId,
      storageKey,
      rawImageBuffer: raw,
      exifData: exif,
      storageProvider: storage,
      logger: deps.logger,
    })
    await stage('live-photo')
    let videoKey = motion?.livePhotoVideoKey ?? null
    if (!motion?.isMotionPhoto) {
      const base = storageKey.slice(0, -path.extname(storageKey).length)
      for (const candidate of [`${base}.MOV`, `${base}.mov`])
        if (await storage.getFileMeta(candidate)) {
          videoKey = candidate
          break
        }
    }
    input.signal?.throwIfAborted()
    return {
      sourceHash,
      photo: {
        id: photoId,
        title: info.title,
        description: info.description,
        dateTaken: info.dateTaken,
        tags: info.tags,
        width: metadata.width,
        height: metadata.height,
        aspectRatio: metadata.width / metadata.height,
        storageKey,
        thumbnailKey: thumbnail.key,
        fileSize: storageObject?.size ?? raw.length,
        lastModified:
          storageObject?.lastModified?.toISOString() ??
          (deps.now?.() ?? new Date()).toISOString(),
        originalUrl: storage.getPublicUrl(originalDerivedKey ?? storageKey),
        originalDerivedKey,
        thumbnailUrl: storage.getPublicUrl(thumbnail.key),
        thumbnailHash: thumbnailHash
          ? Buffer.from(thumbnailHash).toString('hex')
          : null,
        exif,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        country: location?.country ?? null,
        city: location?.city ?? null,
        locationName: location?.locationName ?? null,
        geocoding: location?.geocoding ?? null,
        isLivePhoto: videoKey ? 1 : 0,
        livePhotoVideoKey: videoKey,
        livePhotoVideoUrl: videoKey ? storage.getPublicUrl(videoKey) : null,
      },
    }
  }
}

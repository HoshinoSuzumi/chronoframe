import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  createImageProcessor,
  EXIF_LOCATION_KEYS,
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

export { EXIF_LOCATION_KEYS } from '@chronoframe/media'
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
  maxPixels?: number
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
  sanitizeJpegXl?(buffer: Buffer): Promise<Buffer>
  now?: () => Date
}) {
  return async (
    input: PhotoProcessingInput,
  ): Promise<{
    photo: ProcessedPhoto
    sourceHash: string
    sanitizedSourceKey?: string
  }> => {
    const { storage, storageKey, photoId } = input
    const stage = async (value: ProcessingStage) => {
      input.signal?.throwIfAborted()
      await input.stage(value)
    }
    const media = createImageProcessor(deps.logger, {
      signal: input.signal,
      limitInputPixels: input.maxPixels,
    })
    await stage('preprocessing')
    const raw = await storage.get(storageKey)
    if (!raw) throw new Error('Source object not found')
    const sourceHash = createHash('sha256').update(raw).digest('hex')
    await input.sourceRead?.(sourceHash)
    let source = raw
    let sanitizedSourceKey: string | undefined
    if (
      input.eraseLocation &&
      deps.sanitizeJpegXl &&
      /\.jxl$/i.test(storageKey)
    ) {
      await stage('location-erase')
      source = await deps.sanitizeJpegXl(raw)
      if (source !== raw) {
        sanitizedSourceKey = (
          await storage.create(
            `source/${path.basename(storageKey)}`,
            source,
            'image/jxl',
          )
        ).key
      }
    }
    const sourceKey = sanitizedSourceKey ?? storageKey
    const storageObject = await storage.getFileMeta(sourceKey)
    const processed = await media.preprocessImageBuffer(source, storageKey)
    let originalDerivedKey: string | null = null
    if (processed !== source) {
      originalDerivedKey = (
        await storage.create(
          `${path.basename(storageKey, path.extname(storageKey))}.jpeg`,
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
      source,
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
      rawImageBuffer: source,
      exifData: exif,
      storageProvider: storage,
      logger: deps.logger,
    })
    await stage('live-photo')
    let videoKey = motion?.livePhotoVideoKey ?? null
    if (!motion?.isMotionPhoto) {
      const base = storageKey.slice(0, -path.extname(storageKey).length)
      for (const candidate of [`${base}.MOV`, `${base}.mov`]) {
        try {
          if (await storage.getFileMeta(candidate)) {
            videoKey = candidate
            break
          }
        } catch {
          // A missing LivePhoto video (or a storage error while probing
          // for one, e.g. OpenList returning 500 "object not found" for
          // a file that does not exist) must not fail the whole photo
          // task; treat it as "no video" and keep processing the photo.
          continue
        }
      }
    }
    input.signal?.throwIfAborted()
    return {
      sourceHash,
      sanitizedSourceKey,
      photo: {
        id: photoId,
        title: info.title,
        description: info.description,
        dateTaken: info.dateTaken,
        tags: info.tags,
        width: metadata.width,
        height: metadata.height,
        aspectRatio: metadata.width / metadata.height,
        storageKey: sourceKey,
        thumbnailKey: thumbnail.key,
        fileSize: storageObject?.size ?? source.length,
        lastModified:
          storageObject?.lastModified?.toISOString() ??
          (deps.now?.() ?? new Date()).toISOString(),
        originalUrl: storage.getPublicUrl(originalDerivedKey ?? sourceKey),
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

import {
  DEFAULT_PROCESSOR_LIMITS,
  DEFAULT_PROCESSOR_GEOCODING,
  type ProcessorConfiguration,
} from '@chronoframe/contracts/processor'
import { processingGeocoder } from './geocoding.ts'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { ExifTool } from 'exiftool-vendored'
import {
  createPhotoProcessor,
  EXIF_LOCATION_KEYS,
} from '@chronoframe/processing'
import { createExifService } from '@chronoframe/media'
import type { StorageProvider } from '@chronoframe/storage'
import type { CloudLease, CloudMediaResult } from '@chronoframe/core'
export interface WorkItem {
  lease: CloudLease
  sourceUrl: string
  fileName: string
  contentType: string
  companion?: { key: string; url: string; bytes: number; etag?: string } | null
  etag?: string
  eraseLocation?: boolean
  options?: { operation: string; options_json: string }
  priorMetadata?: { metadata_json: string | null; title: string }
}
export interface Derivative {
  role: 'thumbnail' | 'live-video' | 'display' | 'sanitized-original'
  bytes: number
  contentType: string
  buffer: Buffer
}
export class WorkerProcessingError extends Error {
  readonly retryable: boolean
  readonly requiredPixels?: number
  readonly requiredBytes?: number
  readonly requiredMetadataBytes?: number
  constructor(
    code: string,
    retryable: boolean,
    requiredPixels?: number,
    requiredBytes?: number,
    requiredMetadataBytes?: number,
  ) {
    super(code)
    this.retryable = retryable
    this.requiredPixels = requiredPixels
    this.requiredBytes = requiredBytes
    this.requiredMetadataBytes = requiredMetadataBytes
  }
}
const quiet = { info() {}, warn() {}, error() {}, debug() {}, success() {} }
/** Bound download bytes before allocating a complete input buffer. */
export async function boundedDownload(
  url: string,
  expected: number,
  signal: AbortSignal,
  etag?: string,
  maxBytes = DEFAULT_PROCESSOR_LIMITS.maxFileBytes,
  sourceModified?: (value: string | null) => void,
) {
  if (!Number.isSafeInteger(expected) || expected < 1)
    throw new WorkerProcessingError('invalid_source_size', false)
  if (expected > maxBytes)
    throw new WorkerProcessingError(
      'node_file_limit',
      true,
      undefined,
      expected,
    )
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:')
    throw new WorkerProcessingError('invalid_source_url', false)
  const response = await fetch(url, {
    signal,
    redirect: 'error',
    headers: etag ? { 'If-Match': etag } : {},
  })
  if (!response.ok || !response.body)
    throw new WorkerProcessingError(
      response.status === 403
        ? 'storage_access_denied'
        : response.status === 404
          ? 'source_not_found'
          : 'storage_unavailable',
      response.status >= 500 || response.status === 429,
    )
  sourceModified?.(response.headers.get('last-modified'))
  const reader = response.body.getReader(),
    parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > expected) {
        await reader.cancel()
        throw new WorkerProcessingError('source_size_changed', false)
      }
      parts.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (size !== expected)
    throw new WorkerProcessingError('source_size_changed', false)
  return Buffer.concat(parts, size)
}
/** Reuse the shared processing pipeline. Its storage dependency can access only
 * the assigned source and in-memory derivatives, never a bucket or credential.
 */
export async function processWork(
  item: WorkItem,
  signal: AbortSignal,
  configuration: ProcessorConfiguration = {
    limits: DEFAULT_PROCESSOR_LIMITS,
    geocoding: DEFAULT_PROCESSOR_GEOCODING,
  },
  reserveGeocoding?: (intervalMs: number) => Promise<void>,
): Promise<{
  result: Omit<CloudMediaResult, 'assets'>
  derivatives: Derivative[]
}> {
  const { limits } = configuration
  let lastModified: Date | undefined
  let input = await boundedDownload(
    item.sourceUrl,
    item.lease.expectedBytes,
    signal,
    item.etag,
    limits.maxFileBytes,
    (value) => {
      if (value && Number.isFinite(Date.parse(value)))
        lastModified = new Date(value)
    },
  )
  const companion = item.companion
    ? await boundedDownload(
        item.companion.url,
        item.companion.bytes,
        signal,
        item.companion.etag,
        limits.maxFileBytes,
      )
    : null
  const ext = path.extname(item.fileName || item.lease.objectKey).toLowerCase()
  const sourceKey = 'source' + ext
  const operation = item.options?.operation ?? 'photo'
  const eraseLocation =
    item.eraseLocation === true || operation === 'erase-location'
  const jobOptions = JSON.parse(item.options?.options_json ?? '{}')
  const previous = item.priorMetadata?.metadata_json
    ? JSON.parse(item.priorMetadata.metadata_json)
    : null
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-worker-'))
  const exiftool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 30000 })
  const derivatives: Derivative[] = []
  try {
    if (!['.heic', '.heif', '.hif', '.bmp'].includes(ext)) {
      const dimensions = await sharp(input, {
        limitInputPixels: false,
      }).metadata()
      if (!dimensions.width || !dimensions.height)
        throw new WorkerProcessingError('invalid_dimensions', false)
      if (dimensions.width * dimensions.height > limits.maxPixels)
        throw new WorkerProcessingError(
          'node_pixel_limit',
          true,
          dimensions.width * dimensions.height,
        )
    }
    if (eraseLocation) {
      const file = path.join(directory, sourceKey)
      await writeFile(file, input)
      const locationTags = await exiftool.read(file)
      if (
        EXIF_LOCATION_KEYS.some(
          (key) => locationTags[key as keyof typeof locationTags] != null,
        )
      )
        await exiftool.write(
          file,
          Object.fromEntries(EXIF_LOCATION_KEYS.map((key) => [key, null])),
          ['-overwrite_original'],
        )
      input = await readFile(file)
      derivatives.push({
        role: 'sanitized-original',
        bytes: input.length,
        contentType: item.contentType,
        buffer: input,
      })
    }
    if (['.heic', '.heif', '.hif', '.bmp'].includes(ext)) {
      const sourceFile = path.join(directory, 'source' + ext)
      await writeFile(sourceFile, input)
      const tags = await exiftool.read(sourceFile),
        width = Number(tags.ImageWidth ?? tags.ExifImageWidth),
        height = Number(tags.ImageHeight ?? tags.ExifImageHeight)
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1
      )
        throw new WorkerProcessingError('invalid_dimensions', false)
      if (width * height > limits.maxPixels)
        throw new WorkerProcessingError(
          'node_pixel_limit',
          true,
          width * height,
        )
    }
    const storage: StorageProvider = {
      async get(key) {
        return key === sourceKey
          ? input
          : key === 'source.MOV'
            ? companion
            : null
      },
      async getFileMeta(key) {
        return key === sourceKey
          ? { key, size: input.length, lastModified }
          : key === 'source.MOV' && companion
            ? { key, size: companion.length }
            : null
      },
      async create(key, buffer, contentType) {
        signal.throwIfAborted()
        const role =
          contentType === 'image/webp'
            ? 'thumbnail'
            : contentType === 'image/jpeg'
              ? 'display'
              : contentType === 'video/mp4'
                ? 'live-video'
                : null
        if (!role) throw new Error('invalid_derivative')
        if (buffer.length > limits.maxFileBytes)
          throw new WorkerProcessingError(
            'node_file_limit',
            true,
            undefined,
            buffer.length,
          )
        derivatives.push({
          role,
          bytes: buffer.length,
          contentType: contentType!,
          buffer,
        })
        return { key: 'derived/' + role, size: buffer.length }
      },
      async createFromFile(key, file, contentType) {
        return this.create(key, await readFile(file), contentType)
      },
      async delete() {
        throw new Error('operation_not_authorized')
      },
      getPublicUrl(key) {
        return key
      },
      async listAll() {
        return []
      },
      async listImages() {
        return []
      },
    }
    const geocoder = processingGeocoder(
      configuration.geocoding,
      signal,
      reserveGeocoding,
    )
    const process = createPhotoProcessor({
      logger: quiet,
      exif: createExifService({ exiftool, tempDir: directory, logger: quiet }),
      ...geocoder,
      reverseGeocode: ['photo', 'geocoding'].includes(operation)
        ? geocoder.reverseGeocode
        : async () => null,
      parseGPS: (exif) =>
        operation === 'geocoding' &&
        typeof jobOptions.latitude === 'number' &&
        typeof jobOptions.longitude === 'number'
          ? { latitude: jobOptions.latitude, longitude: jobOptions.longitude }
          : geocoder.parseGPS(exif),
    })
    const { photo } = await process({
      photoId: item.lease.photoId,
      storageKey: sourceKey,
      eraseLocation,
      maxPixels: limits.maxPixels,
      storage,
      async stage() {
        signal.throwIfAborted()
      },
      signal,
    })
    if (operation === 'live-photo' && companion) {
      for (let i = derivatives.length - 1; i >= 0; i--)
        if (derivatives[i]?.role === 'live-video') derivatives.splice(i, 1)
      photo.isLivePhoto = 1
      photo.livePhotoVideoKey = 'source.MOV'
    }
    if (
      photo.isLivePhoto &&
      companion &&
      photo.livePhotoVideoKey === 'source.MOV'
    )
      derivatives.push({
        role: 'live-video',
        bytes: companion.length,
        contentType: 'video/quicktime',
        buffer: companion,
      })
    if (!photo.width || !photo.height)
      throw new WorkerProcessingError('invalid_dimensions', false)
    // Persist only JSON-safe shared photo metadata; URLs/keys are resolved by APIs.
    const {
      originalUrl: _originalUrl,
      thumbnailUrl: _thumbnailUrl,
      livePhotoVideoUrl: _livePhotoVideoUrl,
      storageKey: _storageKey,
      thumbnailKey: _thumbnailKey,
      livePhotoVideoKey: _livePhotoVideoKey,
      originalDerivedKey: _originalDerivedKey,
      ...metadata
    } = photo
    const cleanMetadata = JSON.parse(JSON.stringify(metadata))
    if (
      previous &&
      ['geocoding', 'erase-location', 'live-photo'].includes(operation)
    ) {
      cleanMetadata.title = item.priorMetadata!.title
      cleanMetadata.description = previous.description
      cleanMetadata.tags = previous.tags
    }
    if (previous && operation === 'reindex') {
      cleanMetadata.description = previous.description
      for (const key of [
        'latitude',
        'longitude',
        'country',
        'city',
        'locationName',
        'geocoding',
      ])
        cleanMetadata[key] = previous[key] ?? null
    }
    if (previous && operation === 'live-photo') {
      for (const [key, value] of Object.entries(previous))
        if (
          ![
            'isLivePhoto',
            'livePhotoVideoKey',
            'livePhotoVideoUrl',
            'lastModified',
          ].includes(key)
        )
          cleanMetadata[key] = value
    }
    if (previous && operation === 'geocoding') {
      cleanMetadata.exif = previous.exif
      cleanMetadata.dateTaken = previous.dateTaken
    }
    if (eraseLocation) cleanMetadata.locationErased = true
    const metadataBytes = Buffer.byteLength(JSON.stringify(cleanMetadata))
    if (metadataBytes > limits.maxMetadataBytes)
      throw new WorkerProcessingError(
        'node_metadata_limit',
        true,
        undefined,
        undefined,
        metadataBytes,
      )
    return {
      result: {
        width: photo.width,
        height: photo.height,
        metadata: cleanMetadata,
      },
      derivatives,
    }
  } catch (error) {
    if (error instanceof WorkerProcessingError) throw error
    if (
      /unsupported|corrupt|invalid|pixel|decode|dimensions/i.test(
        error instanceof Error ? error.message : '',
      )
    )
      throw new WorkerProcessingError('invalid_media', false)
    throw new WorkerProcessingError('processing_error', true)
  } finally {
    await exiftool.end()
    await rm(directory, { recursive: true, force: true })
  }
}

import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { ExifTool } from 'exiftool-vendored'
import { createPhotoProcessor } from '@chronoframe/processing'
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
}
export interface Derivative {
  role: 'thumbnail' | 'live-video' | 'display'
  bytes: number
  contentType: string
  buffer: Buffer
}
export class WorkerProcessingError extends Error {
  readonly retryable: boolean
  constructor(code: string, retryable: boolean) {
    super(code)
    this.retryable = retryable
  }
}
const quiet = { info() {}, warn() {}, error() {}, debug() {}, success() {} }
/** Bound download bytes before allocating a complete input buffer. */
export async function boundedDownload(
  url: string,
  expected: number,
  signal: AbortSignal,
  etag?: string,
) {
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > 1073741824)
    throw new WorkerProcessingError('invalid_source_size', false)
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
): Promise<{
  result: Omit<CloudMediaResult, 'assets'>
  derivatives: Derivative[]
}> {
  const input = await boundedDownload(
    item.sourceUrl,
    item.lease.expectedBytes,
    signal,
    item.etag,
  )
  const companion = item.companion
    ? await boundedDownload(
        item.companion.url,
        item.companion.bytes,
        signal,
        item.companion.etag,
      )
    : null
  const ext = path.extname(item.lease.objectKey).toLowerCase()
  if (!['.heic', '.heif', '.hif'].includes(ext))
    await sharp(input, { limitInputPixels: 100000000 }).metadata()
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-worker-'))
  const exiftool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 30000 })
  const derivatives: Derivative[] = []
  try {
    if (['.heic', '.heif', '.hif'].includes(ext)) {
      const sourceFile = path.join(directory, 'source' + ext)
      await writeFile(sourceFile, input)
      const tags = await exiftool.read(sourceFile),
        width = Number(tags.ImageWidth ?? tags.ExifImageWidth),
        height = Number(tags.ImageHeight ?? tags.ExifImageHeight)
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        width * height > 100000000
      )
        throw new WorkerProcessingError('invalid_dimensions', false)
    }
    const storage: StorageProvider = {
      async get(key) {
        return key === item.lease.objectKey
          ? input
          : key === item.companion?.key
            ? companion
            : null
      },
      async getFileMeta(key) {
        return key === item.lease.objectKey
          ? { key, size: input.length }
          : key === item.companion?.key && companion
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
        if (!role || buffer.length > 1073741824)
          throw new Error('invalid_derivative')
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
    const process = createPhotoProcessor({
      logger: quiet,
      exif: createExifService({ exiftool, tempDir: directory, logger: quiet }),
      parseGPS() {
        return {}
      },
      async reverseGeocode() {
        return null
      },
    })
    const { photo } = await process({
      photoId: item.lease.photoId,
      storageKey: item.lease.objectKey,
      eraseLocation: false,
      storage,
      async stage() {
        signal.throwIfAborted()
      },
      signal,
    })
    if (
      photo.isLivePhoto &&
      companion &&
      photo.livePhotoVideoKey === item.companion?.key
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
    if (Buffer.byteLength(JSON.stringify(cleanMetadata)) > 60 * 1024)
      throw new WorkerProcessingError('metadata_too_large', false)
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

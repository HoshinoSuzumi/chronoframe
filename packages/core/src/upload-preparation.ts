import type {
  UploadPlan,
  UploadDuplicateSummary,
} from '@chronoframe/contracts/upload'
import { CoreError } from './errors.ts'

export type DuplicatePhoto = UploadDuplicateSummary
export interface UploadQuota {
  assertAllowed(owner: string, size: number | undefined): Promise<void>
}
export interface PhotoIdentifiers {
  fromStorageKey(key: string): string
}
export interface UploadPreparationRepository {
  findDuplicate(id: string): Promise<DuplicatePhoto | null>
}
export interface UploadPreparationInput {
  fileName: string
  contentType?: string
  fileSize?: number
  chunked?: boolean
  skipDuplicateCheck?: boolean
}
export interface UploadPolicy {
  prefix?: string
  maxBytes: number
  mimeWhitelistEnabled: boolean
  mimeWhitelist: string[]
  duplicateCheckEnabled: boolean
  duplicateMode: 'warn' | 'block' | 'skip'
}

/** Carry only the declared duplicate summary for transport-specific warning rendering. */
export class DuplicateUploadError extends CoreError {
  readonly existingPhoto: DuplicatePhoto
  constructor(photo: DuplicatePhoto) {
    super(409, 'Duplicate upload blocked', 'upload.duplicate.block.title')
    this.existingPhoto = photo
  }
}

const imageExtensions = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
])
const extension = (name: string) =>
  name.slice(name.lastIndexOf('.')).toLowerCase()

/** Enforce upload policy and duplicate decisions before creating provider upload sessions. */
export function createUploadPreparer(deps: {
  repository: UploadPreparationRepository
  identifiers: PhotoIdentifiers
  quota: UploadQuota
  prepare(
    owner: string,
    key: string,
    size: number | undefined,
    contentType: string,
    chunked: boolean,
  ): Promise<UploadPlan>
}) {
  return async (
    owner: string,
    input: UploadPreparationInput,
    policy: UploadPolicy,
  ) => {
    if (!input.fileName || typeof input.fileName !== 'string')
      throw new CoreError(
        400,
        'File name is required',
        'upload.error.required.title',
      )
    const { fileName, fileSize, chunked, contentType } = input
    if (!Number.isSafeInteger(fileSize) || fileSize! <= 0)
      throw new CoreError(400, 'Invalid file size')
    if (fileSize! > policy.maxBytes)
      throw new CoreError(
        413,
        'File is too large',
        'upload.error.tooLarge.title',
      )
    if (
      policy.mimeWhitelistEnabled &&
      policy.mimeWhitelist.length &&
      !policy.mimeWhitelist.includes(contentType || 'application/octet-stream')
    )
      throw new CoreError(
        415,
        'Invalid content type',
        'upload.error.invalidType.title',
      )
    if (/[\\/]/.test(fileName) || fileName === '.' || fileName === '..')
      throw new CoreError(400, 'Invalid file name')
    await deps.quota.assertAllowed(owner, fileSize)
    const fileKey = buildUploadObjectKey(policy.prefix, fileName)
    let existingPhoto: DuplicatePhoto | null = null
    if (policy.duplicateCheckEnabled && !input.skipDuplicateCheck) {
      existingPhoto = await deps.repository.findDuplicate(
        deps.identifiers.fromStorageKey(fileKey),
      )
      const video =
        contentType?.toLowerCase().startsWith('video/') ||
        ['.mov', '.mp4'].includes(extension(fileName))
      if (
        existingPhoto &&
        video &&
        existingPhoto.storageKey &&
        imageExtensions.has(extension(existingPhoto.storageKey))
      )
        existingPhoto = null
      if (existingPhoto && policy.duplicateMode === 'block')
        throw new DuplicateUploadError(existingPhoto)
      if (existingPhoto && policy.duplicateMode === 'skip')
        return { skipped: true as const, existingPhoto, fileKey }
    }
    const upload = await deps.prepare(
      owner,
      fileKey,
      fileSize,
      contentType || 'application/octet-stream',
      Boolean(chunked),
    )
    return { skipped: false as const, existingPhoto, fileKey, upload }
  }
}

/** Preserve configured object-key prefixes without quadratic trailing-slash trimming. */
export function buildUploadObjectKey(
  prefix: string | undefined,
  fileName: string,
): string {
  const value = prefix || ''
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end--
  return `${value.slice(0, end)}/${fileName}`
}

/** Reuse upload key and identifier rules for authenticated preflight checks. */
export function createDuplicateChecker<T extends DuplicatePhoto>(deps: {
  identifiers: PhotoIdentifiers
  find(id: string): Promise<T | null>
}) {
  return async (
    input: { fileNames?: string[]; storageKeys?: string[] },
    prefix?: string,
  ) => {
    const results: Array<{
      fileName?: string
      storageKey: string
      photoId: string
      exists: boolean
      photo: T | null
    }> = []
    for (const fileName of input.fileNames || []) {
      const storageKey = buildUploadObjectKey(prefix, fileName)
      const photoId = deps.identifiers.fromStorageKey(storageKey)
      const photo = await deps.find(photoId)
      results.push({
        fileName,
        storageKey,
        photoId,
        exists: Boolean(photo),
        photo,
      })
    }
    for (const storageKey of input.storageKeys || []) {
      const photoId = deps.identifiers.fromStorageKey(storageKey)
      const photo = await deps.find(photoId)
      results.push({ storageKey, photoId, exists: Boolean(photo), photo })
    }
    return results
  }
}

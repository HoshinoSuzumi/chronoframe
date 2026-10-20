import type { Photo } from '@chronoframe/contracts/resources'
import { CoreError } from './errors.ts'

/** Verify the business identity and object ownership before accepting a processing result. */
export function validatePhotoPublication(
  photo: Photo & { originalDerivedKey?: string | null },
  expected: {
    resourceId: string
    sourceKey: string
    generatedKeys: ReadonlySet<string>
    linkedVideoKeys: ReadonlySet<string>
    publicUrl(key: string): string
  },
) {
  const reject = () => {
    throw new CoreError(409, 'Processing result does not match its resource')
  }
  if (
    photo.id !== expected.resourceId ||
    photo.storageKey !== expected.sourceKey
  )
    reject()
  if (
    !Number.isSafeInteger(photo.width) ||
    !Number.isSafeInteger(photo.height) ||
    photo.width! <= 0 ||
    photo.height! <= 0 ||
    !Number.isFinite(photo.aspectRatio) ||
    Math.abs(photo.aspectRatio! - photo.width! / photo.height!) > 0.000001
  )
    reject()
  if (!Number.isSafeInteger(photo.fileSize) || photo.fileSize! < 0) reject()
  if (!photo.thumbnailKey || !expected.generatedKeys.has(photo.thumbnailKey))
    reject()
  if (
    photo.originalDerivedKey &&
    !expected.generatedKeys.has(photo.originalDerivedKey)
  )
    reject()
  if (
    photo.livePhotoVideoKey &&
    !expected.generatedKeys.has(photo.livePhotoVideoKey) &&
    !expected.linkedVideoKeys.has(photo.livePhotoVideoKey)
  )
    reject()
  if (
    photo.originalUrl !==
      expected.publicUrl(photo.originalDerivedKey ?? expected.sourceKey) ||
    photo.thumbnailUrl !== expected.publicUrl(photo.thumbnailKey!)
  )
    reject()
  if (
    photo.livePhotoVideoKey &&
    photo.livePhotoVideoUrl !== expected.publicUrl(photo.livePhotoVideoKey)
  )
    reject()
}

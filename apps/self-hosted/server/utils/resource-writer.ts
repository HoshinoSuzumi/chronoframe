import { persistenceErrorCode } from '@chronoframe/database'
import { storageForPhoto, storageForReference } from './object-storage'
import { DEFAULT_SITE } from '@chronoframe/core'
import type {} from '../types/worker'
import { createError, type H3Event } from 'h3'
import {
  CoreError,
  createAlbumWriter,
  createPhotoWriter,
} from '@chronoframe/core'
import {
  createSqliteAlbumWriteRepository,
  createSqlitePhotoWriteRepository,
} from '../repositories/sqlite-mutations'
import { editPhotoMetadata } from '../services/resources/photo-metadata'
import { hashAlbumPassword } from './album-access'
import { useDB } from './db'
import { useStorageProvider } from './useStorageProvider'
import { logger } from './logger'

/** Assemble album persistence, clock and hashing in the self-hosted application. */
export function useAlbumWriter() {
  return createAlbumWriter({
    repository: createSqliteAlbumWriteRepository(useDB(), DEFAULT_SITE),
    clock: { now: () => new Date() },
    hashPassword: hashAlbumPassword,
  })
}

/** Supply object I/O, native metadata editing and background dispatch to core. */
export function usePhotoWriter(event: H3Event) {
  const { storageProvider } = useStorageProvider(event)
  return createPhotoWriter({
    repository: createSqlitePhotoWriteRepository(useDB(), DEFAULT_SITE),
    clock: { now: () => new Date() },
    storage: {
      forPhoto: (photo) =>
        photo.storageReference
          ? storageForReference(
              {
                storageConnectionId: photo.storageReference.connectionId,
                storageRevision: photo.storageReference.revision,
              },
              storageProvider,
            )
          : storageForPhoto(photo.id, storageProvider),
    },
    editMetadata: async (photo, input) => {
      if (!photo.storageKey)
        throw new CoreError(400, 'Photo has no storage key')
      return editPhotoMetadata(
        { ...photo, storageKey: photo.storageKey },
        input,
        await (photo.storageReference
          ? storageForReference(
              {
                storageConnectionId: photo.storageReference.connectionId,
                storageRevision: photo.storageReference.revision,
              },
              storageProvider,
            )
          : storageForPhoto(photo.id, storageProvider)),
      )
    },
    warn(error, operation) {
      logger.image.warn(`Photo operation failed: ${operation}`, error)
    },
  })
}

/** Map domain failures to stable HTTP responses with request-local translations. */
export async function mutationResponse<T>(
  operation: () => Promise<T>,
  translate?: (key: string) => string,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (persistenceErrorCode(error) === 'invalid-relation')
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid resource reference',
      })
    if (error instanceof CoreError)
      throw createError({
        statusCode: error.statusCode,
        statusMessage:
          error.code && translate ? translate(error.code) : error.message,
      })
    throw error
  }
}

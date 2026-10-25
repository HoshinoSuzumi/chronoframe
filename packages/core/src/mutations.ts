import { hasValidCoordinates } from '@chronoframe/contracts/location'
import type { Album, Photo } from '@chronoframe/contracts/resources'
import { CoreError } from './errors.ts'

export interface MutationAccess {
  authenticated: boolean
}
export interface Clock {
  now(): Date
}

export interface AlbumInput {
  title?: string
  slug?: string
  description?: string
  coverPhotoId?: string
  photoIds?: string[]
  isHidden?: boolean
  password?: string
}
export interface AlbumWriteData {
  title?: string
  description?: string | null
  coverPhotoId?: string | null
  isHidden?: boolean
  passwordHash?: string | null
  updatedAt?: Date
}

/** Each multi-row operation is atomic in the concrete database adapter. */
export interface AlbumWriteRepository {
  exists(id: number): Promise<boolean>
  createFirst(
    data: AlbumWriteData & { title: string },
    photoIds: string[],
    requestedSlug?: string,
  ): Promise<Album>
  update(
    id: number,
    data: AlbumWriteData,
    photoIds?: string[],
    requestedSlug?: string,
  ): Promise<Album | null>
  delete(id: number): Promise<boolean>
  reorder(ids: number[]): Promise<void>
  removePhoto(id: number, photoId: string, updatedAt: Date): Promise<boolean>
}

function authorize(access: MutationAccess) {
  if (!access.authenticated) throw new CoreError(401, 'Unauthorized')
}

function albumPhotoIds(input: AlbumInput): string[] {
  const ids = new Set(input.photoIds || [])
  if (input.coverPhotoId) ids.add(input.coverPhotoId)
  return [...ids]
}

/** Own album write policy while delegating atomic persistence and password hashing. */
export function createAlbumWriter(deps: {
  repository: AlbumWriteRepository
  clock: Clock
  hashPassword(password: string): Promise<string>
}) {
  return {
    async create(
      input: AlbumInput & { title: string },
      access: MutationAccess,
    ) {
      authorize(access)
      return deps.repository.createFirst(
        {
          title: input.title,
          description: input.description || null,
          coverPhotoId: input.coverPhotoId || null,
          isHidden: input.isHidden || false,
          passwordHash: input.password
            ? await deps.hashPassword(input.password)
            : null,
        },
        albumPhotoIds(input),
        input.slug ?? '',
      )
    },
    async update(id: number, input: AlbumInput, access: MutationAccess) {
      authorize(access)
      if (!(await deps.repository.exists(id)))
        throw new CoreError(404, 'Album not found')
      const data: AlbumWriteData = { updatedAt: deps.clock.now() }
      if (input.title !== undefined) data.title = input.title
      if (input.description !== undefined)
        data.description = input.description || null
      if (input.coverPhotoId !== undefined)
        data.coverPhotoId = input.coverPhotoId || null
      if (input.isHidden !== undefined) data.isHidden = input.isHidden
      if (input.password !== undefined)
        data.passwordHash = input.password
          ? await deps.hashPassword(input.password)
          : null
      const album = await deps.repository.update(
        id,
        data,
        input.photoIds === undefined ? undefined : albumPhotoIds(input),
        input.slug,
      )
      if (!album) throw new CoreError(404, 'Album not found')
      return album
    },
    async delete(id: number, access: MutationAccess) {
      authorize(access)
      if (!(await deps.repository.delete(id)))
        throw new CoreError(404, 'Album not found')
      return { success: true }
    },
    async reorder(ids: number[], access: MutationAccess) {
      authorize(access)
      await deps.repository.reorder(ids)
      return { success: true }
    },
    async removePhoto(id: number, photoId: string, access: MutationAccess) {
      authorize(access)
      if (!(await deps.repository.removePhoto(id, photoId, deps.clock.now())))
        throw new CoreError(404, 'Photo not found in album')
      return { success: true }
    },
  }
}

export interface PhotoMetadataInput {
  title?: string
  description?: string
  tags?: string[]
  location?: { latitude: number; longitude: number } | null
  rating?: number | null
}
export type PhotoUpdate = Partial<
  Pick<
    Photo,
    | 'title'
    | 'description'
    | 'tags'
    | 'exif'
    | 'fileSize'
    | 'lastModified'
    | 'storageKey'
    | 'originalUrl'
    | 'latitude'
    | 'longitude'
    | 'country'
    | 'city'
    | 'locationName'
    | 'geocoding'
  >
>
export type PhotoRecord = Photo & {
  mutationVersion?: number
  originalDerivedKey?: string | null
  storageReference?: { connectionId: number | null; revision: number }
}
export interface PhotoWriteRepository {
  get(id: string): Promise<PhotoRecord | null>
  /** Persist a requested follow-up task in the same transaction as the resource update. */
  update(
    id: string,
    update: PhotoUpdate,
    reverseGeocode?: { latitude: number; longitude: number },
    expectedVersion?: number,
  ): Promise<Photo | null>
  delete(id: string): Promise<PhotoRecord | null>
}
export interface PhotoObjectStorage {
  delete(key: string): Promise<void>
}
export interface StorageResolver {
  forPhoto(photo: PhotoRecord): Promise<PhotoObjectStorage>
}
export interface PhotoTaskDispatcher {
  reverseGeocode(
    id: string,
    coordinates: { latitude: number; longitude: number },
  ): Promise<void>
}

/** Normalize editable text and tags before updating either EXIF or the database. */
export function normalizePhotoMetadata(
  input: PhotoMetadataInput,
): PhotoMetadataInput {
  const normalized = { ...input }
  if (input.title !== undefined) normalized.title = input.title.trim()
  if (input.description !== undefined)
    normalized.description = input.description.trim()
  if (input.tags !== undefined) {
    const seen = new Set<string>()
    normalized.tags = input.tags
      .map((tag) => tag.trim())
      .filter((tag) => {
        const key = tag.toLowerCase()
        if (!tag || seen.has(key)) return false
        seen.add(key)
        return true
      })
  }
  return normalized
}

/** Coordinate metadata edits and best-effort file cleanup without runtime globals. */
export function createPhotoWriter(deps: {
  repository: PhotoWriteRepository
  storage: StorageResolver
  clock: Clock
  editMetadata(
    photo: PhotoRecord,
    input: PhotoMetadataInput,
  ): Promise<
    Pick<Photo, 'exif' | 'fileSize'> & {
      storageKey?: string
      originalUrl?: string | null
      discard?(): Promise<void>
    }
  >
  warn(error: unknown, operation: string): void
}) {
  return {
    async update(id: string, raw: PhotoMetadataInput, access: MutationAccess) {
      authorize(access)
      if (Object.values(raw).every((value) => value === undefined))
        throw new CoreError(
          400,
          'No changes provided',
          'dashboard.photos.messages.noChangesProvided',
        )
      if (
        raw.location &&
        !hasValidCoordinates(raw.location.latitude, raw.location.longitude)
      )
        throw new CoreError(400, 'Invalid coordinates')
      const photo = await deps.repository.get(id)
      if (!photo)
        throw new CoreError(
          404,
          'Photo not found',
          'dashboard.photos.messages.photoNotFound',
        )
      if (!photo.storageKey)
        throw new CoreError(
          400,
          'Photo has no storage key',
          'dashboard.photos.messages.noStorageKey',
        )
      const input = normalizePhotoMetadata(raw)
      const edited = await deps.editMetadata(photo, input)
      const update: PhotoUpdate = {
        exif: edited.exif,
        fileSize: edited.fileSize,
        lastModified: deps.clock.now().toISOString(),
      }
      if (edited.storageKey !== undefined) update.storageKey = edited.storageKey
      if (edited.originalUrl !== undefined)
        update.originalUrl = edited.originalUrl
      if (input.title !== undefined) update.title = input.title || null
      if (input.description !== undefined)
        update.description = input.description || null
      if (input.tags !== undefined) update.tags = input.tags
      if (input.location !== undefined) {
        Object.assign(update, {
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
          country: null,
          city: null,
          locationName: null,
          geocoding: null,
        })
      }
      let updated: Photo | null
      try {
        updated = await deps.repository.update(
          id,
          update,
          input.location ?? undefined,
          photo.mutationVersion,
        )
        if (!updated) throw new CoreError(404, 'Photo not found')
      } catch (error) {
        try {
          await edited.discard?.()
        } catch (cleanupError) {
          deps.warn(cleanupError, 'discard-photo-metadata')
        }
        if (error instanceof CoreError) throw error
        deps.warn(error, 'update-photo-record')
        throw new CoreError(
          500,
          'Failed to update photo metadata',
          'dashboard.photos.messages.metadataUpdateFailed',
        )
      }
      return { success: true, photo: updated || undefined }
    },
    async delete(id: string, access: MutationAccess) {
      authorize(access)
      const photo = await deps.repository.delete(id)
      if (!photo) throw new CoreError(404, 'Photo not found')
      const keys = [
        photo.storageKey,
        photo.thumbnailKey,
        photo.livePhotoVideoKey,
        photo.originalDerivedKey,
      ]
      const match =
        photo.storageKey && /\.(heic|heif|hif)$/i.exec(photo.storageKey)
      if (match && !photo.originalDerivedKey)
        keys.push(photo.storageKey!.slice(0, -match[0].length) + '.jpeg')
      const storage = await deps.storage.forPhoto(photo)
      for (const key of new Set(
        keys.filter((key): key is string => Boolean(key)),
      )) {
        try {
          await storage.delete(key)
        } catch (error) {
          deps.warn(error, 'delete-photo-object')
        }
      }
      return { statusCode: 200, statusMessage: 'Photo deleted successfully' }
    },
  }
}

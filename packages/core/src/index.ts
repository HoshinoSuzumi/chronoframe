import type { Album, Photo } from '@chronoframe/contracts/resources'

/** Internal access data stays separate from the public album resource. */
export interface AlbumReadRecord {
  resource: Album
  passwordHash: string | null
}

export interface PhotoMembership {
  photoId: string
  albumId: number
  hidden: boolean
  protected: boolean
}

/** Async boundary allows both embedded SQLite and future asynchronous adapters. */
export interface ResourceReadRepository {
  protectedPhoto?(photo: Photo): Photo
  listPhotos(
    excludedIds?: string[],
    page?: { limit: number; offset: number },
  ): Promise<Photo[]>
  listAlbums(): Promise<AlbumReadRecord[]>
  getAlbum(id: number): Promise<AlbumReadRecord | null>
  listAlbumPhotos(id: number): Promise<Photo[]>
  listAlbumPhotoIds(id: number): Promise<string[]>
  membershipsForPhoto?(id: string): Promise<PhotoMembership[]>
  listMemberships(): Promise<PhotoMembership[]>
}

export interface ReadAccess {
  admin: boolean
  canAccess(album: {
    id: number
    isHidden: boolean
    passwordHash: string | null
  }): boolean
}

export { CoreError, ResourceReadError } from './errors.ts'
import { ResourceReadError } from './errors.ts'

/** Read use cases own visibility rules; repositories own query and ordering details. */
export function createResourceReader(repository: ResourceReadRepository) {
  return {
    async listPhotos(access: Pick<ReadAccess, 'admin'>): Promise<Photo[]> {
      if (!access.admin) throw new ResourceReadError(401, 'Unauthorized')
      return repository.listPhotos()
    },

    async listVisiblePhotos(): Promise<Photo[]> {
      const excluded = new Set(
        (await repository.listMemberships())
          .filter((m) => m.hidden || m.protected)
          .map((m) => m.photoId),
      )
      return repository.listPhotos([...excluded])
    },

    async listAlbums(
      access: Pick<ReadAccess, 'admin'>,
    ): Promise<Array<Album & { photoIds: string[] }>> {
      const memberships = await repository.listMemberships()
      const excluded = new Set(
        memberships
          .filter((m) => m.hidden || m.protected)
          .map((m) => m.photoId),
      )
      const albums = await repository.listAlbums()
      return Promise.all(
        albums
          .filter(({ resource }) => access.admin || !resource.isHidden)
          .map(async ({ resource, passwordHash }) => {
            const accessible =
              access.admin || (!resource.isHidden && !passwordHash)
            const photos = accessible
              ? await repository.listAlbumPhotoIds(resource.id)
              : []
            return {
              ...resource,
              coverPhotoId:
                access.admin ||
                (accessible && !excluded.has(resource.coverPhotoId || ''))
                  ? resource.coverPhotoId
                  : null,
              photoIds: photos.filter(
                (id) => access.admin || !excluded.has(id),
              ),
            }
          }),
      )
    },

    async getAlbum(
      id: number,
      access: ReadAccess,
    ): Promise<Album & { photos: Photo[] }> {
      const record = await repository.getAlbum(id)
      if (!record || (record.resource.isHidden && !access.admin))
        throw new ResourceReadError(404, 'Album not found')
      const { resource, passwordHash } = record
      if (!access.canAccess({ id, isHidden: resource.isHidden, passwordHash }))
        throw new ResourceReadError(403, 'Album password required')
      const excluded = new Set(
        access.admin
          ? []
          : (await repository.listMemberships())
              .filter(
                (m) =>
                  m.hidden ||
                  (!passwordHash && m.protected && m.albumId !== id),
              )
              .map((m) => m.photoId),
      )
      const photos = (await repository.listAlbumPhotos(id)).filter(
        (photo) => !excluded.has(photo.id),
      )
      return {
        ...resource,
        photos: passwordHash
          ? photos.map((photo) => {
              if (repository.protectedPhoto)
                return repository.protectedPhoto(photo)
              const {
                storageKey,
                thumbnailKey: _thumbnailKey,
                livePhotoVideoKey: _videoKey,
                ...safePhoto
              } = photo
              return {
                ...safePhoto,
                fileName: storageKey?.split(/[\\/]/).pop() || null,
                originalUrl: `/image/__photo__/${encodeURIComponent(photo.id)}/original`,
                thumbnailUrl: `/image/__photo__/${encodeURIComponent(photo.id)}/thumbnail`,
                livePhotoVideoUrl: photo.livePhotoVideoUrl
                  ? `/image/__photo__/${encodeURIComponent(photo.id)}/live`
                  : null,
              }
            })
          : photos,
      }
    },
  }
}

export * from './mutations.ts'
export * from './settings.ts'
export * from './uploads.ts'
export * from './access.ts'
export * from './upload-preparation.ts'

export * from './site.ts'
export * from './publication.ts'
export * from './platform.ts'
export * from './email-auth.ts'

export type * from './cloud-media.ts'
export type * from './cloud-execution.ts'

import type {
  Photo,
  Album,
  UserSummary,
} from '@chronoframe/contracts/resources'
import type {
  Photo as PhotoRow,
  Album as AlbumRow,
  User as UserRow,
} from './connection.ts'

/** Expose only the declared photo contract fields, excluding internal database columns. */
export function toPhotoDto(photo: PhotoRow): Photo {
  return {
    id: photo.id,
    title: photo.title,
    description: photo.description,
    width: photo.width,
    height: photo.height,
    aspectRatio: photo.aspectRatio,
    dateTaken: photo.dateTaken,
    storageKey: photo.storageKey,
    thumbnailKey: photo.thumbnailKey,
    fileSize: photo.fileSize,
    lastModified: photo.lastModified,
    originalUrl:
      photo.storageConnectionId != null && photo.originalUrl
        ? `/image/__photo__/${encodeURIComponent(photo.id)}/original`
        : photo.originalUrl,
    thumbnailUrl:
      photo.storageConnectionId != null && photo.thumbnailUrl
        ? `/image/__photo__/${encodeURIComponent(photo.id)}/thumbnail`
        : photo.thumbnailUrl,
    thumbnailHash: photo.thumbnailHash,
    tags: photo.tags,
    exif: photo.exif,
    latitude: photo.latitude,
    longitude: photo.longitude,
    country: photo.country,
    city: photo.city,
    locationName: photo.locationName,
    geocoding: photo.geocoding,
    isLivePhoto: photo.isLivePhoto,
    livePhotoVideoUrl:
      photo.storageConnectionId != null && photo.livePhotoVideoUrl
        ? `/image/__photo__/${encodeURIComponent(photo.id)}/live`
        : photo.livePhotoVideoUrl,
    livePhotoVideoKey: photo.livePhotoVideoKey,
  }
}

/** Serialize album dates and expose password presence without its hash. */
export function toAlbumDto(album: AlbumRow, slug: string | null): Album {
  return {
    id: album.id,
    ...(slug === null ? {} : { slug }),
    title: album.title,
    description: album.description,
    coverPhotoId: album.coverPhotoId,
    isHidden: album.isHidden,
    position: album.position,
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString(),
    hasPassword: Boolean(album.passwordHash),
  }
}

/** Build a session-safe user summary without password material. */
export function toUserSummary(user: UserRow): UserSummary {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    createdAt: user.createdAt.toISOString(),
    isAdmin: user.isAdmin,
  }
}

/** Serialize an administrator-only provider response; configuration may contain secrets. */
export function toStorageProviderDto(
  provider: typeof import('./schema.ts').settings_storage_providers.$inferSelect,
): import('@chronoframe/contracts/settings').SettingStorageProvider {
  return {
    id: provider.id,
    name: provider.name,
    provider: provider.provider,
    config: provider.config,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  }
}

import type {
  Photo,
  Album,
  UserSummary,
} from '@chronoframe/contracts/resources'
import type {
  Photo as PhotoRow,
  Album as AlbumRow,
  User as UserRow,
} from './db'

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
    originalUrl: photo.originalUrl,
    thumbnailUrl: photo.thumbnailUrl,
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
    livePhotoVideoUrl: photo.livePhotoVideoUrl,
    livePhotoVideoKey: photo.livePhotoVideoKey,
  }
}

export function toAlbumDto(album: AlbumRow): Album {
  return {
    id: album.id,
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

export function toStorageProviderDto(
  provider: import('../types/settings').StorageProviderRow,
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

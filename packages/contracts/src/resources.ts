import type { NeededExif } from './photo.ts'
import type { NormalizedLocation } from './location.ts'

/** JSON response contract; dates are serialized strings. */
export interface Photo {
  id: string
  title: string | null
  description: string | null
  width: number | null
  height: number | null
  aspectRatio: number | null
  dateTaken: string | null
  storageKey?: string | null
  thumbnailKey?: string | null
  fileSize: number | null
  lastModified: string | null
  originalUrl: string | null
  /** Unconverted source for download when the viewer uses a display derivative. */
  downloadUrl?: string | null
  thumbnailUrl: string | null
  thumbnailHash: string | null
  tags: string[] | null
  exif: NeededExif | null
  latitude: number | null
  longitude: number | null
  country: string | null
  city: string | null
  locationName: string | null
  geocoding: NormalizedLocation | null
  isLivePhoto: number
  livePhotoVideoUrl: string | null
  livePhotoVideoKey?: string | null
  fileName?: string | null
}

export interface Album {
  id: number
  /** Canonical public URL segment; older clients may omit it. */
  slug?: string
  title: string
  description: string | null
  coverPhotoId: string | null
  isHidden: boolean
  position: number
  createdAt: string
  updatedAt: string
  hasPassword: boolean
}

export interface UserSummary {
  id: number
  username: string
  email: string
  avatar: string | null
  createdAt: string
  isAdmin: number
}

export interface ListResponse<T> {
  items: T[]
  total: number
}

export interface ApiError {
  statusCode: number
  statusMessage?: string
  message?: string
}

export const ALBUM_SLUG_MAX_LENGTH = 80

export interface AlbumPathResolution {
  albumId: number
  slug: string
  isCanonical: boolean
  isHidden?: boolean
  redirectCode?: 301 | 302
}

const albumSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const numericAlbumPathPattern = /^\d+$/

export function isNumericAlbumPathSegment(value: string): boolean {
  return numericAlbumPathPattern.test(value)
}

export function isValidAlbumSlug(value: string): boolean {
  return (
    value.length <= ALBUM_SLUG_MAX_LENGTH &&
    albumSlugPattern.test(value) &&
    !isNumericAlbumPathSegment(value)
  )
}

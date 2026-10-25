import {
  isNumericAlbumPathSegment,
  isValidAlbumSlug,
} from '@chronoframe/contracts/album-slug'

export function numericAlbumId(segment: string): number | null {
  if (!isNumericAlbumPathSegment(segment)) return null
  const id = Number(segment)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function albumPagePath(
  album: { id: number; slug?: string | null },
  useSlugs: boolean,
): string {
  if (useSlugs && album.slug) return `/albums/${album.slug}`
  return `/albums/${album.id}`
}

export function isAlbumPagePath(path: string): boolean {
  const segment = /^\/albums\/([^/?#]+)$/.exec(path)?.[1]
  return (
    segment !== undefined &&
    (isValidAlbumSlug(segment) || numericAlbumId(segment) !== null)
  )
}

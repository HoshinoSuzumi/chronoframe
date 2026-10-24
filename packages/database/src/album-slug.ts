import { slugify } from 'transliteration'
import { CoreError } from '@chronoframe/core'

export const ALBUM_SLUG_MAX_LENGTH = 80
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Convert a title to a stable, URL-safe base. Persistence owns uniqueness. */
export function generatedAlbumSlug(title: string): string {
  const result = slugify(title.normalize('NFKD'), {
    separator: '-',
    lowercase: true,
  })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ALBUM_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
  if (!result) return 'album'
  return /^\d+$/.test(result)
    ? `album-${result.slice(0, ALBUM_SLUG_MAX_LENGTH - 6)}`
    : result
}

/** Keep a manually chosen slug exact after trimming surrounding whitespace. */
export function validateCustomAlbumSlug(input: string): string {
  const slug = input.trim()
  if (
    slug.length > ALBUM_SLUG_MAX_LENGTH ||
    !slugPattern.test(slug) ||
    /^\d+$/.test(slug)
  )
    throw new CoreError(400, 'Invalid album URL slug')
  return slug
}

export function suffixedAlbumSlug(base: string, suffix: number): string {
  if (suffix === 0) return base
  const ending = `-${suffix}`
  return `${base.slice(0, ALBUM_SLUG_MAX_LENGTH - ending.length).replace(/-+$/g, '')}${ending}`
}

import { createError } from 'h3'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
export function uploadAlbumIds(value: unknown): number[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    new Set(value).size !== value.length
  )
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid upload albums',
    })
  return [...value].sort((a, b) => a - b)
}
export async function validateUploadAlbums(
  db: MediaDatabase,
  siteId: number,
  value: unknown,
) {
  const ids = uploadAlbumIds(value)
  if (ids.length) {
    const result = await db
      .prepare(
        'SELECT COUNT(*) AS total FROM cloud_albums WHERE site_id=? AND id IN (SELECT CAST(value AS TEXT) FROM json_each(?))',
      )
      .bind(siteId, JSON.stringify(ids))
      .all<{ total: number }>()
    if (result.results[0]?.total !== ids.length)
      throw createError({
        statusCode: 400,
        statusMessage: 'Selected upload albums are unavailable',
        data: { code: 'upload_albums_unavailable' },
      })
  }
  return JSON.stringify(ids)
}

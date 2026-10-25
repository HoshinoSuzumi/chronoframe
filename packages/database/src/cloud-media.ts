import { createCloudAlbumWithSlug } from './cloud-album-slugs.ts'
import {
  assertSiteContext,
  CoreError,
  type SiteContext,
} from '@chronoframe/core'

/** Minimal asynchronous SQL boundary shared by D1 and the SQLite behavior harness.
 * batch must execute all statements atomically, in order, or roll them all back.
 * This entry deliberately imports no native SQLite driver.
 */
export interface MediaStatement {
  bind(...values: (string | number | null)[]): MediaStatement
  all<T>(): Promise<{ results: T[] }>
}
export interface MediaDatabase {
  prepare(sql: string): MediaStatement
  batch(statements: MediaStatement[]): Promise<unknown>
}
import type {
  UploadReservation,
  MediaPhoto,
  MediaUpload,
  CloudMediaRepository,
} from '@chronoframe/core'
export type {
  UploadReservation,
  MediaPhoto,
  MediaUpload,
  CloudMediaRepository,
} from '@chronoframe/core'
function text(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024)
    throw new CoreError(400, 'Invalid catalog value')
  return value
}
function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CoreError(400, 'Invalid catalog number')
  return value
}

/** Internal repository: the application must authorize the trusted Site context.
 * No public DTOs, signed URLs, credentials, or provider callbacks are persisted.
 */
export function createCloudMediaRepository(
  db: MediaDatabase,
  site: SiteContext,
): CloudMediaRepository {
  assertSiteContext(site)
  const siteId = site.id
  const statement = (sql: string, ...values: (string | number | null)[]) =>
    db.prepare(sql).bind(siteId, ...values)
  async function first<T>(sql: string, ...values: (string | number | null)[]) {
    return (await statement(sql, ...values).all<T>()).results[0] ?? null
  }
  async function upload(id: string, ownerId: number) {
    return first<MediaUpload>(
      'SELECT * FROM cloud_uploads WHERE site_id=? AND id=? AND owner_id=?',
      text(id),
      integer(ownerId),
    )
  }
  return {
    async photo(id: string) {
      return first<MediaPhoto>(
        'SELECT id,title,source_version FROM cloud_photos WHERE site_id=? AND id=? AND deleted=0',
        text(id),
      )
    },
    async album(id: string) {
      return first<{ id: string; title: string }>(
        'SELECT id,title FROM cloud_albums WHERE site_id=? AND id=?',
        text(id),
      )
    },
    async createAlbum(id: string, title: string) {
      await createCloudAlbumWithSlug(db, siteId, text(id), text(title))
    },
    async addToAlbum(albumId: string, photoId: string) {
      if (
        !(await first<{ id: string }>(
          'SELECT id FROM cloud_albums WHERE site_id=? AND id=?',
          text(albumId),
        ))
      )
        throw new CoreError(404, 'Album not found')
      await db.batch([
        statement(
          `INSERT INTO cloud_album_photos(site_id,album_id,photo_id)
         SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM cloud_photos WHERE site_id=? AND id=? AND deleted=0)
         ON CONFLICT DO NOTHING`,
          text(albumId),
          text(photoId),
          siteId,
          photoId,
        ),
      ])
      if (
        !(await first<{ photo_id: string }>(
          `SELECT a.photo_id FROM cloud_album_photos a JOIN cloud_photos p ON p.site_id=a.site_id AND p.id=a.photo_id WHERE a.site_id=? AND a.album_id=? AND a.photo_id=? AND p.deleted=0`,
          albumId,
          photoId,
        ))
      )
        throw new CoreError(404, 'Photo not found')
    },
    async albumPhotos(albumId: string, after = '') {
      return (
        await statement(
          `SELECT p.id,p.title,p.source_version FROM cloud_photos p
         JOIN cloud_album_photos a ON a.site_id=p.site_id AND a.photo_id=p.id
         WHERE p.site_id=? AND a.album_id=? AND p.deleted=0 AND p.id>? ORDER BY p.id LIMIT 100`,
          text(albumId),
          after,
        ).all<MediaPhoto>()
      ).results
    },
    upload,
    async reserveUpload(input: UploadReservation) {
      const values = [
        text(input.id),
        integer(input.ownerId),
        text(input.photoId),
        text(input.sourceVersion),
        text(input.connectionId),
        text(input.objectKey),
        input.providerUploadId === null ? null : text(input.providerUploadId),
        integer(input.expectedBytes),
        integer(input.expiresAt),
      ]
      await db.batch([
        statement(
          `INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,provider_upload_id,expected_bytes,expires_at)
         VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
          ...values,
        ),
      ])
      const existing = await upload(input.id, input.ownerId)
      if (
        !existing ||
        existing.photo_id !== input.photoId ||
        existing.source_version !== input.sourceVersion ||
        existing.connection_id !== input.connectionId ||
        existing.object_key !== input.objectKey ||
        existing.provider_upload_id !== input.providerUploadId ||
        existing.expected_bytes !== input.expectedBytes ||
        existing.expires_at !== input.expiresAt
      )
        throw new CoreError(409, 'Upload identifier or object already used')
    },
    /** Only call after provider-side object verification. Completion and durable
     * queued job are one batch; queue delivery is a separate later adapter.
     */
    async completeUpload(input: {
      id: string
      ownerId: number
      jobId: string
      pipelineVersion: string
      title: string
      now: number
    }) {
      const { id, ownerId, jobId, pipelineVersion, title, now } = input
      text(id)
      integer(ownerId)
      text(jobId)
      text(pipelineVersion)
      text(title)
      integer(now)
      const condition = `site_id=? AND id=? AND owner_id=? AND state='pending' AND expires_at>?`
      await db.batch([
        statement(
          `INSERT INTO cloud_photos(site_id,id,source_version,title)
          SELECT ?,photo_id,source_version,? FROM cloud_uploads WHERE ${condition}`,
          title,
          siteId,
          id,
          ownerId,
          now,
        ),
        statement(
          `INSERT INTO cloud_processing_jobs(site_id,id,upload_id,photo_id,source_version,pipeline_version,created_at)
          SELECT ?,?,id,photo_id,source_version,?,? FROM cloud_uploads WHERE ${condition}`,
          jobId,
          pipelineVersion,
          now,
          siteId,
          id,
          ownerId,
          now,
        ),
        statement(
          `INSERT INTO cloud_usage_events(site_id,upload_id,bytes,created_at) SELECT ?,id,expected_bytes+expected_video_bytes,? FROM cloud_uploads WHERE ${condition} ON CONFLICT DO NOTHING`,
          now,
          siteId,
          id,
          ownerId,
          now,
        ),
        statement(
          `UPDATE cloud_uploads SET state='completed' WHERE site_id=? AND id=? AND owner_id=? AND state='pending' AND expires_at>?`,
          id,
          ownerId,
          now,
        ),
      ])
      const result = await first<{ id: string; pipeline_version: string }>(
        `SELECT j.id,j.pipeline_version FROM cloud_processing_jobs j JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id
         WHERE j.site_id=? AND u.id=? AND u.owner_id=? AND u.state='completed'`,
        id,
        ownerId,
      )
      if (!result) throw new CoreError(409, 'Upload unavailable')
      if (result.id !== jobId || result.pipeline_version !== pipelineVersion)
        throw new CoreError(409, 'Upload already completed with another job')
      return result.id
    },
    async cancelUpload(id: string, ownerId: number) {
      await db.batch([
        statement(
          `UPDATE cloud_uploads SET state='cancelled' WHERE site_id=? AND id=? AND owner_id=? AND state='pending'`,
          text(id),
          integer(ownerId),
        ),
      ])
    },
    async job(id: string) {
      return first<{
        id: string
        photo_id: string
        source_version: string
        state: string
      }>(
        'SELECT id,photo_id,source_version,state FROM cloud_processing_jobs WHERE site_id=? AND id=?',
        text(id),
      )
    },
    async deletePhoto(id: string) {
      text(id)
      await db.batch([
        statement(
          'UPDATE cloud_photos SET deleted=1 WHERE site_id=? AND id=?',
          id,
        ),
        statement(
          "UPDATE cloud_processing_jobs SET state='cancelled' WHERE site_id=? AND photo_id=? AND state IN ('queued','running','retry_wait')",
          id,
        ),
      ])
    },
  }
}

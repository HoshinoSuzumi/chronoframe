import { ensureCloudAlbumSlugs } from './cloud-album-slugs.ts'
import {
  assertSiteContext,
  type SiteContext,
  type ResourceReadRepository,
  type AlbumReadRecord,
} from '@chronoframe/core'
import type { Photo } from '@chronoframe/contracts/resources'
import type { MediaDatabase } from './cloud-media.ts'
/** Shared read contract; private media endpoints are emitted, never signed URLs.
 * Cloud HTTP assembly applies the same core visibility/access rules as SQLite.
 */
export function createCloudResourceRepository(
  db: MediaDatabase,
  site: SiteContext,
  mediaPrefix: string,
): ResourceReadRepository {
  assertSiteContext(site)
  let slugRepair: Promise<void> | undefined
  const ensureSlugs = () => (slugRepair ??= ensureCloudAlbumSlugs(db, site.id))
  const all = async <T>(sql: string, ...values: (string | number | null)[]) =>
    (
      await db
        .prepare(sql)
        .bind(site.id, ...values)
        .all<T>()
    ).results
  const photo = (row: Record<string, unknown>): Photo => {
    const m = JSON.parse(String(row.metadata_json)) as Partial<Photo>
    const id = String(row.id),
      base = mediaPrefix + '/' + encodeURIComponent(id)
    return {
      id,
      title: String(row.title),
      description: typeof m.description === 'string' ? m.description : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
      aspectRatio:
        typeof m.width === 'number' && typeof m.height === 'number'
          ? m.width / m.height
          : null,
      dateTaken: typeof m.dateTaken === 'string' ? m.dateTaken : null,
      fileSize: typeof m.fileSize === 'number' ? m.fileSize : null,
      lastModified: null,
      originalUrl: base + '/display',
      downloadUrl: base + '/original',
      thumbnailUrl: base + '/thumbnail',
      thumbnailHash:
        typeof m.thumbnailHash === 'string' ? m.thumbnailHash : null,
      tags: Array.isArray(m.tags)
        ? m.tags.filter((t) => typeof t === 'string')
        : null,
      exif: m.exif ?? null,
      latitude: typeof m.latitude === 'number' ? m.latitude : null,
      longitude: typeof m.longitude === 'number' ? m.longitude : null,
      country: typeof m.country === 'string' ? m.country : null,
      city: typeof m.city === 'string' ? m.city : null,
      locationName: typeof m.locationName === 'string' ? m.locationName : null,
      geocoding: null,
      isLivePhoto: row.has_video ? 1 : 0,
      livePhotoVideoUrl: row.has_video ? base + '/live-video' : null,
    }
  }
  const columns = `p.*,EXISTS(SELECT 1 FROM cloud_media_assets a WHERE a.site_id=p.site_id AND a.photo_id=p.id AND a.source_version=p.source_version AND a.role='live-video') AS has_video`
  const ready = `p.deleted=0 AND p.metadata_json IS NOT NULL AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=p.site_id AND j.photo_id=p.id AND j.source_version=p.source_version AND j.state='succeeded')`
  const album = (r: Record<string, unknown>): AlbumReadRecord => ({
    resource: {
      id: Number(r.id),
      slug: String(r.slug),
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      coverPhotoId: r.ready_cover_photo_id
        ? String(r.ready_cover_photo_id)
        : null,
      isHidden: !!r.hidden,
      position: Number(r.position),
      createdAt: new Date(Number(r.created_at)).toISOString(),
      updatedAt: new Date(Number(r.updated_at)).toISOString(),
      hasPassword: !!r.password_hash,
    },
    passwordHash: r.password_hash ? String(r.password_hash) : null,
  })
  const albumSelect = `SELECT a.*,(SELECT slug FROM cloud_album_slugs s WHERE s.site_id=a.site_id AND s.album_id=a.id AND s.is_current=1) AS slug,v.password_hash,(SELECT p.id FROM cloud_photos p WHERE p.site_id=a.site_id AND p.id=a.cover_photo_id AND ${ready}) AS ready_cover_photo_id FROM cloud_albums a LEFT JOIN platform_album_access v ON v.site_id=a.site_id AND CAST(v.album_id AS TEXT)=a.id WHERE a.site_id=?`
  async function memberships(photoId?: string) {
    return (
      await all<{
        photoId: string
        albumId: string
        hidden: number
        protected: number
      }>(
        `SELECT m.photo_id AS photoId,m.album_id AS albumId,a.hidden,EXISTS(SELECT 1 FROM platform_album_access v WHERE v.site_id=a.site_id AND CAST(v.album_id AS TEXT)=a.id) AS protected FROM cloud_album_photos m JOIN cloud_albums a ON a.site_id=m.site_id AND a.id=m.album_id WHERE m.site_id=?${photoId ? ' AND m.photo_id=?' : ''}`,
        ...(photoId ? [photoId] : []),
      )
    ).map((r) => ({
      photoId: r.photoId,
      albumId: Number(r.albumId),
      hidden: !!r.hidden,
      protected: !!r.protected,
    }))
  }
  return {
    protectedPhoto: (value: Photo) => value,
    async listPhotos(excluded = [], page) {
      if (
        page &&
        (!Number.isSafeInteger(page.limit) ||
          page.limit < 1 ||
          page.limit > 1000 ||
          !Number.isSafeInteger(page.offset) ||
          page.offset < 0)
      )
        throw new RangeError('Invalid pagination')
      return (
        await all<Record<string, unknown>>(
          `SELECT ${columns} FROM cloud_photos p WHERE p.site_id=? AND ${ready} ${excluded.length ? 'AND p.id NOT IN (SELECT value FROM json_each(?))' : ''} ORDER BY json_extract(p.metadata_json,'$.dateTaken') DESC,p.id LIMIT ? OFFSET ?`,
          ...(excluded.length ? [JSON.stringify(excluded)] : []),
          page?.limit ?? 1000,
          page?.offset ?? 0,
        )
      ).map(photo)
    },
    async listAlbums() {
      await ensureSlugs()
      return (
        await all<Record<string, unknown>>(
          albumSelect + ' ORDER BY a.position,a.created_at DESC LIMIT 100',
        )
      ).map(album)
    },
    async getAlbum(id) {
      await ensureSlugs()
      const row = (
        await all<Record<string, unknown>>(
          albumSelect + ' AND a.id=?',
          String(id),
        )
      )[0]
      return row ? album(row) : null
    },
    async listAlbumPhotoIds(id) {
      return (
        await all<{ photo_id: string }>(
          `SELECT a.photo_id FROM cloud_album_photos a JOIN cloud_photos p ON p.site_id=a.site_id AND p.id=a.photo_id WHERE a.site_id=? AND a.album_id=? AND ${ready} ORDER BY a.position,a.photo_id LIMIT 1000`,
          String(id),
        )
      ).map((r) => r.photo_id)
    },
    async listAlbumPhotos(id) {
      return (
        await all<Record<string, unknown>>(
          `SELECT ${columns} FROM cloud_photos p JOIN cloud_album_photos a ON a.site_id=p.site_id AND a.photo_id=p.id WHERE p.site_id=? AND a.album_id=? AND ${ready} ORDER BY a.position,p.id LIMIT 1000`,
          String(id),
        )
      ).map(photo)
    },
    membershipsForPhoto: memberships,
    listMemberships: () => memberships(),
  }
}

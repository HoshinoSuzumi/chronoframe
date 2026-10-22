import { and, eq } from 'drizzle-orm'
import {
  CoreError,
  assertSiteContext,
  type SiteContext,
} from '@chronoframe/core'
import { tables, type AppDatabase } from './connection.ts'

/** Fail closed when an entry supplies a missing or nonexistent Site. */
export function requireSite(db: AppDatabase, site: SiteContext) {
  assertSiteContext(site)
  if (
    !db
      .select({ id: tables.sites.id })
      .from(tables.sites)
      .where(eq(tables.sites.id, site.id))
      .get()
  )
    throw new RangeError('Site not found')
}

/** Internal ownership information is deliberately separate from browser resource DTOs. */
export function createSiteRepository(db: AppDatabase, site: SiteContext) {
  requireSite(db, site)
  return {
    async capturePhoto(id: string) {
      return db.transaction(() => {
        const photo = db
          .select()
          .from(tables.photos)
          .where(
            and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)),
          )
          .get()
        if (!photo) return null
        const version = db
          .select()
          .from(tables.resourceVersions)
          .where(
            and(
              eq(tables.resourceVersions.siteId, site.id),
              eq(tables.resourceVersions.resourceId, id),
            ),
          )
          .get()
        // Upload preparation fences older work before issuing a transport plan.
        // Its reference describes the incoming source, not the published photo;
        // cancelling that plan must not make the still-published source unusable.
        // Read from the photo's own reference and fence publication with the
        // current epoch, so later reservations/writes still invalidate this read.
        if (!version || version.deleted)
          throw new CoreError(409, 'Photo source changed; retry the operation')
        return { photo, version: version.version }
      })
    },
    async updatePhotoSnapshot(
      id: string,
      expectedVersion: number,
      update: Partial<
        Pick<
          typeof tables.photos.$inferSelect,
          | 'exif'
          | 'title'
          | 'dateTaken'
          | 'tags'
          | 'lastModified'
          | 'isLivePhoto'
          | 'livePhotoVideoKey'
          | 'livePhotoVideoUrl'
        >
      >,
    ) {
      return db.transaction(
        () => {
          const version = db
            .select()
            .from(tables.resourceVersions)
            .where(
              and(
                eq(tables.resourceVersions.siteId, site.id),
                eq(tables.resourceVersions.resourceId, id),
              ),
            )
            .get()
          if (
            !version ||
            version.deleted ||
            version.version !== expectedVersion
          )
            throw new CoreError(409, 'Photo changed; retry the operation')
          const changed = db
            .update(tables.photos)
            .set(update)
            .where(
              and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)),
            )
            .run().changes
          if (changed !== 1) throw new CoreError(404, 'Photo not found')
        },
        { behavior: 'immediate' },
      )
    },
    async photoReference(id: string) {
      return (
        db
          .select({
            storageConnectionId: tables.photos.storageConnectionId,
            storageRevision: tables.photos.storageRevision,
            sourceVersion: tables.photos.sourceVersion,
          })
          .from(tables.photos)
          .where(
            and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)),
          )
          .get() ?? null
      )
    },
    async storageVersion(connectionId: number, revision: number) {
      const row = db
        .select()
        .from(tables.storageConnectionVersions)
        .where(
          and(
            eq(tables.storageConnectionVersions.siteId, site.id),
            eq(tables.storageConnectionVersions.connectionId, connectionId),
            eq(tables.storageConnectionVersions.revision, revision),
          ),
        )
        .get()
      return row?.config ?? null
    },
    async settings(namespace: string) {
      return db
        .select()
        .from(tables.settings)
        .where(
          and(
            eq(tables.settings.siteId, site.id),
            eq(tables.settings.namespace, namespace),
          ),
        )
        .all()
    },
  }
}

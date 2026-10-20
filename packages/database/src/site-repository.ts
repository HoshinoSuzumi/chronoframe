import { and, eq } from 'drizzle-orm'
import { assertSiteContext, type SiteContext } from '@chronoframe/core'
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

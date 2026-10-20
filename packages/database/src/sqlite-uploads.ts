import { requireSite } from './site-repository.ts'
import { type SiteContext } from '@chronoframe/core'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import type { DuplicatePhoto } from '@chronoframe/core'
import type { Photo } from '@chronoframe/contracts/resources'
import { tables, type AppDatabase } from './connection.ts'

/** Project only fields used by authenticated duplicate checks. */
export function createSqliteUploadRepository(
  db: AppDatabase,
  site: SiteContext,
) {
  requireSite(db, site)
  const summary = {
    id: tables.photos.id,
    title: tables.photos.title,
    storageKey: tables.photos.storageKey,
    originalUrl: tables.photos.originalUrl,
    thumbnailUrl: tables.photos.thumbnailUrl,
    dateTaken: tables.photos.dateTaken,
  }
  return {
    async findDuplicate(id: string): Promise<DuplicatePhoto | null> {
      return (
        db
          .select(summary)
          .from(tables.photos)
          .where(
            siteAnd(
              eq(tables.photos.id, id),
              siteEq(tables.photos.siteId, site.id),
            ),
          )
          .get() || null
      )
    },
    async findDetails(
      id: string,
    ): Promise<
      (DuplicatePhoto & Pick<Photo, 'fileSize' | 'width' | 'height'>) | null
    > {
      return (
        db
          .select({
            ...summary,
            fileSize: tables.photos.fileSize,
            width: tables.photos.width,
            height: tables.photos.height,
          })
          .from(tables.photos)
          .where(
            siteAnd(
              eq(tables.photos.id, id),
              siteEq(tables.photos.siteId, site.id),
            ),
          )
          .get() || null
      )
    },
  }
}

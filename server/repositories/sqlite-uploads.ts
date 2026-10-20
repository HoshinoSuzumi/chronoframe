import { eq } from 'drizzle-orm'
import type { DuplicatePhoto } from '@chronoframe/core'
import type { Photo } from '@chronoframe/contracts/resources'
import { tables, type useDB } from '../utils/db.ts'

/** Project only fields used by authenticated duplicate checks. */
export function createSqliteUploadRepository(db: ReturnType<typeof useDB>) {
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
          .where(eq(tables.photos.id, id))
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
          .where(eq(tables.photos.id, id))
          .get() || null
      )
    },
  }
}

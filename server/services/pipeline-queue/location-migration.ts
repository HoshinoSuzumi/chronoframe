import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { useDB } from '../../utils/db'
import { photos, pipelineQueue } from '../../database/schema.ts'

export function enqueueLocationMigrationRequest(
  db: ReturnType<typeof useDB>,
  options: { priority?: number; maxAttempts?: number } = {},
) {
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: pipelineQueue.id })
      .from(pipelineQueue)
      .where(
        siteAnd(
          and(
            sql`json_extract(${pipelineQueue.payload}, '$.type') = 'location-migration'`,
            sql`${pipelineQueue.status} IN ('pending', 'in-stages')`,
          ),
          siteEq(pipelineQueue.siteId, DEFAULT_SITE.id),
        ),
      )
      .get()
    if (existing) return existing.id
    return tx
      .insert(pipelineQueue)
      .values({ ...options, payload: { type: 'location-migration' } })
      .returning({ id: pipelineQueue.id })
      .get().id
  })
}

// Only old records with stored coordinates and an existing geocoding result qualify.
// Photos with GPS alone may never have been geocoded and are not migration candidates.
export const legacyLocationCondition = and(
  isNull(photos.geocoding),
  sql`${photos.latitude} BETWEEN -90 AND 90`,
  sql`${photos.longitude} BETWEEN -180 AND 180`,
  sql`NOT (${photos.latitude} = 0 AND ${photos.longitude} = 0)`,
  or(
    sql`length(trim(coalesce(${photos.city}, ''))) > 0`,
    sql`length(trim(coalesce(${photos.country}, ''))) > 0`,
    sql`length(trim(coalesce(${photos.locationName}, ''))) > 0`,
  ),
)

export function getLocationMigrationStatus(db: ReturnType<typeof useDB>) {
  const { count } = db
    .select({ count: sql<number>`count(*)` })
    .from(photos)
    .where(
      siteAnd(legacyLocationCondition, siteEq(photos.siteId, DEFAULT_SITE.id)),
    )
    .get()!
  const active = db
    .select({ id: pipelineQueue.id })
    .from(pipelineQueue)
    .where(
      siteAnd(
        and(
          sql`${pipelineQueue.status} IN ('pending', 'in-stages')`,
          or(
            sql`json_extract(${pipelineQueue.payload}, '$.type') = 'location-migration'`,
            and(
              sql`json_extract(${pipelineQueue.payload}, '$.type') = 'photo-reverse-geocoding'`,
              sql`json_extract(${pipelineQueue.payload}, '$.migrationOnly') = 1`,
            ),
          ),
        ),
        siteEq(pipelineQueue.siteId, DEFAULT_SITE.id),
      ),
    )
    .get()
  return { count, requestActive: Boolean(active) }
}

export function enqueueLocationMigration(db: ReturnType<typeof useDB>) {
  // Synchronous transaction makes repeated confirmations (including other tabs)
  // idempotent and avoids racing the worker's pending-task claim.
  return db.transaction((tx) => {
    const candidates = tx
      .select({ id: photos.id, storageKey: photos.storageKey })
      .from(photos)
      .where(
        siteAnd(
          legacyLocationCondition,
          siteEq(photos.siteId, DEFAULT_SITE.id),
        ),
      )
      .all()
    const active = tx
      .select({ payload: pipelineQueue.payload })
      .from(pipelineQueue)
      .where(
        siteAnd(
          or(
            eq(pipelineQueue.status, 'pending'),
            eq(pipelineQueue.status, 'in-stages'),
          ),
          siteEq(pipelineQueue.siteId, DEFAULT_SITE.id),
        ),
      )
      .all()
    const busyPhotos = new Set(
      active.flatMap(({ payload }) =>
        'photoId' in payload ? [payload.photoId] : [],
      ),
    )
    const busyKeys = new Set(
      active.flatMap(({ payload }) =>
        'storageKey' in payload ? [payload.storageKey] : [],
      ),
    )
    let queued = 0
    for (const photo of candidates) {
      if (
        busyPhotos.has(photo.id) ||
        (photo.storageKey && busyKeys.has(photo.storageKey))
      )
        continue
      tx.insert(pipelineQueue)
        .values({
          priority: -1,
          payload: {
            type: 'photo-reverse-geocoding',
            photoId: photo.id,
            migrationOnly: true,
          },
        })
        .run()
      queued++
    }
    return {
      count: candidates.length,
      queued,
      alreadyQueued: candidates.length - queued,
    }
  })
}

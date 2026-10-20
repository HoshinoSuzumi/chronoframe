import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNull, lte, or } from 'drizzle-orm'
import { type SiteContext } from '@chronoframe/core'
import {
  jobPayloadSchema,
  type PipelineQueuePayload,
} from '@chronoframe/contracts/queue'
import {
  LostLeaseError,
  PermanentJobError,
  PIPELINE_VERSION,
  retryDelay,
  type JobLease,
  type JobRepository,
} from '@chronoframe/jobs'
import { tables, type AppDatabase } from './connection.ts'
import { requireSite } from './site-repository.ts'

type Reference = {
  storageConnectionId: number | null
  storageRevision: number
  storageKey?: string | null
}
/** Invalidate before external source writes; tombstones survive deletion of the photo row. */
export function reserveResource(
  db: AppDatabase,
  site: SiteContext,
  id: string,
  reference: Reference,
) {
  requireSite(db, site)
  return db.transaction(
    () => {
      const existing = db
        .select()
        .from(tables.resourceVersions)
        .where(
          and(
            eq(tables.resourceVersions.siteId, site.id),
            eq(tables.resourceVersions.resourceId, id),
          ),
        )
        .get()
      db.insert(tables.resourceVersions)
        .values({
          siteId: site.id,
          resourceId: id,
          version: (existing?.version ?? 0) + 1,
          deleted: false,
          ...reference,
        })
        .onConflictDoUpdate({
          target: [
            tables.resourceVersions.siteId,
            tables.resourceVersions.resourceId,
          ],
          set: {
            version: (existing?.version ?? 0) + 1,
            deleted: false,
            ...reference,
          },
        })
        .run()
      return (existing?.version ?? 0) + 1
    },
    { behavior: 'immediate' },
  )
}

/** SQLite lease/CAS operations are short transactions; processing and object I/O always run outside them. */
export function createSqliteJobRepository(
  db: AppDatabase,
  site: SiteContext,
  resourceId: (payload: PipelineQueuePayload) => string | null,
  uuid: () => string = randomUUID,
) {
  requireSite(db, site)
  const queue = tables.pipelineQueue,
    versions = tables.resourceVersions
  const owned = (id: number) => and(eq(queue.siteId, site.id), eq(queue.id, id))
  const currentVersion = (id: string) =>
    db
      .select()
      .from(versions)
      .where(and(eq(versions.siteId, site.id), eq(versions.resourceId, id)))
      .get()
  const activeReference = (): Reference => {
    const setting = db
      .select({ value: tables.settings.value })
      .from(tables.settings)
      .where(
        and(
          eq(tables.settings.siteId, site.id),
          eq(tables.settings.namespace, 'storage'),
          eq(tables.settings.key, 'provider'),
        ),
      )
      .get()
    const provider = setting?.value
      ? db
          .select()
          .from(tables.settings_storage_providers)
          .where(
            and(
              eq(tables.settings_storage_providers.siteId, site.id),
              eq(tables.settings_storage_providers.id, Number(setting.value)),
            ),
          )
          .get()
      : undefined
    return {
      storageConnectionId: provider?.id ?? null,
      storageRevision: provider?.revision ?? 1,
    }
  }
  const bind = (payload: PipelineQueuePayload, reference?: Reference) => {
    const id = resourceId(payload)
    if (!id)
      return {
        resourceId: null,
        sourceVersion: 1,
        ...(reference ?? activeReference()),
      }
    let version = currentVersion(id)
    if (!version) {
      const photo = db
        .select()
        .from(tables.photos)
        .where(and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)))
        .get()
      if ('photoId' in payload && !photo)
        throw new PermanentJobError('Photo not found')
      const ref =
        reference ??
        (photo
          ? {
              storageConnectionId: photo.storageConnectionId,
              storageRevision: photo.storageRevision,
              storageKey: photo.storageKey,
            }
          : activeReference())
      db.insert(versions)
        .values({
          siteId: site.id,
          resourceId: id,
          version: photo?.sourceVersion ?? 1,
          deleted: false,
          ...ref,
          storageKey:
            'storageKey' in payload ? payload.storageKey : ref.storageKey,
        })
        .onConflictDoNothing()
        .run()
      version = currentVersion(id)!
    }
    if (version.deleted) throw new PermanentJobError('Resource deleted')
    return {
      resourceId: id,
      sourceVersion: version.version,
      storageConnectionId: version.storageConnectionId,
      storageRevision: version.storageRevision,
    }
  }
  const adopt = () => {
    const candidates = db
      .select()
      .from(queue)
      .where(
        and(
          eq(queue.siteId, site.id),
          isNull(queue.resourceId),
          or(eq(queue.status, 'pending'), eq(queue.status, 'in-stages')),
        ),
      )
      .all()
    for (const job of candidates) {
      if (job.payload.type === 'location-migration') continue
      try {
        const payload = jobPayloadSchema.parse(job.payload)
        db.update(queue)
          .set({ ...bind(payload), payload })
          .where(owned(job.id))
          .run()
      } catch {
        db.update(queue)
          .set({
            status: 'failed',
            errorMessage: 'Invalid or missing job resource',
          })
          .where(owned(job.id))
          .run()
      }
    }
  }
  const sameIdentity = (job: typeof queue.$inferSelect, lease: JobLease) =>
    lease.siteId === site.id &&
    job.attemptId === lease.attemptId &&
    job.workerId === lease.workerId &&
    job.resourceId === lease.resourceId &&
    job.sourceVersion === lease.sourceVersion &&
    job.pipelineVersion === lease.pipelineVersion &&
    job.storageConnectionId === lease.storageConnectionId &&
    job.storageRevision === lease.storageRevision &&
    JSON.stringify(job.payload) === JSON.stringify(lease.payload)
  const assertCurrent = (lease: JobLease, now = new Date()) => {
    if (lease.siteId !== site.id)
      throw new LostLeaseError('Job belongs to a different Site')
    const job = db.select().from(queue).where(owned(lease.id)).get()
    if (
      !job ||
      job.status !== 'in-stages' ||
      !sameIdentity(job, lease) ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt.getTime() <= now.getTime()
    )
      throw new LostLeaseError('Job lease expired or was replaced')
    if (job.pipelineVersion !== PIPELINE_VERSION)
      throw new PermanentJobError('Unsupported pipeline version')
    if (lease.resourceId) {
      const version = currentVersion(lease.resourceId)
      if (
        !version ||
        version.deleted ||
        version.version !== lease.sourceVersion
      )
        throw new LostLeaseError('Source was replaced or deleted')
    }
    return job
  }
  const commit = <T>(
    lease: JobLease,
    operation: () => T,
    options: {
      now?: Date
      resourceUpdated?: boolean
      warningCode?: () => typeof queue.$inferSelect.warningCode
      failure?: string
    } = {},
  ) =>
    db.transaction(
      () => {
        const job = db.select().from(queue).where(owned(lease.id)).get()
        if (job?.status === 'completed' && sameIdentity(job, lease))
          return { published: false as const, result: undefined }
        assertCurrent(lease, options.now)
        if (lease.resourceId)
          db.insert(tables.jobCommitGuards)
            .values({
              siteId: site.id,
              resourceId: lease.resourceId,
              attemptId: lease.attemptId,
            })
            .run()
        const result = operation()
        if (result && typeof (result as { then?: unknown }).then === 'function')
          throw new TypeError('Job commits must be synchronous')
        if (options.resourceUpdated && lease.resourceId) {
          db.update(versions)
            .set({ version: lease.sourceVersion + 1, deleted: false })
            .where(
              and(
                eq(versions.siteId, site.id),
                eq(versions.resourceId, lease.resourceId),
              ),
            )
            .run()
          const photo = db
            .select()
            .from(tables.photos)
            .where(
              and(
                eq(tables.photos.siteId, site.id),
                eq(tables.photos.id, lease.resourceId),
              ),
            )
            .get()
          if (photo) {
            db.update(versions)
              .set({
                storageConnectionId: photo.storageConnectionId,
                storageRevision: photo.storageRevision,
                storageKey: photo.storageKey,
              })
              .where(
                and(
                  eq(versions.siteId, site.id),
                  eq(versions.resourceId, lease.resourceId),
                ),
              )
              .run()
            db.update(tables.photos)
              .set({ sourceVersion: lease.sourceVersion + 1 })
              .where(
                and(
                  eq(tables.photos.siteId, site.id),
                  eq(tables.photos.id, lease.resourceId),
                ),
              )
              .run()
          }
        }
        if (lease.resourceId)
          db.delete(tables.jobCommitGuards)
            .where(
              and(
                eq(tables.jobCommitGuards.siteId, site.id),
                eq(tables.jobCommitGuards.resourceId, lease.resourceId),
                eq(tables.jobCommitGuards.attemptId, lease.attemptId),
              ),
            )
            .run()
        db.update(queue)
          .set({
            status: options.failure ? 'failed' : 'completed',
            errorMessage: options.failure ?? null,
            completedAt: options.now ?? new Date(),
            warningCode: options.warningCode?.() ?? null,
            statusStage: null,
            leaseExpiresAt: null,
          })
          .where(owned(lease.id))
          .run()
        return { published: true as const, result }
      },
      { behavior: 'immediate' },
    )
  const repository: JobRepository = {
    async claim(workerId, now, leaseMs) {
      return db.transaction(
        () => {
          adopt()
          const expired = db
            .select()
            .from(queue)
            .where(
              and(
                eq(queue.siteId, site.id),
                eq(queue.status, 'in-stages'),
                or(
                  isNull(queue.leaseExpiresAt),
                  lte(queue.leaseExpiresAt, now),
                ),
              ),
            )
            .all()
          for (const job of expired)
            db.update(queue)
              .set({
                status: job.attempts >= job.maxAttempts ? 'failed' : 'pending',
                statusStage: null,
                attemptId: null,
                workerId: null,
                leaseExpiresAt: null,
                availableAt: now,
                errorMessage: 'Previous lease expired',
              })
              .where(owned(job.id))
              .run()
          for (;;) {
            const job = db
              .select()
              .from(queue)
              .where(
                and(
                  eq(queue.siteId, site.id),
                  eq(queue.status, 'pending'),
                  lte(queue.availableAt, now),
                ),
              )
              .orderBy(
                desc(queue.priority),
                asc(queue.createdAt),
                asc(queue.id),
              )
              .limit(1)
              .get()
            if (!job) return null
            const version = job.resourceId
              ? currentVersion(job.resourceId)
              : null
            const invalidPayload = !jobPayloadSchema.safeParse(job.payload)
              .success
            if (
              job.attempts >= job.maxAttempts ||
              job.pipelineVersion !== PIPELINE_VERSION ||
              invalidPayload ||
              (job.resourceId &&
                (!version ||
                  version.deleted ||
                  version.version !== job.sourceVersion))
            ) {
              db.update(queue)
                .set({
                  status: 'failed',
                  errorMessage: 'Job exhausted, unsupported or source changed',
                })
                .where(owned(job.id))
                .run()
              continue
            }
            const attemptId = uuid(),
              attempts = job.attempts + 1
            db.update(queue)
              .set({
                status: 'in-stages',
                attemptId,
                workerId,
                attempts,
                heartbeatAt: now,
                leaseExpiresAt: new Date(now.getTime() + leaseMs),
                errorMessage: null,
                warningCode: null,
              })
              .where(owned(job.id))
              .run()
            return { ...job, attemptId, workerId, attempts }
          }
        },
        { behavior: 'immediate' },
      )
    },
    async heartbeat(lease, now, leaseMs) {
      const completed = db.select().from(queue).where(owned(lease.id)).get()
      if (completed?.status === 'completed' && sameIdentity(completed, lease))
        return true
      try {
        assertCurrent(lease, now)
      } catch {
        return false
      }
      return (
        db
          .update(queue)
          .set({
            heartbeatAt: now,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
          })
          .where(
            and(
              owned(lease.id),
              eq(queue.attemptId, lease.attemptId),
              eq(queue.status, 'in-stages'),
            ),
          )
          .run().changes === 1
      )
    },
    async complete(lease, now) {
      const row = db.select().from(queue).where(owned(lease.id)).get()
      if (row?.status === 'completed' && sameIdentity(row, lease)) return true
      try {
        return commit(lease, () => undefined, { now }).published
      } catch (error) {
        if (error instanceof LostLeaseError) return false
        throw error
      }
    },
    async fail(lease, error, retryable, now) {
      const row = db.select().from(queue).where(owned(lease.id)).get()
      if (
        !row ||
        row.status !== 'in-stages' ||
        !sameIdentity(row, lease) ||
        !row.leaseExpiresAt ||
        row.leaseExpiresAt.getTime() <= now.getTime()
      )
        return false
      const retry = retryable && row.attempts < row.maxAttempts
      return (
        db
          .update(queue)
          .set({
            status: retry ? 'pending' : 'failed',
            errorMessage: error.slice(0, 1000),
            statusStage: null,
            warningCode: null,
            leaseExpiresAt: null,
            availableAt: retry
              ? new Date(now.getTime() + retryDelay(row.attempts))
              : row.availableAt,
          })
          .where(and(owned(lease.id), eq(queue.attemptId, lease.attemptId)))
          .run().changes === 1
      )
    },
  }
  return {
    ...repository,
    bindSourceHash(lease: JobLease, hash: string, now = new Date()) {
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new PermanentJobError('Invalid source digest')
      db.transaction(
        () => {
          const row = assertCurrent(lease, now)
          if (row.sourceHash && row.sourceHash !== hash)
            throw new PermanentJobError(
              'Source content changed since the first attempt',
            )
          if (!row.sourceHash)
            db.update(queue)
              .set({ sourceHash: hash })
              .where(and(owned(lease.id), eq(queue.attemptId, lease.attemptId)))
              .run()
        },
        { behavior: 'immediate' },
      )
    },
    commit,
    assertCurrent,
    stage(lease: JobLease, stage: typeof queue.$inferSelect.statusStage) {
      assertCurrent(lease)
      db.update(queue)
        .set({ statusStage: stage })
        .where(and(owned(lease.id), eq(queue.attemptId, lease.attemptId)))
        .run()
    },
    enqueue(
      payload: PipelineQueuePayload,
      options: { priority?: number; maxAttempts?: number } = {},
    ) {
      const validated = jobPayloadSchema.parse(payload)
      const priority = options.priority ?? 0,
        maxAttempts = options.maxAttempts ?? 3
      if (
        !Number.isSafeInteger(priority) ||
        priority < -1 ||
        priority > 9 ||
        !Number.isSafeInteger(maxAttempts) ||
        maxAttempts < 1 ||
        maxAttempts > 5
      )
        throw new RangeError('Invalid queue options')
      return db.transaction(
        () => {
          if (
            validated.type === 'photo' &&
            validated.albumId !== undefined &&
            !db
              .select({ id: tables.albums.id })
              .from(tables.albums)
              .where(
                and(
                  eq(tables.albums.siteId, site.id),
                  eq(tables.albums.id, validated.albumId),
                ),
              )
              .get()
          )
            throw new PermanentJobError('Album not found')
          return db
            .insert(queue)
            .values({
              priority,
              maxAttempts,
              payload: validated,
              siteId: site.id,
              ...bind(validated),
              pipelineVersion: PIPELINE_VERSION,
            })
            .returning({ id: queue.id })
            .get().id
        },
        { behavior: 'immediate' },
      )
    },
  }
}

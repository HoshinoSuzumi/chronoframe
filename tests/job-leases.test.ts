import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import {
  LostLeaseError,
  PermanentJobError,
  runOneJob,
  type JobLease,
} from '@chronoframe/jobs'
import {
  openDatabase,
  tables,
  createSqliteJobRepository,
  createSqlitePhotoWriteRepository,
  reserveResource,
} from '@chronoframe/database'

const migrationsFolder = 'packages/database/migrations'
const clock = new Date('2026-10-20T00:00:00Z')
const resolveId = (
  payload: typeof tables.pipelineQueue.$inferSelect.payload,
) =>
  'photoId' in payload
    ? payload.photoId
    : 'storageKey' in payload
      ? 'photo'
      : null

test('independent connections preserve live leases, recover expired attempts and fence duplicate callbacks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chronoframe-leases-'))
  const filename = join(root, 'app.sqlite3'),
    first = openDatabase({ filename, migrationsFolder }),
    second = openDatabase({ filename, migrationsFolder })
  try {
    first.db
      .insert(tables.photos)
      .values({ id: 'photo', storageKey: 'original.jpg', title: 'before' })
      .run()
    const a = createSqliteJobRepository(first.db, DEFAULT_SITE, resolveId),
      b = createSqliteJobRepository(second.db, DEFAULT_SITE, resolveId)
    const id = a.enqueue({ type: 'photo', storageKey: 'original.jpg' })
    const duplicate = a.enqueue({ type: 'photo', storageKey: 'original.jpg' })
    const old = await a.claim('first', clock, 1000)
    assert.equal(old!.id, id)
    const other = await b.claim('second', clock, 1000)
    assert.equal(other!.id, duplicate)
    assert.equal(
      await b.claim('restarted', new Date(clock.getTime() + 200), 1000),
      null,
    )
    assert.equal(
      await a.heartbeat(old!, new Date(clock.getTime() + 500), 1000),
      true,
    )
    const recovered = await b.claim(
      'second-restarted',
      new Date(clock.getTime() + 1501),
      1000,
    )
    assert.equal(recovered!.id, id)
    assert.equal(recovered!.attempts, 2)
    assert.notEqual(recovered!.attemptId, old!.attemptId)
    const now = new Date(clock.getTime() + 1600)
    assert.throws(
      () =>
        a.commit(
          old!,
          () =>
            first.db
              .update(tables.photos)
              .set({ title: 'stale' })
              .where(eq(tables.photos.id, 'photo'))
              .run(),
          { now, resourceUpdated: true },
        ),
      LostLeaseError,
    )
    const publication = b.commit(
      recovered!,
      () =>
        second.db
          .update(tables.photos)
          .set({ title: 'published' })
          .where(eq(tables.photos.id, 'photo'))
          .run(),
      { now, resourceUpdated: true },
    )
    assert.equal(publication.published, true)
    assert.equal(
      b.commit(
        recovered!,
        () => {
          throw new Error('duplicate callback ran')
        },
        { now },
      ).published,
      false,
    )
    assert.equal(await b.complete(recovered!, now), true)
    assert.equal(await a.complete(old!, now), false)
    assert.equal(
      first.db.select().from(tables.photos).get()!.title,
      'published',
    )
    assert.equal(first.db.select().from(tables.jobCommitGuards).all().length, 0)
    assert.equal(
      await b.claim('next', new Date(clock.getTime() + 3000), 1000),
      null,
    )
    assert.equal(
      first.db
        .select()
        .from(tables.pipelineQueue)
        .where(eq(tables.pipelineQueue.id, duplicate))
        .get()!.status,
      'failed',
    )
  } finally {
    first.close()
    second.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('deletion and source replacement reject late results, while a deliberate reupload can publish', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder }),
    { db } = connection
  try {
    db.insert(tables.photos)
      .values({ id: 'photo', storageKey: 'original.jpg', title: 'original' })
      .run()
    const repository = createSqliteJobRepository(db, DEFAULT_SITE, resolveId)
    repository.enqueue({ type: 'photo', storageKey: 'original.jpg' })
    const old = await repository.claim('worker', clock, 10_000)
    db.delete(tables.photos).where(eq(tables.photos.id, 'photo')).run()
    assert.throws(
      () =>
        repository.commit(
          old!,
          () =>
            db
              .insert(tables.photos)
              .values({ id: 'photo', title: 'resurrected' })
              .run(),
          { now: clock, resourceUpdated: true },
        ),
      LostLeaseError,
    )
    assert.equal(db.select().from(tables.photos).all().length, 0)
    reserveResource(db, DEFAULT_SITE, 'photo', {
      storageConnectionId: null,
      storageRevision: 1,
      storageKey: 'replacement.jpg',
    })
    repository.enqueue({ type: 'photo', storageKey: 'replacement.jpg' })
    const replacement = await repository.claim('worker-new', clock, 10_000)
    repository.commit(
      replacement!,
      () =>
        db
          .insert(tables.photos)
          .values({
            id: 'photo',
            title: 'replacement',
            storageKey: 'replacement.jpg',
          })
          .run(),
      { now: clock, resourceUpdated: true },
    )
    repository.enqueue({ type: 'photo', storageKey: 'replacement.jpg' })
    const changed = await repository.claim('worker-change', clock, 10_000)
    reserveResource(db, DEFAULT_SITE, 'photo', {
      storageConnectionId: null,
      storageRevision: 1,
      storageKey: 'newer.jpg',
    })
    assert.throws(
      () =>
        repository.commit(
          changed!,
          () =>
            db
              .update(tables.photos)
              .set({ title: 'stale source' })
              .where(eq(tables.photos.id, 'photo'))
              .run(),
          { now: clock, resourceUpdated: true },
        ),
      LostLeaseError,
    )
    assert.equal(db.select().from(tables.photos).get()!.title, 'replacement')
    assert.equal(
      await repository.fail(changed!, 'Source replaced', false, clock),
      true,
    )
  } finally {
    connection.close()
  }
})

test('business result, job completion and commit guard roll back together', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder }),
    { db } = connection
  try {
    db.insert(tables.photos).values({ id: 'photo', title: 'before' }).run()
    const repository = createSqliteJobRepository(db, DEFAULT_SITE, resolveId)
    const id = repository.enqueue({ type: 'photo', storageKey: 'original.jpg' })
    const lease = await repository.claim('worker', clock, 1000)
    assert.throws(() =>
      repository.commit(
        lease!,
        () => {
          db.update(tables.photos)
            .set({ title: 'uncommitted' })
            .where(eq(tables.photos.id, 'photo'))
            .run()
          throw new Error('injected commit failure')
        },
        { now: clock, resourceUpdated: true },
      ),
    )
    assert.equal(db.select().from(tables.photos).get()!.title, 'before')
    assert.equal(db.select().from(tables.jobCommitGuards).all().length, 0)
    assert.equal(
      db
        .select()
        .from(tables.pipelineQueue)
        .where(eq(tables.pipelineQueue.id, id))
        .get()!.status,
      'in-stages',
    )
    assert.throws(
      () =>
        repository.commit({ ...lease!, sourceVersion: 999 }, () => undefined, {
          now: clock,
        }),
      LostLeaseError,
    )
    assert.throws(
      () =>
        repository.commit(
          { ...lease!, payload: { type: 'photo', storageKey: 'forged.jpg' } },
          () => undefined,
          { now: clock },
        ),
      LostLeaseError,
    )
    assert.equal(await repository.fail(lease!, 'retry', true, clock), true)
    assert.equal(await repository.claim('retry-too-early', clock, 1000), null)
    const retry = await repository.claim(
      'retry',
      new Date(clock.getTime() + 1001),
      1000,
    )
    assert.equal(retry!.attempts, 2)
  } finally {
    connection.close()
  }
})

test('metadata and follow-up task share a transaction and payloads contain no credentials', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder }),
    { db } = connection
  try {
    db.insert(tables.photos).values({ id: 'photo', title: 'before' }).run()
    const repository = createSqlitePhotoWriteRepository(db, DEFAULT_SITE)
    const before = db.select().from(tables.photos).get()
    db.run(
      sql.raw(
        "CREATE TRIGGER injected_enqueue_failure BEFORE INSERT ON pipeline_queue BEGIN SELECT RAISE(ABORT,'injected enqueue failure'); END",
      ),
    )
    await assert.rejects(
      repository.update(
        'photo',
        { title: 'rollback' },
        { latitude: 31, longitude: 121 },
      ),
    )
    assert.deepEqual(db.select().from(tables.photos).get(), before)
    assert.equal(db.select().from(tables.pipelineQueue).all().length, 0)
    db.run(sql.raw('DROP TRIGGER injected_enqueue_failure'))
    await repository.update(
      'photo',
      { title: 'updated' },
      { latitude: 31, longitude: 121 },
    )
    assert.equal(db.select().from(tables.pipelineQueue).all().length, 1)
    const jobs = createSqliteJobRepository(db, DEFAULT_SITE, resolveId)
    assert.throws(() =>
      jobs.enqueue({
        type: 'photo',
        storageKey: 'image.jpg',
        accessKeyId: 'fixture-never-persist',
      } as never),
    )
    db.insert(tables.sites)
      .values({ id: 2, workspaceId: 1, name: 'second' })
      .run()
    const other = createSqliteJobRepository(db, { id: 2 }, resolveId)
    assert.throws(() =>
      other.enqueue({ type: 'photo-reverse-geocoding', photoId: 'photo' }),
    )
    assert.equal(await other.claim('other', clock, 1000), null)
  } finally {
    connection.close()
  }
})

test('heartbeat loss aborts cooperatively and keeps the native slot until processing settles', async () => {
  let release!: () => void,
    started = false,
    finished = false,
    failed = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const lease: JobLease = {
    id: 1,
    siteId: 1,
    resourceId: null,
    payload: { type: 'location-migration' },
    sourceVersion: 1,
    pipelineVersion: '1',
    attemptId: 'attempt',
    workerId: 'worker',
    attempts: 1,
    maxAttempts: 3,
    storageConnectionId: null,
    storageRevision: 1,
  }
  const run = runOneJob({
    site: DEFAULT_SITE,
    workerId: 'worker',
    leaseMs: 100,
    heartbeatMs: 10,
    repository: {
      claim: async () => lease,
      heartbeat: async () => false,
      complete: async () => {
        throw new Error('lost lease completed')
      },
      fail: async (_lease, _error, retryable) => {
        assert.equal(retryable, false)
        failed = true
        return true
      },
    },
    process: async (_lease, signal) => {
      started = true
      await gate
      assert.equal(signal.aborted, true)
      finished = true
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(started, true)
  assert.equal(finished, false)
  assert.equal(failed, false)
  release()
  assert.equal(await run, 'failed')
  assert.equal(finished, true)
  assert.equal(failed, true)
})

test('source digests survive retries and unknown pipelines are never executed', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder }),
    { db } = connection
  try {
    const repository = createSqliteJobRepository(db, DEFAULT_SITE, resolveId)
    repository.enqueue({ type: 'photo', storageKey: 'source.jpg' })
    const lease = await repository.claim('first', clock, 1000)
    repository.bindSourceHash(lease!, 'a'.repeat(64), clock)
    await repository.fail(lease!, 'transient', true, clock)
    const retryNow = new Date(clock.getTime() + 1001)
    const retry = await repository.claim('second', retryNow, 1000)
    assert.throws(
      () => repository.bindSourceHash(retry!, 'b'.repeat(64), retryNow),
      PermanentJobError,
    )
    assert.equal(
      db.select().from(tables.pipelineQueue).get()!.sourceHash,
      'a'.repeat(64),
    )
    await repository.fail(retry!, 'source changed', false, retryNow)
    const unsupported = repository.enqueue({
      type: 'photo',
      storageKey: 'new.jpg',
    })
    db.update(tables.pipelineQueue)
      .set({ pipelineVersion: 'future' })
      .where(eq(tables.pipelineQueue.id, unsupported))
      .run()
    assert.equal(await repository.claim('old-worker', retryNow, 1000), null)
    assert.equal(
      db
        .select()
        .from(tables.pipelineQueue)
        .where(eq(tables.pipelineQueue.id, unsupported))
        .get()!.status,
      'failed',
    )
  } finally {
    connection.close()
  }
})

test('maintenance snapshots reject stale writes and preserve published derived object keys', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder }),
    { db } = connection
  try {
    const { createSiteRepository } = await import('@chronoframe/database')
    db.insert(tables.photos)
      .values({
        id: 'photo',
        storageKey: 'original.heic',
        thumbnailKey: 'library/.generated/thumb.webp',
        originalDerivedKey: 'library/.generated/original.jpeg',
        title: 'before',
      })
      .run()
    const repository = createSiteRepository(db, DEFAULT_SITE)
    const snapshot = await repository.capturePhoto('photo')
    db.update(tables.photos)
      .set({ title: 'newer' })
      .where(eq(tables.photos.id, 'photo'))
      .run()
    await assert.rejects(
      repository.updatePhotoSnapshot('photo', snapshot!.version, {
        title: 'stale',
      }),
    )
    const fresh = await repository.capturePhoto('photo')
    await repository.updatePhotoSnapshot('photo', fresh!.version, {
      title: 'reindexed',
      exif: null,
    })
    const row = db.select().from(tables.photos).get()!
    assert.equal(row.title, 'reindexed')
    assert.equal(row.thumbnailKey, 'library/.generated/thumb.webp')
    assert.equal(row.originalDerivedKey, 'library/.generated/original.jpeg')
    assert.equal(await repository.capturePhoto('missing'), null)
  } finally {
    connection.close()
  }
})

test('temporary heartbeat failures abort processing but remain retryable', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder })
  try {
    const repository = createSqliteJobRepository(
      connection.db,
      DEFAULT_SITE,
      resolveId,
    )
    repository.enqueue({ type: 'photo', storageKey: 'source.jpg' })
    const result = await runOneJob({
      site: DEFAULT_SITE,
      workerId: 'worker',
      now: () => clock,
      heartbeatMs: 10,
      repository: {
        ...repository,
        heartbeat: async () => {
          throw new Error('SQLITE_BUSY')
        },
      },
      process: async (_lease, signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        )
        signal.throwIfAborted()
      },
    })
    assert.equal(result, 'failed')
    const row = connection.db.select().from(tables.pipelineQueue).get()!
    assert.equal(row.status, 'pending')
    assert.equal(row.errorMessage, 'SQLITE_BUSY')
    assert.equal(row.attempts, 1)
  } finally {
    connection.close()
  }
})

test('cancelled upload reservations leave the published photo editable and reindexable without reviving old jobs', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder })
  const { db } = connection
  try {
    const { createSiteRepository } = await import('@chronoframe/database')
    db.insert(tables.photos)
      .values({
        id: 'photo',
        storageKey: 'library/.generated/metadata/edited/photo.jpg',
        originalUrl: '/image/published.jpg',
        thumbnailKey: 'library/.generated/thumb.webp',
        title: 'Published',
      })
      .run()
    const jobs = createSqliteJobRepository(db, DEFAULT_SITE, resolveId)
    jobs.enqueue({ type: 'photo', storageKey: 'library/photo.jpg' })
    const oldLease = (await jobs.claim('old-worker', clock, 60000))!
    const reserved = reserveResource(db, DEFAULT_SITE, 'photo', {
      storageConnectionId: null,
      storageRevision: 1,
      storageKey: 'library/photo.jpg',
    })
    // Cancelling an uncompleted upload removes its transport session; no bytes or
    // photo row were published, and its resource epoch must not be rolled back.
    const repository = createSiteRepository(db, DEFAULT_SITE)
    const snapshot = (await repository.capturePhoto('photo'))!
    assert.equal(snapshot.version, reserved)
    assert.equal(
      snapshot.photo.storageKey,
      'library/.generated/metadata/edited/photo.jpg',
    )
    await repository.updatePhotoSnapshot('photo', snapshot.version, {
      exif: { Title: 'Reindexed' },
    })
    const writer = createSqlitePhotoWriteRepository(db, DEFAULT_SITE)
    const photo = (await writer.get('photo'))!
    await writer.update(
      'photo',
      { title: 'Edited after cancellation' },
      undefined,
      photo.mutationVersion,
    )
    const row = db.select().from(tables.photos).get()!
    assert.equal(row.title, 'Edited after cancellation')
    assert.equal(row.exif?.Title, 'Reindexed')
    assert.equal(row.thumbnailKey, 'library/.generated/thumb.webp')
    assert.equal(row.storageKey, snapshot.photo.storageKey)
    assert.ok(row.sourceVersion > reserved)
    assert.throws(
      () =>
        jobs.commit(
          oldLease,
          () => {
            throw new Error('must not publish')
          },
          { now: clock },
        ),
      LostLeaseError,
    )
  } finally {
    connection.close()
  }
})

test('maintenance snapshots still lose to newer upload reservations and publications', async () => {
  const connection = openDatabase({ filename: ':memory:', migrationsFolder })
  const { db } = connection
  try {
    const { createSiteRepository } = await import('@chronoframe/database')
    db.insert(tables.photos)
      .values({ id: 'photo', storageKey: 'published.jpg', title: 'Published' })
      .run()
    const repository = createSiteRepository(db, DEFAULT_SITE)
    reserveResource(db, DEFAULT_SITE, 'photo', {
      storageConnectionId: null,
      storageRevision: 1,
      storageKey: 'first-upload.jpg',
    })
    const snapshot = (await repository.capturePhoto('photo'))!
    const writer = createSqlitePhotoWriteRepository(db, DEFAULT_SITE)
    const mutation = (await writer.get('photo'))!
    reserveResource(db, DEFAULT_SITE, 'photo', {
      storageConnectionId: null,
      storageRevision: 1,
      storageKey: 'second-upload.jpg',
    })
    await assert.rejects(
      repository.updatePhotoSnapshot('photo', snapshot.version, {
        title: 'Stale reindex',
      }),
    )
    await assert.rejects(
      writer.update(
        'photo',
        { title: 'Stale edit' },
        undefined,
        mutation.mutationVersion,
      ),
    )
    const current = (await repository.capturePhoto('photo'))!
    const jobs = createSqliteJobRepository(db, DEFAULT_SITE, resolveId)
    jobs.enqueue({ type: 'photo', storageKey: 'second-upload.jpg' })
    const lease = (await jobs.claim('new-worker', clock, 60000))!
    jobs.commit(
      lease,
      () =>
        db
          .update(tables.photos)
          .set({ title: 'New upload', storageKey: 'second-upload.jpg' })
          .where(eq(tables.photos.id, 'photo'))
          .run(),
      { now: clock, resourceUpdated: true },
    )
    await assert.rejects(
      repository.updatePhotoSnapshot('photo', current.version, {
        title: 'Stale after publication',
      }),
    )
    const latest = (await repository.capturePhoto('photo'))!
    assert.equal(latest.photo.title, 'New upload')
    assert.equal(latest.photo.storageKey, 'second-upload.jpg')
  } finally {
    connection.close()
  }
})

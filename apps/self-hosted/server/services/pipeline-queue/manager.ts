import type { ConsolaInstance } from 'consola'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { exiftool } from 'exiftool-vendored'
import { DEFAULT_SITE, validatePhotoPublication } from '@chronoframe/core'
import {
  createSqliteJobRepository,
  createPhotoPersistenceRepository,
} from '@chronoframe/database'
import {
  runOneJob,
  LostLeaseError,
  PermanentJobError,
  type JobLease,
} from '@chronoframe/jobs'
import {
  createPhotoProcessor,
  EXIF_LOCATION_KEYS,
  stripLocationFromExif,
} from '@chronoframe/processing'
import { createExifService } from '@chronoframe/media'
import type { PipelineQueuePayload } from '@chronoframe/contracts/queue'
import { QueueWarningCode } from '@chronoframe/contracts/queue'
import {
  useDB,
  tables,
  type NewPipelineQueueItem,
  type PipelineQueueItem,
} from '../../utils/db'
import { generateSafePhotoId } from '../../utils/file-utils'
import { logger } from '../../utils/logger'
import { storageForReference } from '../../utils/object-storage'
import { getStorageManager } from '../../plugins/3.storage'
import { settingsManager } from '../settings/settingsManager'
import {
  extractLocationFromGPS,
  parseGPSCoordinates,
} from '../location/geocoding'
import { hasValidCoordinates } from '#shared/utils/location'
import {
  enqueueLocationMigration,
  enqueueLocationMigrationRequest,
} from './location-migration'
import { matchesLocationRequest, updateGeocodedPhoto } from './location-update'

type Repository = ReturnType<typeof createSqliteJobRepository>

/** Embedded scheduling adapter. Packages own leases and processing; this class assembles application capabilities. */
export class QueueManager {
  private static instances = new Map<string, QueueManager>()
  private processingInterval: ReturnType<typeof setInterval> | null = null
  private activeTask: Promise<void> | null = null
  private isProcessing = false
  private processedCount = 0
  private errorCount = 0
  private readonly startTime = new Date()
  private logger: ConsolaInstance
  private constructor(
    private workerId: string,
    serviceLogger?: ConsolaInstance,
  ) {
    this.logger = serviceLogger
      ? serviceLogger.withTag(workerId)
      : logger.dynamic(`queue-${workerId}`)
  }
  static getInstance(workerId = 'default', serviceLogger?: ConsolaInstance) {
    let worker = this.instances.get(workerId)
    if (!worker) {
      worker = new QueueManager(workerId, serviceLogger)
      this.instances.set(workerId, worker)
    }
    return worker
  }
  static getAllInstances() {
    return Array.from(this.instances.values())
  }
  getWorkerId() {
    return this.workerId
  }
  getStats() {
    const attempts = this.processedCount + this.errorCount
    return {
      workerId: this.workerId,
      isProcessing: this.isProcessing,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      successRate: attempts ? (this.processedCount / attempts) * 100 : 0,
    }
  }
  private repository() {
    const db = useDB()
    return createSqliteJobRepository(db, DEFAULT_SITE, (payload) => {
      if ('photoId' in payload) return payload.photoId
      if ('storageKey' in payload) {
        const existing = db
          .select({ id: tables.photos.id })
          .from(tables.photos)
          .where(
            and(
              eq(tables.photos.siteId, DEFAULT_SITE.id),
              eq(tables.photos.storageKey, payload.storageKey),
            ),
          )
          .get()
        return existing?.id ?? generateSafePhotoId(payload.storageKey)
      }
      return null
    })
  }
  async addTask(
    payload: PipelineQueuePayload,
    options?: Partial<NewPipelineQueueItem>,
  ) {
    if (payload.type === 'location-migration')
      return enqueueLocationMigrationRequest(useDB(), {
        priority: options?.priority,
        maxAttempts: options?.maxAttempts,
      })
    return this.repository().enqueue(payload, {
      priority: options?.priority,
      maxAttempts: options?.maxAttempts,
    })
  }
  async getTaskStatus(id: number) {
    return useDB()
      .select()
      .from(tables.pipelineQueue)
      .where(
        and(
          eq(tables.pipelineQueue.siteId, DEFAULT_SITE.id),
          eq(tables.pipelineQueue.id, id),
        ),
      )
      .get()
  }
  async getQueueStats() {
    const stats = useDB()
      .select({
        status: tables.pipelineQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(tables.pipelineQueue)
      .where(eq(tables.pipelineQueue.siteId, DEFAULT_SITE.id))
      .groupBy(tables.pipelineQueue.status)
      .all()
    return Object.fromEntries(stats.map((row) => [row.status, row.count]))
  }
  private async process(
    lease: JobLease,
    signal: AbortSignal,
    repository: Repository,
  ) {
    const db = useDB(),
      payload = lease.payload
    if (payload.type === 'location-migration') {
      repository.commit(lease, () => enqueueLocationMigration(db))
      return
    }
    const provider = await storageForReference(lease, () =>
      getStorageManager().getProvider(),
    )
    const generated = new Set<string>(),
      linked = new Set<string>()
    const namespace = `.generated/${lease.siteId}/${lease.id}/${lease.sourceVersion}/${lease.attemptId}/`
    let published = false
    const staged = new Proxy(provider, {
      get(target, property) {
        if (property === 'create')
          return async (key: string, buffer: Buffer, contentType?: string) => {
            repository.assertCurrent(lease)
            signal.throwIfAborted()
            const safe = key
              .replace(/\\/g, '/')
              .split('/')
              .filter((part) => part && part !== '.' && part !== '..')
              .join('/')
            const object = await target.create(
              namespace + safe,
              buffer,
              contentType,
            )
            generated.add(object.key)
            return object
          }
        if (property === 'delete' || property === 'createFromFile')
          return () =>
            Promise.reject(
              new Error('Processing must publish versioned objects'),
            )
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const stage = async (value: PipelineQueueItem['statusStage']) => {
      signal.throwIfAborted()
      repository.stage(lease, value)
    }
    const verifySource = async (key: string, hash: string) => {
      repository.assertCurrent(lease)
      signal.throwIfAborted()
      const fresh = await provider.get(key)
      if (!fresh || createHash('sha256').update(fresh).digest('hex') !== hash)
        throw new LostLeaseError('Source object changed during processing')
    }
    try {
      if (payload.type === 'photo') {
        if (!lease.resourceId)
          throw new PermanentJobError('Missing resource identity')
        const process = createPhotoProcessor({
          logger: this.logger,
          exif: createExifService({
            exiftool,
            tempDir: tmpdir(),
            logger: this.logger,
          }),
          parseGPS: parseGPSCoordinates,
          reverseGeocode: extractLocationFromGPS,
        })
        const erase =
          payload.eraseLocation ??
          (await settingsManager.get<boolean>(
            'privacy',
            'upload.autoEraseLocation',
          )) ??
          false
        const { photo, sourceHash } = await process({
          photoId: lease.resourceId,
          storageKey: payload.storageKey,
          eraseLocation: erase,
          storage: staged,
          sourceRead: (hash) => repository.bindSourceHash(lease, hash),
          stage,
          signal,
        })
        if (
          photo.livePhotoVideoKey &&
          !generated.has(photo.livePhotoVideoKey)
        ) {
          const base = payload.storageKey.slice(
            0,
            -path.extname(payload.storageKey).length,
          )
          if ([`${base}.MOV`, `${base}.mov`].includes(photo.livePhotoVideoKey))
            linked.add(photo.livePhotoVideoKey)
        }
        validatePhotoPublication(photo, {
          resourceId: lease.resourceId,
          sourceKey: payload.storageKey,
          generatedKeys: generated,
          linkedVideoKeys: linked,
          publicUrl: (key) => provider.getPublicUrl(key),
        })
        await verifySource(payload.storageKey, sourceHash)
        let warning: QueueWarningCode | null = null
        const publication = repository.commit(
          lease,
          () => {
            const assignment = createPhotoPersistenceRepository(
              db,
              DEFAULT_SITE,
            ).persist(
              {
                ...photo,
                siteId: lease.siteId,
                storageConnectionId: lease.storageConnectionId,
                storageRevision: lease.storageRevision,
                sourceVersion: lease.sourceVersion,
              },
              payload.albumId,
            )
            warning =
              assignment === QueueWarningCode.AlbumMissing ? assignment : null
          },
          { resourceUpdated: true, warningCode: () => warning },
        )
        published = publication.published
        return
      }
      if (payload.type === 'photo-reverse-geocoding') {
        await stage('reverse-geocoding')
        const photo = db
          .select()
          .from(tables.photos)
          .where(
            and(
              eq(tables.photos.siteId, DEFAULT_SITE.id),
              eq(tables.photos.id, payload.photoId),
            ),
          )
          .get()
        if (!photo) throw new PermanentJobError('Photo not found')
        if (
          payload.migrationOnly &&
          (photo.geocoding ||
            !hasValidCoordinates(photo.latitude, photo.longitude))
        )
          return
        if (!matchesLocationRequest(photo, payload))
          throw new PermanentJobError('Location changed')
        const parsed = photo.exif ? parseGPSCoordinates(photo.exif) : {}
        const latitude = payload.latitude ?? photo.latitude ?? parsed.latitude,
          longitude = payload.longitude ?? photo.longitude ?? parsed.longitude
        if (latitude == null || longitude == null) {
          repository.commit(
            lease,
            () => {
              db.update(tables.photos)
                .set({
                  latitude: null,
                  longitude: null,
                  country: null,
                  city: null,
                  locationName: null,
                  geocoding: null,
                })
                .where(
                  and(
                    eq(tables.photos.siteId, DEFAULT_SITE.id),
                    eq(tables.photos.id, photo.id),
                  ),
                )
                .run()
            },
            { resourceUpdated: true, failure: 'Missing coordinates' },
          )
          throw new PermanentJobError('Missing coordinates')
        }
        if (!hasValidCoordinates(latitude, longitude))
          throw new PermanentJobError('Invalid coordinates')
        const location = await extractLocationFromGPS(latitude, longitude)
        if (!location) throw new Error('Reverse geocoding unavailable')
        repository.commit(
          lease,
          () => {
            if (
              !updateGeocodedPhoto(
                db,
                photo,
                location,
                Boolean(payload.migrationOnly),
              )
            )
              throw new LostLeaseError('Location changed')
          },
          { resourceUpdated: true },
        )
        published = true
        return
      }
      if (payload.type === 'photo-erase-location') {
        await stage('location-erase')
        const photo = db
          .select()
          .from(tables.photos)
          .where(
            and(
              eq(tables.photos.siteId, DEFAULT_SITE.id),
              eq(tables.photos.id, payload.photoId),
            ),
          )
          .get()
        if (!photo?.storageKey)
          throw new PermanentJobError('Photo source not found')
        const original = await provider.get(photo.storageKey)
        if (!original) throw new PermanentJobError('Source object not found')
        const hash = createHash('sha256').update(original).digest('hex')
        const directory = await mkdtemp(path.join(tmpdir(), 'cframe-location-'))
        try {
          const file = path.join(
            directory,
            'source' + (path.extname(photo.storageKey) || '.jpg'),
          )
          await writeFile(file, original)
          const tags = Object.fromEntries(
            EXIF_LOCATION_KEYS.map((key) => [key, null]),
          )
          await exiftool.write(file, tags, ['-overwrite_original'])
          const buffer = await readFile(file)
          const object = await staged.create(
            'source' + (path.extname(photo.storageKey) || '.jpg'),
            buffer,
          )
          let derived = photo.originalDerivedKey
          if (derived) {
            const oldDerived = await provider.get(derived)
            if (!oldDerived)
              throw new PermanentJobError('Derived source not found')
            const jpeg = path.join(directory, 'derived.jpeg')
            await writeFile(jpeg, oldDerived)
            await exiftool.write(jpeg, tags, ['-overwrite_original'])
            derived = (
              await staged.create(
                'original.jpeg',
                await readFile(jpeg),
                'image/jpeg',
              )
            ).key
          }
          const exif = stripLocationFromExif(
            await createExifService({
              exiftool,
              tempDir: tmpdir(),
              logger: this.logger,
            }).extractExifData(buffer),
          )
          await verifySource(photo.storageKey, hash)
          published = repository.commit(
            lease,
            () => {
              db.update(tables.photos)
                .set({
                  storageKey: object.key,
                  originalDerivedKey: derived,
                  originalUrl: provider.getPublicUrl(derived ?? object.key),
                  exif,
                  fileSize: buffer.length,
                  lastModified: new Date().toISOString(),
                  latitude: null,
                  longitude: null,
                  country: null,
                  city: null,
                  locationName: null,
                  geocoding: null,
                })
                .where(
                  and(
                    eq(tables.photos.siteId, DEFAULT_SITE.id),
                    eq(tables.photos.id, photo.id),
                  ),
                )
                .run()
            },
            { resourceUpdated: true },
          ).published
          if (published)
            for (const key of [photo.storageKey, photo.originalDerivedKey])
              if (key && !generated.has(key))
                await provider
                  .delete(key)
                  .catch((error) =>
                    this.logger.warn(
                      'Old source cleanup failed',
                      error instanceof Error ? error.message : 'storage error',
                    ),
                  )
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
        return
      }
      if (payload.type === 'live-photo-video') {
        await stage('live-photo')
        if (!lease.resourceId)
          throw new PermanentJobError('Missing photo identity')
        const photo = db
          .select()
          .from(tables.photos)
          .where(
            and(
              eq(tables.photos.siteId, DEFAULT_SITE.id),
              eq(tables.photos.id, lease.resourceId),
            ),
          )
          .get()
        if (!photo) throw new Error('Matching photo is not ready')
        const video = await provider.get(payload.storageKey)
        if (!video) throw new PermanentJobError('Video source not found')
        await verifySource(
          payload.storageKey,
          createHash('sha256').update(video).digest('hex'),
        )
        repository.commit(
          lease,
          () => {
            db.update(tables.photos)
              .set({
                isLivePhoto: 1,
                livePhotoVideoKey: payload.storageKey,
                livePhotoVideoUrl: provider.getPublicUrl(payload.storageKey),
              })
              .where(
                and(
                  eq(tables.photos.siteId, DEFAULT_SITE.id),
                  eq(tables.photos.id, photo.id),
                ),
              )
              .run()
          },
          { resourceUpdated: true },
        )
        published = true
      }
    } finally {
      if (!published)
        for (const key of generated)
          await provider
            .delete(key)
            .catch((error) =>
              this.logger.warn(
                'Unpublished attempt cleanup failed',
                error instanceof Error ? error.message : 'storage error',
              ),
            )
    }
  }
  private async processNextTask() {
    if (this.isProcessing) return
    this.isProcessing = true
    try {
      const repository = this.repository()
      const outcome = await runOneJob({
        repository,
        workerId: this.workerId,
        site: DEFAULT_SITE,
        process: (lease, signal) => this.process(lease, signal, repository),
        onError: (error) =>
          this.logger.warn(
            error instanceof Error ? error.message : 'Queue operation failed',
          ),
      })
      if (outcome === 'completed') this.processedCount++
      if (outcome === 'failed') this.errorCount++
    } catch (error) {
      this.logger.error(
        'Queue execution failed',
        error instanceof Error ? error.message : 'unknown error',
      )
    } finally {
      this.isProcessing = false
    }
  }
  startProcessing(intervalMs = 3000) {
    if (this.processingInterval) return
    this.processingInterval = setInterval(() => this.runTask(), intervalMs)
    this.runTask()
  }
  private runTask() {
    if (this.activeTask) return
    this.activeTask = this.processNextTask().finally(() => {
      this.activeTask = null
    })
  }
  async stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
    await this.activeTask
  }
}

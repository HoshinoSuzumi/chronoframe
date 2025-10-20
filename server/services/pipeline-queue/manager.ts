import type { ConsolaInstance } from 'consola'
import path from 'path'
import { asc, desc, eq, sql } from 'drizzle-orm'
import type {
  NewPipelineQueueItem,
  PipelineQueueItem,
  Photo,
} from '~~/server/utils/db'
import { compressUint8Array } from '~~/shared/utils/u8array'
import {
  preprocessImageWithJpegUpload,
  processImageMetadataAndSharp,
} from '../image/processor'
import { generateThumbnailAndHash } from '../image/thumbnail'
import { extractExifData, extractPhotoInfo } from '../image/exif'
import {
  extractLocationFromGPS,
  parseGPSCoordinates,
} from '../location/geocoding'
import { findLivePhotoVideoForImage } from '../video/livephoto'
import { processMotionPhotoFromXmp } from '../video/motion-photo'
import { getStorageManager } from '~~/server/plugins/storage'

export class QueueManager {
  private static instances: Map<string, QueueManager> = new Map()
  private workerId: string
  private logger: ConsolaInstance
  private isProcessing: boolean = false
  private processingInterval: NodeJS.Timeout | null = null
  private processedCount: number = 0
  private errorCount: number = 0
  private startTime: Date

  static getInstance(
    workerId: string = 'default',
    logger?: ConsolaInstance,
  ): QueueManager {
    if (!QueueManager.instances.has(workerId)) {
      QueueManager.instances.set(workerId, new QueueManager(workerId, logger))
    }
    return QueueManager.instances.get(workerId)!
  }

  static getAllInstances(): QueueManager[] {
    return Array.from(QueueManager.instances.values())
  }

  private constructor(workerId: string, _logger?: ConsolaInstance) {
    this.workerId = workerId
    this.logger = _logger
      ? _logger.withTag(`${workerId}`)
      : logger.dynamic(`queue-${workerId}`)
    this.startTime = new Date()
  }

  getWorkerId(): string {
    return this.workerId
  }

  getStats() {
    const uptime = Date.now() - this.startTime.getTime()
    return {
      workerId: this.workerId,
      isProcessing: this.isProcessing,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      uptime: Math.floor(uptime / 1000), // seconds
      successRate:
        this.processedCount > 0
          ? (this.processedCount / (this.processedCount + this.errorCount)) *
            100
          : 0,
    }
  }

  /**
   * 插入新任务到队列
   * @param payload 任务负荷
   * @param options 可选的任务设置
   * @returns 新创建任务的 ID
   */
  async addTask(
    payload: any,
    options?: Partial<NewPipelineQueueItem>,
  ): Promise<number> {
    const db = useDB()
    const result = db
      .insert(tables.pipelineQueue)
      .values({
        payload,
        ...options,
      })
      .returning({ id: tables.pipelineQueue.id })
      .get()
    return result.id
  }

  /**
   * 获取任务状态
   * @param taskId 任务ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: number) {
    const db = useDB()
    const task = await db
      .select()
      .from(tables.pipelineQueue)
      .where(eq(tables.pipelineQueue.id, taskId))
      .get()
    return task
  }

  /**
   * 获取并锁定下一个待处理任务
   * @returns 下一个待处理任务
   */
  async getNextTask(): Promise<PipelineQueueItem | null> {
    const db = useDB()

    // 使用同步事务防止竞态条件
    const task = db.transaction((tx) => {
      const highestPriorityPendingTask = tx
        .select()
        .from(tables.pipelineQueue)
        .where(eq(tables.pipelineQueue.status, 'pending'))
        // 优先处理高优先级和较早创建的任务
        .orderBy(
          desc(tables.pipelineQueue.priority),
          asc(tables.pipelineQueue.createdAt),
        )
        .limit(1)
        .get()

      if (!highestPriorityPendingTask) return null

      const task = highestPriorityPendingTask
      tx.update(tables.pipelineQueue)
        .set({ status: 'in-stages' })
        .where(eq(tables.pipelineQueue.id, task.id))
        .run()

      return { ...task, status: 'in-stages' as const }
    })

    return task
  }

  /**
   * 更新任务阶段
   * @param taskId 任务ID
   * @param stage 新的任务阶段
   */
  async updateTaskStage(
    taskId: number,
    stage: PipelineQueueItem['statusStage'],
  ): Promise<void> {
    const db = useDB()
    await db
      .update(tables.pipelineQueue)
      .set({ statusStage: stage })
      .where(eq(tables.pipelineQueue.id, taskId))
  }

  /**
   * 标记任务为已完成
   * @param taskId 任务ID
   */
  async markTaskCompleted(taskId: number): Promise<void> {
    const db = useDB()
    await db
      .update(tables.pipelineQueue)
      .set({
        status: 'completed',
        completedAt: sql`(unixepoch())`,
      })
      .where(eq(tables.pipelineQueue.id, taskId))
  }

  /**
   * 标记任务为失败
   * @param taskId 任务ID
   * @param errorMessage 错误信息
   */
  async markTaskFailed(taskId: number, errorMessage?: string): Promise<void> {
    const db = useDB()
    const task = await db
      .select()
      .from(tables.pipelineQueue)
      .where(eq(tables.pipelineQueue.id, taskId))
      .get()

    if (!task) return

    const newAttempts = task.attempts + 1
    const shouldRetry = newAttempts < task.maxAttempts

    // 计算重试延迟（指数退避）
    const retryDelay = shouldRetry
      ? Math.min(1000 * Math.pow(2, newAttempts - 1), 30000)
      : 0

    await db
      .update(tables.pipelineQueue)
      .set({
        status: shouldRetry ? 'pending' : 'failed',
        attempts: newAttempts,
        errorMessage: errorMessage || 'Unknown error',
        // 如果重试，设置延迟重试时间
        ...(shouldRetry && retryDelay > 0
          ? {
              createdAt: new Date(Date.now() + retryDelay),
            }
          : {}),
      })
      .where(eq(tables.pipelineQueue.id, taskId))

    if (shouldRetry) {
      this.logger.warn(
        `Task ${taskId} failed (attempt ${newAttempts}/${task.maxAttempts}), will retry in ${retryDelay}ms: ${errorMessage}`,
      )
    } else {
      this.logger.error(
        `Task ${taskId} failed permanently after ${newAttempts} attempts: ${errorMessage}`,
      )
    }
  }

  /** 任务处理器 */
  private processors = (() => {
    return {
      photo: async (task: PipelineQueueItem) => {
        const { id: taskId, payload } = task
        if (payload.type !== 'photo') {
          throw new Error(
            `Invalid payload type for photo task: ${payload.type}`,
          )
        }
        const { storageKey } = payload
        const storageProvider = getStorageManager().getProvider()
        const photoId = generateSafePhotoId(storageKey)

        try {
          this.logger.info(`Start processing task ${taskId}: ${storageKey}`)

          let storageObject = await storageProvider.getFileMeta(storageKey)
          if (!storageObject) {
            // Fallback: try read the file directly to confirm existence (e.g., local provider)
            const maybeBuffer = await storageProvider.get(storageKey)
            if (maybeBuffer) {
              storageObject = {
                key: storageKey,
                size: maybeBuffer.length,
                lastModified: new Date(),
              }
            }
          }
          if (!storageObject) {
            throw new Error(`Storage object not found`)
          }

          // STEP 1: 预处理 - 转换 HEIC 到 JPEG 并上传
          await this.updateTaskStage(taskId, 'preprocessing')
          this.logger.info(`[${taskId}:in-stage] preprocessing`)
          const imageBuffers = await preprocessImageWithJpegUpload(storageKey)
          if (!imageBuffers) {
            throw new Error('Preprocessing failed')
          }

          // STEP 2: 元数据处理 - 使用 Sharp 处理图片元数据
          await this.updateTaskStage(taskId, 'metadata')
          this.logger.info(`[${taskId}:in-stage] metadata extraction`)
          const processedData = await processImageMetadataAndSharp(
            imageBuffers.processed,
            storageKey,
          )
          if (!processedData) {
            throw new Error('Metadata processing failed')
          }

          const { imageBuffer, metadata } = processedData

          // STEP 3: 生成缩略图
          await this.updateTaskStage(taskId, 'thumbnail')
          this.logger.info(`[${taskId}:in-stage] thumbnail generation`)
          const { thumbnailBuffer, thumbnailHash } =
            await generateThumbnailAndHash(imageBuffer, this.logger)

          // 上传缩略图到存储服务
          const thumbnailObject = await new Promise<any>((resolve, reject) => {
            setImmediate(async () => {
              try {
                const result = await storageProvider.create(
                  `thumbnails/${photoId}.webp`,
                  thumbnailBuffer,
                  'image/webp',
                )
                resolve(result)
              } catch (error) {
                reject(error)
              }
            })
          })

          // STEP 4: 提取 EXIF 数据
          await this.updateTaskStage(taskId, 'exif')
          this.logger.info(`[${taskId}:in-stage] exif extraction`)
          const exifData = await extractExifData(
            imageBuffer,
            imageBuffers.raw,
            this.logger,
          )

          // 提取照片基本信息
          const photoInfo = extractPhotoInfo(storageKey, exifData)

          // STEP 5: 地理位置反向解析
          // 这里逆编码失败不报错，宽容处理
          await this.updateTaskStage(taskId, 'reverse-geocoding')
          this.logger.info(`[${taskId}:in-stage] reverse geocoding`)

          let coordinates = null
          let locationInfo = null
          if (exifData) {
            const { latitude, longitude } = parseGPSCoordinates(exifData)
            coordinates = { latitude, longitude }
            if (latitude && longitude) {
              locationInfo = await extractLocationFromGPS(latitude, longitude)
            }
          }

          // STEP 6: Motion Photo (XMP) 支持
          await this.updateTaskStage(taskId, 'motion-photo')
          this.logger.info(`[${taskId}:in-stage] motion photo detection`)
          const motionPhotoInfo = imageBuffers.raw
            ? await processMotionPhotoFromXmp({
                photoId,
                storageKey,
                rawImageBuffer: imageBuffers.raw,
                exifData,
                storageProvider,
                logger: this.logger,
              })
            : null

          if (!imageBuffers.raw) {
            this.logger.warn(
              `[${taskId}:in-stage] motion photo detection skipped: missing raw buffer for ${storageKey}`,
            )
          }

          // STEP 7: LivePhoto 视频配对（独立 MOV 文件）
          await this.updateTaskStage(taskId, 'live-photo')
          this.logger.info(`[${taskId}:in-stage] live photo detection`)
          let livePhotoInfo = null
          if (!motionPhotoInfo?.isMotionPhoto) {
            const livePhotoVideo = await findLivePhotoVideoForImage(storageKey)
            if (livePhotoVideo) {
              livePhotoInfo = {
                isLivePhoto: 1,
                livePhotoVideoUrl: storageProvider.getPublicUrl(
                  livePhotoVideo.videoKey,
                ),
                livePhotoVideoKey: livePhotoVideo.videoKey,
              }
              this.logger.info(
                `[${taskId}:in-stage] found LivePhoto video: ${livePhotoVideo.videoKey}`,
              )
            }
          } else {
            livePhotoInfo = {
              isLivePhoto: 1,
              livePhotoVideoUrl: motionPhotoInfo.livePhotoVideoUrl || null,
              livePhotoVideoKey: motionPhotoInfo.livePhotoVideoKey || null,
            }
          }

          // 构建最终的 Photo 对象
          const result: Photo = {
            id: photoId,
            title: photoInfo.title,
            description: photoInfo.description,
            dateTaken: photoInfo.dateTaken,
            tags: photoInfo.tags,
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.width / metadata.height,
            storageKey: storageKey,
            thumbnailKey: thumbnailObject.key,
            fileSize: storageObject.size || null,
            lastModified:
              storageObject.lastModified?.toISOString() ||
              new Date().toISOString(),
            originalUrl: imageBuffers.jpegKey
              ? storageProvider.getPublicUrl(imageBuffers.jpegKey) // 使用 JPEG 版本作为 originalUrl
              : storageProvider.getPublicUrl(storageKey),
            thumbnailUrl: storageProvider.getPublicUrl(thumbnailObject.key),
            thumbnailHash: thumbnailHash
              ? compressUint8Array(thumbnailHash)
              : null,
            exif: exifData,
            // 地理位置信息
            latitude: coordinates?.latitude || null,
            longitude: coordinates?.longitude || null,
            country: locationInfo?.country || null,
            city: locationInfo?.city || null,
            locationName: locationInfo?.locationName || null,
            // LivePhoto 相关字段
            isLivePhoto:
              motionPhotoInfo?.isMotionPhoto || livePhotoInfo?.isLivePhoto
                ? 1
                : 0,
            livePhotoVideoUrl:
              motionPhotoInfo?.livePhotoVideoUrl ||
              livePhotoInfo?.livePhotoVideoUrl ||
              null,
            livePhotoVideoKey:
              motionPhotoInfo?.livePhotoVideoKey ||
              livePhotoInfo?.livePhotoVideoKey ||
              null,
          }

          const db = useDB()
          await db.insert(tables.photos).values(result).onConflictDoUpdate({
            target: tables.photos.id,
            set: result,
          })

          this.logger.success(`Task ${taskId} processed successfully`)
          return result
        } catch (error) {
          this.logger.error(`Task ${taskId} processing failed`, error)
          throw error
        }
      },
      reverseGeocoding: async (task: PipelineQueueItem) => {
        const db = useDB()
        const { id: taskId, payload } = task

        if (payload.type !== 'photo-reverse-geocoding') {
          throw new Error(
            `Invalid payload type for reverse geocoding task: ${payload.type}`,
          )
        }

        const { photoId } = payload

        try {
          await this.updateTaskStage(taskId, 'reverse-geocoding')
          this.logger.info(
            `[${taskId}:in-stage] reverse geocoding for photo ${photoId}`,
          )

          const photo = await db
            .select()
            .from(tables.photos)
            .where(eq(tables.photos.id, photoId))
            .get()

          if (!photo) {
            this.logger.warn(
              `[${taskId}:reverse-geocoding] photo ${photoId} not found`,
            )
            return
          }

          let latitude = payload.latitude ?? photo.latitude ?? undefined
          let longitude = payload.longitude ?? photo.longitude ?? undefined

          if (
            (latitude === undefined || latitude === null) ||
            (longitude === undefined || longitude === null)
          ) {
            if (photo.exif) {
              const coords = parseGPSCoordinates(photo.exif)
              if (latitude === undefined || latitude === null) {
                latitude = coords.latitude
              }
              if (longitude === undefined || longitude === null) {
                longitude = coords.longitude
              }
            }
          }

          const hasLatitude = latitude !== undefined && latitude !== null
          const hasLongitude = longitude !== undefined && longitude !== null

          if (!hasLatitude || !hasLongitude) {
            this.logger.warn(
              `[${taskId}:reverse-geocoding] missing coordinates for photo ${photoId}`,
            )
            await db
              .update(tables.photos)
              .set({
                latitude: null,
                longitude: null,
                country: null,
                city: null,
                locationName: null,
              })
              .where(eq(tables.photos.id, photoId))
            return
          }

          const locationInfo = await extractLocationFromGPS(
            latitude!,
            longitude!,
          )

          await db
            .update(tables.photos)
            .set({
              latitude: latitude!,
              longitude: longitude!,
              country: locationInfo?.country ?? null,
              city: locationInfo?.city ?? null,
              locationName: locationInfo?.locationName ?? null,
            })
            .where(eq(tables.photos.id, photoId))

          this.logger.success(
            `[${taskId}:reverse-geocoding] updated location for photo ${photoId}`,
          )
        } catch (error) {
          this.logger.error(
            `[${taskId}:reverse-geocoding] failed for photo ${photoId}`,
            error,
          )
          throw error
        }
      },
      livePhotoDetect: async (task: PipelineQueueItem) => {
        const db = useDB()
        const storageProvider = getStorageManager().getProvider()

        const { id: taskId, payload } = task
        if (payload.type !== 'live-photo-video') {
          throw new Error(
            `Invalid payload type for live-photo task: ${payload.type}`,
          )
        }
        const { storageKey: videoKey } = payload

        try {
          this.logger.info(
            `Start processing LivePhoto detection task ${taskId}: ${videoKey}`,
          )

          let storageObject = await storageProvider.getFileMeta(videoKey)
          if (!storageObject) {
            const maybeBuffer = await storageProvider.get(videoKey)
            if (maybeBuffer) {
              storageObject = {
                key: videoKey,
                size: maybeBuffer.length,
                lastModified: new Date(),
              }
            }
          }
          if (!storageObject) {
            throw new Error(`Storage object not found`)
          }

          // 寻找是否有同名的照片文件
          const videoDir = path.dirname(videoKey)
          const videoBaseName = path.basename(videoKey, path.extname(videoKey))

          const possiblePhotoKeys = [
            path.join(videoDir, `${videoBaseName}.HEIC`).replace(/\\/g, '/'),
            path.join(videoDir, `${videoBaseName}.heic`).replace(/\\/g, '/'),
            path.join(videoDir, `${videoBaseName}.JPG`).replace(/\\/g, '/'),
            path.join(videoDir, `${videoBaseName}.jpg`).replace(/\\/g, '/'),
            path.join(videoDir, `${videoBaseName}.JPEG`).replace(/\\/g, '/'),
            path.join(videoDir, `${videoBaseName}.jpeg`).replace(/\\/g, '/'),
          ]

          let matchedPhoto: Photo | null = null
          for (const photoKey of possiblePhotoKeys) {
            const photos = await db
              .select()
              .from(tables.photos)
              .where(eq(tables.photos.storageKey, photoKey))
              .limit(1)

            if (photos.length > 0) {
              matchedPhoto = photos[0]
              this.logger.info(
                `Found matching photo for LivePhoto video: ${photoKey}`,
              )
              break
            }
          }

          if (!matchedPhoto) {
            this.logger.warn(
              `No matching photo found for LivePhoto video: ${videoKey}`,
            )
            throw new Error(
              `No matching photo found for LivePhoto video: ${videoKey}`,
            )
          }

          const livePhotoVideoUrl = storageProvider.getPublicUrl(videoKey)
          await db
            .update(tables.photos)
            .set({
              isLivePhoto: 1,
              livePhotoVideoUrl,
              livePhotoVideoKey: videoKey,
            })
            .where(eq(tables.photos.id, matchedPhoto.id))

          this.logger.success(
            `LivePhoto detection task ${taskId} processed successfully, updated photo ${matchedPhoto.id}`,
          )
        } catch (error) {
          this.logger.error(
            `LivePhoto detection task ${taskId} processing failed`,
            error,
          )
          throw error
        }
      },
    }
  })()

  /**
   * 处理下一个待处理任务
   */
  private async processNextTask(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Task is already processing, skipping this poll')
      return
    }

    this.isProcessing = true

    try {
      const task = await this.getNextTask()
      if (!task) {
        this.logger.debug('No tasks to process at the moment')
        return
      }

      try {
        const { type } = task.payload

        switch (type) {
          case 'live-photo-video':
            await this.processors.livePhotoDetect(task)
            break
          case 'photo':
            await this.processors.photo(task)
            break
          case 'photo-reverse-geocoding':
            await this.processors.reverseGeocoding(task)
            break
          default:
            throw new Error(`Unknown task type: ${type}`)
        }

        await this.markTaskCompleted(task.id)
        this.processedCount++
        this.logger.success(
          `[${this.workerId}] Task ${task.id} processed successfully (Total: ${this.processedCount})`,
        )

        // const result = await this.processTask(task)
        // if (result) {
        //   await this.markTaskCompleted(task.id)
        //   this.processedCount++
        //   this.logger.success(
        //     `[${this.workerId}] Task ${task.id} processed successfully (Total: ${this.processedCount})`,
        //   )
        // } else {
        //   await this.markTaskFailed(task.id, 'Processing result is empty')
        //   this.errorCount++
        // }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        await this.markTaskFailed(task.id, errorMessage)
        this.errorCount++
        this.logger.error(
          `[${this.workerId}] Task ${task.id} processing failed (Error: ${this.errorCount}):`,
          errorMessage,
        )
      }
    } catch (error) {
      this.logger.error('Error occurred while fetching the next task:', error)
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * 开始处理队列
   * @param intervalMs 轮询间隔
   */
  startProcessing(intervalMs: number = 3000): void {
    if (this.processingInterval) return

    this.processingInterval = setInterval(() => {
      this.processNextTask().catch((error) => {
        this.logger.error('Error occurred while processing the queue:', error)
      })
    }, intervalMs)

    this.logger.success(
      `Queue processing started with interval: ${intervalMs}ms`,
    )

    this.processNextTask().catch((error) => {
      this.logger.error('Error occurred while processing the queue:', error)
    })
  }

  /**
   * 停止处理队列
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
      this.logger.warn('Queue processing stopped')
    }
  }

  /**
   * 获取队列统计信息
   * @returns 队列统计信息
   */
  async getQueueStats() {
    const db = useDB()
    const stats = await db
      .select({
        status: tables.pipelineQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(tables.pipelineQueue)
      .groupBy(tables.pipelineQueue.status)

    return stats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat.count
        return acc
      },
      {} as Record<string, number>,
    )
  }
}

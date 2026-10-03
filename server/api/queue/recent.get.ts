import { desc, inArray, or } from 'drizzle-orm'
import { photos, pipelineQueue } from '~~/server/database/schema'
import type { PipelineQueueItem } from '~~/server/utils/db'

const RECENT_TASK_LIMIT = 5

function getFileName(storageKey: string | null | undefined) {
  if (!storageKey) return null
  return storageKey.split(/[\\/]/).pop() || null
}

function getTaskPhotoRef(payload: PipelineQueueItem['payload']) {
  if (payload.type === 'photo' || payload.type === 'live-photo-video') {
    return {
      photoId: null as string | null,
      storageKey: payload.storageKey || null,
    }
  }

  if (
    payload.type === 'photo-reverse-geocoding' ||
    payload.type === 'photo-erase-location'
  ) {
    return {
      photoId: payload.photoId || null,
      storageKey: null as string | null,
    }
  }

  return { photoId: null, storageKey: null }
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDB()

  const recentTasks = await db
    .select({
      id: pipelineQueue.id,
      payload: pipelineQueue.payload,
      status: pipelineQueue.status,
      statusStage: pipelineQueue.statusStage,
      errorMessage: pipelineQueue.errorMessage,
      createdAt: pipelineQueue.createdAt,
      completedAt: pipelineQueue.completedAt,
    })
    .from(pipelineQueue)
    .orderBy(desc(pipelineQueue.createdAt))
    .limit(RECENT_TASK_LIMIT)
    .all()

  const photoIds = new Set<string>()
  const storageKeys = new Set<string>()

  for (const task of recentTasks) {
    const ref = getTaskPhotoRef(task.payload)
    if (ref.photoId) photoIds.add(ref.photoId)
    if (ref.storageKey) storageKeys.add(ref.storageKey)
  }

  const photoIdList = [...photoIds]
  const storageKeyList = [...storageKeys]
  const photoFilters = [
    ...(photoIdList.length > 0 ? [inArray(photos.id, photoIdList)] : []),
    ...(storageKeyList.length > 0
      ? [inArray(photos.storageKey, storageKeyList)]
      : []),
  ]

  const relatedPhotos =
    photoFilters.length > 0
      ? await db
          .select({
            id: photos.id,
            title: photos.title,
            thumbnailUrl: photos.thumbnailUrl,
            thumbnailHash: photos.thumbnailHash,
            originalUrl: photos.originalUrl,
            storageKey: photos.storageKey,
          })
          .from(photos)
          .where(or(...photoFilters))
          .all()
      : []

  const photosById = new Map(relatedPhotos.map((photo) => [photo.id, photo]))
  const photosByStorageKey = new Map(
    relatedPhotos
      .filter((photo) => photo.storageKey)
      .map((photo) => [photo.storageKey!, photo]),
  )

  const tasks = recentTasks.map((task) => {
    const ref = getTaskPhotoRef(task.payload)
    const photo =
      (ref.photoId && photosById.get(ref.photoId)) ||
      (ref.storageKey && photosByStorageKey.get(ref.storageKey)) ||
      null

    const storageKey =
      photo?.storageKey ||
      ('storageKey' in task.payload ? task.payload.storageKey : null) ||
      null

    return {
      id: task.id,
      type: task.payload.type,
      status: task.status,
      statusStage: task.statusStage,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      fileName: getFileName(storageKey),
      photo: photo
        ? {
            id: photo.id,
            title: photo.title,
            thumbnailUrl: photo.thumbnailUrl,
            thumbnailHash: photo.thumbnailHash,
            originalUrl: photo.originalUrl,
          }
        : null,
    }
  })

  return {
    tasks,
    timestamp: new Date().toISOString(),
  }
})

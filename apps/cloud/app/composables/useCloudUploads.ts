import { useUpload } from '#console/composables/useUpload'
import { useUploadQueue } from '#console/composables/useUploadQueue'
import type { UploadingFile } from '@chronoframe/gallery/shared/types/uploading-file'
import {
  UploadQueueStatus,
  UploadTransportStatus,
} from '@chronoframe/gallery/shared/utils/upload-status'
import type { InjectionKey } from 'vue'

export interface CloudUploadContext {
  siteId: number
  scope: string
  userId: number
  name: string
  admin: boolean
}
export interface CloudUploadJob {
  id: string
  photo_id: string
  file_name?: string
  state: string
  attempts: number
  error_code: string | null
}
interface TrackedUpload {
  context: CloudUploadContext
  jobId: string
  job?: CloudUploadJob
}
interface CloudUploadPlan {
  state: string
  mode?: 'single' | 'multipart'
  url?: string
  contentType?: string
  videoUrl?: string | null
  partBytes?: number
  parts?: { partNumber: number; bytes: number }[]
  urls?: string[]
}

export function cloudUploadResumeKey(
  context: Pick<CloudUploadContext, 'siteId' | 'scope'>,
  file: File,
  albumIds: number[],
  connection: string,
) {
  return (
    [
      'chronoframe-upload',
      context.scope,
      context.siteId,
      file.name,
      file.size,
      file.lastModified,
      connection,
    ].join(':') + (albumIds.length ? ':albums:' + albumIds.join(',') : '')
  )
}

function createCloudUploads() {
  const queue = useUploadQueue()
  const { t } = useI18n()
  const nuxtApp = useNuxtApp()
  const userId = useState<number | null>('platform-user-id', () => null)
  const tracked = new Map<string, TrackedUpload>()
  const activeReservations = new Set<string>()
  const revision = ref(0)
  const busy = ref(false)
  const dismissed = new Set<string>()
  let timer: ReturnType<typeof setInterval> | undefined
  let polling = false
  let disposed = false

  async function api<T>(
    context: CloudUploadContext,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Navigation changes the active Site, not the authority of an admitted upload.
    if (disposed || userId.value !== context.userId)
      throw new Error(t('dashboard.photos.errors.uploadUnauthorized'))
    const result = await $fetch<unknown>(
      `/api/sites/${context.siteId}/media${path}`,
      {
        method: body ? 'POST' : 'GET',
        ...(body ? { body } : {}),
        ...(signal ? { signal } : {}),
      },
    )
    if (disposed || userId.value !== context.userId)
      throw new Error(t('dashboard.photos.errors.uploadUnauthorized'))
    return result as T
  }

  function updateJob(entry: UploadingFile, job: CloudUploadJob) {
    const previous = entry.status
    entry.status =
      job.state === 'succeeded'
        ? UploadQueueStatus.Completed
        : ['failed', 'cancelled'].includes(job.state)
          ? UploadQueueStatus.Error
          : UploadQueueStatus.Processing
    entry.error = job.error_code
      ? t('cloud.ui.processingFailure', { code: job.error_code })
      : entry.status === UploadQueueStatus.Error
        ? t('cloud.ui.' + job.state)
        : undefined
    entry.warning = undefined
    if (previous !== entry.status) revision.value++
  }

  function trackJobs(
    context: CloudUploadContext,
    jobs: CloudUploadJob[],
    options: { partial?: boolean } = {},
  ) {
    if (disposed || userId.value !== context.userId) return
    const present = new Set(jobs.map((job) => job.id))
    for (const [fileId, item] of tracked) {
      if (
        !options.partial &&
        item.context.scope === context.scope &&
        item.job &&
        item.job.state !== 'succeeded' &&
        !present.has(item.jobId)
      )
        remove(fileId)
    }
    for (const job of jobs) {
      const key = `${context.scope}:${job.id}`
      const existing = [...tracked].filter(
        ([, item]) =>
          item.context.scope === context.scope && item.jobId === job.id,
      )
      if (existing.length) {
        for (const [fileId, item] of existing) {
          item.job = job
          const entry = queue.uploadingFiles.value.get(fileId)
          if (
            entry &&
            (entry.status === UploadQueueStatus.Processing ||
              entry.status === UploadQueueStatus.Completed ||
              entry.status === UploadQueueStatus.Error)
          )
            updateJob(entry, job)
        }
      } else if (
        ['queued', 'running', 'retry_wait', 'failed'].includes(job.state) &&
        !dismissed.has(key)
      ) {
        const fileId = crypto.randomUUID()
        const name = job.file_name || t('cloud.messages.untitledPhotograph')
        const entry: UploadingFile = {
          fileId,
          fileName: name,
          file: new File([], name),
          status: UploadQueueStatus.Processing,
          progress: 100,
          canAbort: false,
        }
        updateJob(entry, job)
        queue.uploadingFiles.value.set(fileId, entry)
        tracked.set(fileId, { context, jobId: job.id, job })
      }
    }
    queue.notify()
  }

  async function send(
    context: CloudUploadContext,
    entry: UploadingFile,
    signal: AbortSignal,
    connection: string,
    albumIds: number[],
    liveVideo?: File,
  ) {
    const file = entry.file
    const cache = cloudUploadResumeKey(context, file, albumIds, connection)
    if (activeReservations.has(cache)) {
      entry.status = UploadQueueStatus.Blocked
      entry.error = t('cloud.transfer.alreadyQueued')
      queue.notify()
      return
    }
    const id = localStorage.getItem(cache) || crypto.randomUUID()
    dismissed.delete(`${context.scope}:${id}`)
    activeReservations.add(cache)
    let reserved = false
    let cancellation: Promise<unknown> | undefined
    let manager: ReturnType<typeof useUpload> | undefined
    const abort = () => manager?.abortUpload()
    signal.addEventListener('abort', abort)
    tracked.set(entry.fileId, { context, jobId: id })
    const cancelSession = async () => {
      localStorage.removeItem(cache)
      if (reserved) {
        cancellation ??= api(context, `/uploads/${id}/cancel`, {})
        await cancellation
      }
    }
    entry.status = UploadQueueStatus.Preparing
    queue.notify()
    try {
      signal.throwIfAborted()
      // Stored before the request so an aborted reservation is reused by requestId.
      localStorage.setItem(cache, id)
      await api(
        context,
        '/uploads',
        {
          requestId: id,
          connectionId: connection,
          fileName: file.name,
          bytes: file.size,
          albumIds,
          ...(liveVideo
            ? { liveVideo: { fileName: liveVideo.name, bytes: liveVideo.size } }
            : {}),
        },
        signal,
      )
      reserved = true
      signal.throwIfAborted()
      const plan = await api<CloudUploadPlan>(
        context,
        `/uploads/${id}/plan`,
        {},
        signal,
      )
      signal.throwIfAborted()
      if (plan.state !== 'completed') {
        if (plan.state !== 'pending' || !plan.mode) {
          localStorage.removeItem(cache)
          throw new Error(t('cloud.messages.uploadUnavailable'))
        }
        const total = file.size + (liveVideo?.size ?? 0)
        let offset = 0
        const transfer = async (payload: File, video: boolean) => {
          signal.throwIfAborted()
          manager = await nuxtApp.runWithContext(() =>
            useUpload({
              contentType: video ? 'video/quicktime' : plan.contentType,
              multipart: {
                uploadedParts: plan.parts,
                verifyPartsOnServer: true,
                preserveOnError: true,
                abort: cancelSession,
              },
            }),
          )
          signal.throwIfAborted()
          entry.canAbort = true
          entry.status = UploadQueueStatus.Uploading
          queue.notify()
          const target = video
            ? { mode: 'single' as const, url: plan.videoUrl! }
            : plan.mode === 'multipart'
              ? {
                  mode: 'multipart' as const,
                  url: `/api/sites/${context.siteId}/media/uploads/${id}/complete`,
                  partSize: plan.partBytes!,
                  partUrls: plan.urls!,
                }
              : { mode: 'single' as const, url: plan.url! }
          if (
            !target.url ||
            (target.mode === 'multipart' &&
              (!target.partSize || !target.partUrls?.length))
          )
            throw new Error(t('cloud.messages.uploadUnavailable'))
          await manager.uploadFile(payload, target, {
            onProgress: (progress) => {
              const loaded = offset + progress.loaded
              const percentage = Math.min(
                99,
                Math.floor((loaded / total) * 100),
              )
              entry.progress = percentage
              entry.uploadProgress = {
                ...progress,
                loaded,
                total,
                percentage,
                speedText: progress.speed
                  ? `${formatBytes(progress.speed)}/s`
                  : '',
                timeRemainingText:
                  progress.timeRemaining !== undefined
                    ? manager!.formatTime(progress.timeRemaining)
                    : '',
              }
              queue.notify()
            },
            onStatusChange: (status) => {
              if (!video && status === UploadTransportStatus.Finalizing)
                entry.status = UploadQueueStatus.Finalizing
              queue.notify()
            },
          })
          offset += payload.size
        }
        // Complete publishes both objects atomically; the companion must exist first.
        if (liveVideo) await transfer(liveVideo, true)
        await transfer(file, false)
        signal.throwIfAborted()
        entry.status = UploadQueueStatus.Finalizing
        entry.canAbort = false
        queue.notify()
        // No abort signal: the server may already have published, so cancelling here would mislabel it.
        if (plan.mode === 'single')
          await api(context, `/uploads/${id}/complete`, {})
      }
      localStorage.removeItem(cache)
      if (signal.aborted) return
      entry.status = UploadQueueStatus.Processing
      entry.progress = 100
      entry.canAbort = false
      tracked.set(entry.fileId, { context, jobId: id })
      revision.value++
    } catch (error) {
      entry.status = UploadQueueStatus.Error
      entry.canAbort = false
      const albumUnavailable =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        (error.data as { data?: { code?: string } } | undefined)?.data?.code ===
          'upload_albums_unavailable'
      entry.error = signal.aborted
        ? t('cloud.messages.uploadCancelled')
        : albumUnavailable
          ? t('cloud.transfer.albumsUnavailable')
          : error instanceof Error
            ? error.message
            : t('cloud.messages.uploadFailed')
      if (!signal.aborted && reserved)
        entry.warning = t(
          'cloud.messages.uploadInterruptedSelectTheSameFileToResumeIts',
        )
      const status = error as { statusCode?: number; status?: number } | null
      const code = status?.statusCode ?? status?.status
      if (
        !reserved &&
        !signal.aborted &&
        typeof code === 'number' &&
        code >= 400 &&
        code < 500
      )
        localStorage.removeItem(cache)
      if (signal.aborted) {
        if (reserved) {
          // A stalled cancel request must not hold a queue slot.
          let deadline: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              cancelSession(),
              new Promise<void>((resolve) => {
                deadline = setTimeout(resolve, 10000)
              }),
            ])
          } catch (cancelError) {
            console.error('Failed to cancel Cloud upload:', cancelError)
          } finally {
            clearTimeout(deadline)
          }
        }
      }
    } finally {
      activeReservations.delete(cache)
      signal.removeEventListener('abort', abort)
      queue.notify()
    }
  }

  function enqueue(
    context: CloudUploadContext,
    files: File[],
    connection: string,
    albumIds: number[],
  ) {
    if (disposed || userId.value !== context.userId)
      throw new Error(t('dashboard.photos.errors.uploadUnauthorized'))
    const photos = files.filter(
      (file) => !file.name.toLowerCase().endsWith('.mov'),
    )
    return queue.enqueue(photos, (entry, signal) =>
      send(
        context,
        entry,
        signal,
        connection,
        albumIds,
        files.find(
          (file) =>
            file.name.toLowerCase().endsWith('.mov') &&
            file.name.replace(/\.[^.]+$/, '').toLowerCase() ===
              entry.file.name.replace(/\.[^.]+$/, '').toLowerCase(),
        ),
      ),
    )
  }
  function remove(fileId: string) {
    const item = tracked.get(fileId)
    if (item) dismissed.add(`${item.context.scope}:${item.jobId}`)
    tracked.delete(fileId)
    queue.remove(fileId)
  }
  function clearCompleted() {
    const before = [...queue.uploadingFiles.value.keys()]
    queue.clearCompleted()
    for (const id of before) if (!queue.uploadingFiles.value.has(id)) remove(id)
  }
  function clearAll() {
    for (const id of queue.uploadingFiles.value.keys()) remove(id)
  }
  onMounted(() => {
    timer = setInterval(async () => {
      if (polling || disposed || document.visibilityState !== 'visible') return
      polling = true
      try {
        const contexts = new Map<string, CloudUploadContext>()
        for (const [fileId, item] of tracked)
          if (
            queue.uploadingFiles.value.get(fileId)?.status ===
            UploadQueueStatus.Processing
          )
            contexts.set(item.context.scope, item.context)
        await Promise.all(
          [...contexts.values()].map(async (context) => {
            try {
              const result = await api<{ jobs: CloudUploadJob[] }>(
                context,
                '/photos',
              )
              trackJobs(context, result.jobs)
            } catch (error) {
              console.error('Failed to refresh Cloud upload processing:', error)
              for (const [fileId, item] of tracked) {
                const entry = queue.uploadingFiles.value.get(fileId)
                if (entry && item.context.scope === context.scope)
                  entry.warning = t(
                    'dashboard.photos.messages.taskStatusCheckFailed',
                  )
              }
              queue.notify()
            }
          }),
        )
      } finally {
        polling = false
      }
    }, 5000)
  })
  watch(
    userId,
    () => {
      clearAll()
      dismissed.clear()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    disposed = true
    if (timer) clearInterval(timer)
    clearAll()
  })
  return {
    ...queue,
    enqueue,
    remove,
    clearCompleted,
    clearAll,
    trackJobs,
    tracked,
    revision,
    busy,
    api,
  }
}

const cloudUploadsKey: InjectionKey<ReturnType<typeof createCloudUploads>> =
  Symbol('cloud-uploads')
export function provideCloudUploads() {
  const uploads = createCloudUploads()
  provide(cloudUploadsKey, uploads)
  return uploads
}
export function useCloudUploads() {
  const uploads = inject(cloudUploadsKey)
  if (!uploads) throw new Error('Cloud upload provider missing')
  return uploads
}

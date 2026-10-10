import { UPLOAD_CHUNK_SIZE } from '~~/shared/utils/upload'
import type { UploadPlan, UploadPart } from '~~/shared/types/upload'

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
  speed?: number // bytes per second
  timeRemaining?: number // seconds
}

export interface UploadStatus {
  status: 'idle' | 'uploading' | 'finalizing' | 'success' | 'error' | 'aborted'
  progress: UploadProgress
  error?: string
  startTime?: number
  endTime?: number
}

export interface UploadCallbacks {
  onProgress?: (progress: UploadProgress) => void
  onStatusChange?: (status: UploadStatus['status']) => void
  onSuccess?: (response: XMLHttpRequest) => void
  onError?: (error: string, xhr: XMLHttpRequest) => void
  onAbort?: () => void
  onRetry?: (attempt: number, maxAttempts: number) => void
}

export interface UseUploadOptions {
  timeout?: number // 超时时间（毫秒）
  finalizeTimeout?: number
  chunkConcurrency?: number // 每个文件同时上传的分片数量（1–6）
  withCredentials?: boolean
  headers?: Record<string, string>
  speedSampleSize?: number // 速度平均窗口（秒）
  maxRetries?: number // 最大重试次数
  retryDelay?: number // 重试延迟（毫秒）
}

export function useUpload(options: UseUploadOptions = {}) {
  // useUpload() is invoked from within an async upload handler (outside the
  // synchronous setup context), so useI18n() would throw "Must be called at
  // the top of a `setup` function". Use the Nuxt-global i18n instead, which is
  // safe to access outside setup (see useExifLocalization).
  const { $i18n } = useNuxtApp()
  const t = $i18n.t
  const {
    timeout = 60_000,
    finalizeTimeout = 10 * 60_000,
    chunkConcurrency = 3,
    withCredentials = false,
    headers = {},
    speedSampleSize = 5,
    maxRetries = 3,
    retryDelay = 1000,
  } = options

  // 响应式状态
  const uploadStatus = ref<UploadStatus>({
    status: 'idle',
    progress: {
      loaded: 0,
      total: 0,
      percentage: 0,
    },
  })

  // 当前的 XMLHttpRequest 实例
  let currentXHR: XMLHttpRequest | null = null
  const activeXHRs = new Set<XMLHttpRequest>()
  const retryWaits = new Map<ReturnType<typeof setTimeout>, () => void>()
  const stopRequests = () => {
    for (const xhr of activeXHRs) xhr.abort()
    for (const [timer, resolve] of retryWaits) {
      clearTimeout(timer)
      resolve()
    }
    retryWaits.clear()
  }

  // 用于计算速度的数据点
  const speedSamples: Array<{
    timestamp: number
    loaded: number
    useful: number
  }> = []
  let transferred = 0

  // 计算上传速度和剩余时间
  const calculateSpeed = (
    loaded: number,
  ): { speed: number; timeRemaining?: number } => {
    const now = performance.now()
    const previous = speedSamples.at(-1)
    if (!previous || now - previous.timestamp >= 200) {
      speedSamples.push({ timestamp: now, loaded: transferred, useful: loaded })
    }

    // Use a time window so short pauses between parts do not erase the estimate.
    const windowStart = now - Math.max(1, speedSampleSize) * 1000
    while (
      speedSamples.length > 2 &&
      speedSamples[1]!.timestamp <= windowStart
    ) {
      speedSamples.shift()
    }

    if (speedSamples.length < 2) {
      return { speed: 0 }
    }

    // 计算平均速度
    const firstSample = speedSamples[0]
    const lastSample = speedSamples[speedSamples.length - 1]

    if (!firstSample || !lastSample) {
      return { speed: 0 }
    }

    const timeDiff = (lastSample.timestamp - firstSample.timestamp) / 1000 // 转换为秒
    const bytesDiff = lastSample.loaded - firstSample.loaded

    const speed = timeDiff > 0 ? Math.max(0, bytesDiff / timeDiff) : 0

    // 计算剩余时间
    const total = uploadStatus.value.progress.total
    const remaining = total - loaded
    // Retransmitted bytes consume bandwidth but do not reduce the remaining
    // file size. Estimate from useful progress rather than wire throughput.
    const usefulSpeed =
      timeDiff > 0
        ? Math.max(0, (lastSample.useful - firstSample.useful) / timeDiff)
        : 0
    const timeRemaining =
      usefulSpeed > 0 && remaining > 0 ? remaining / usefulSpeed : undefined

    return { speed, timeRemaining }
  }

  // 更新状态
  const updateStatus = (updates: Partial<UploadStatus>) => {
    uploadStatus.value = { ...uploadStatus.value, ...updates }
  }

  // 更新进度
  const updateProgress = (loaded: number, total: number) => {
    loaded = Math.min(
      total,
      Math.max(uploadStatus.value.progress.loaded, loaded),
    )
    const percentage =
      total > 0
        ? Math.min(
            uploadStatus.value.status === 'uploading' ? 99 : 100,
            Math.floor((loaded / total) * 100),
          )
        : 0
    const finalizing = uploadStatus.value.status === 'finalizing'
    const metrics = calculateSpeed(loaded)

    const progress: UploadProgress = {
      loaded,
      total,
      percentage,
      speed: finalizing ? 0 : metrics.speed,
      timeRemaining: finalizing ? undefined : metrics.timeRemaining,
    }

    updateStatus({ progress })
  }

  // 重置状态
  const resetStatus = () => {
    speedSamples.length = 0
    transferred = 0
    updateStatus({
      status: 'idle',
      progress: {
        loaded: 0,
        total: 0,
        percentage: 0,
      },
      error: undefined,
      startTime: undefined,
      endTime: undefined,
    })
  }

  let cancelled = false
  let active = false

  const uploadFile = async (
    file: File,
    target: string | UploadPlan,
    callbacks: UploadCallbacks = {},
  ): Promise<XMLHttpRequest> => {
    if (active) throw new Error('An upload is already active')
    resetStatus()
    cancelled = false
    active = true
    updateStatus({ status: 'uploading', startTime: Date.now() })
    callbacks.onStatusChange?.('uploading')
    const plan: UploadPlan =
      typeof target === 'string'
        ? {
            mode: target.startsWith('/api/photos/chunks/')
              ? 'chunks'
              : 'single',
            url: target,
          }
        : target
    const signedUrl = plan.url
    const chunked = plan.mode !== 'single'
    const managedSession = plan.mode === 'chunks' || plan.mode === 'multipart'
    let stopped = false
    let failureXHR: XMLHttpRequest | null = null
    let loadedTotal = 0
    const partProgress = new Map<number, number>()
    const recordProgress = (index: number, loaded: number) => {
      const previous = partProgress.get(index) ?? 0
      const next = Math.max(previous, loaded)
      partProgress.set(index, next)
      loadedTotal += next - previous
      if (
        loadedTotal >= file.size &&
        uploadStatus.value.status === 'uploading'
      ) {
        updateStatus({ status: 'finalizing' })
        callbacks.onStatusChange?.('finalizing')
      }
      updateProgress(loadedTotal, file.size)
    }
    updateProgress(0, file.size)
    callbacks.onProgress?.(uploadStatus.value.progress)
    // Update even when the connection stalls, so stale speed/ETA do not linger.
    const progressTimer = setInterval(() => {
      updateProgress(uploadStatus.value.progress.loaded, file.size)
      callbacks.onProgress?.(uploadStatus.value.progress)
    }, 250)
    const request = async (
      method: string,
      url: string,
      body?: Blob,
      partIndex = 0,
      requestHeaders: Record<string, string> = {},
      filePayload = true,
    ): Promise<XMLHttpRequest> => {
      for (let attempt = 1; ; attempt++) {
        if (cancelled || stopped)
          throw new Error(t('upload.runtimeError.aborted'))
        let xhr: XMLHttpRequest | undefined
        try {
          return await new Promise<XMLHttpRequest>((resolve, reject) => {
            const requestXHR = new XMLHttpRequest()
            xhr = requestXHR
            let sent = 0
            currentXHR = requestXHR
            activeXHRs.add(requestXHR)
            requestXHR.open(method, url)
            requestXHR.timeout =
              !filePayload || plan.mode === 'single' ? finalizeTimeout : timeout
            requestXHR.withCredentials = withCredentials
            if (body)
              requestXHR.setRequestHeader(
                'Content-Type',
                filePayload
                  ? file.type || 'application/octet-stream'
                  : 'application/json',
              )
            Object.entries({ ...headers, ...requestHeaders }).forEach(
              ([key, value]) => requestXHR.setRequestHeader(key, value),
            )
            requestXHR.upload.addEventListener('progress', (event) => {
              if (event.lengthComputable && filePayload) {
                const loaded = Math.min(body?.size ?? 0, event.loaded)
                transferred += Math.max(0, loaded - sent)
                sent = Math.max(sent, loaded)
                recordProgress(partIndex, loaded)
              }
            })
            requestXHR.addEventListener('load', () => {
              if (requestXHR.status >= 200 && requestXHR.status < 300) {
                if (filePayload) {
                  transferred += Math.max(0, (body?.size ?? 0) - sent)
                  if (body) recordProgress(partIndex, body.size)
                }
                resolve(requestXHR)
              } else
                reject(
                  new Error(
                    t('upload.runtimeError.httpError', {
                      status: requestXHR.status,
                    }),
                  ),
                )
            })
            requestXHR.addEventListener('error', () =>
              reject(new Error(t('upload.runtimeError.networkFailed'))),
            )
            requestXHR.addEventListener('timeout', () =>
              reject(
                new Error(
                  t('upload.runtimeError.timeout', {
                    timeout: requestXHR.timeout,
                  }),
                ),
              ),
            )
            requestXHR.addEventListener('abort', () =>
              reject(new Error(t('upload.runtimeError.aborted'))),
            )
            requestXHR.send(body)
          })
        } catch (error) {
          const status = xhr?.status ?? 0
          if (
            cancelled ||
            stopped ||
            attempt >= Math.max(1, maxRetries) ||
            (status > 0 && status < 500 && status !== 429)
          ) {
            failureXHR = xhr ?? null
            throw error
          }
          callbacks.onRetry?.(attempt, maxRetries)
          if (cancelled || stopped) throw error
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              retryWaits.delete(timer)
              resolve()
            }, retryDelay * attempt)
            retryWaits.set(timer, resolve)
          })
        } finally {
          if (xhr) activeXHRs.delete(xhr)
        }
      }
    }
    try {
      let response: XMLHttpRequest
      if (plan.mode === 'range') {
        if (!Number.isSafeInteger(plan.partSize) || plan.partSize <= 0)
          throw new Error('Invalid range upload plan')
        let lastResponse: XMLHttpRequest | undefined
        for (
          let index = 0, offset = 0;
          offset < file.size;
          index++, offset += plan.partSize
        ) {
          const end = Math.min(offset + plan.partSize, file.size)
          lastResponse = await request(
            plan.method || 'PUT',
            plan.url,
            file.slice(offset, end),
            index,
            {
              ...plan.headers,
              'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
            },
          )
        }
        if (!lastResponse) throw new Error('Empty upload')
        response = lastResponse
      } else if (chunked) {
        const partSize =
          plan.mode === 'multipart' ? plan.partSize : UPLOAD_CHUNK_SIZE
        const count = Math.ceil(file.size / partSize)
        if (
          plan.mode === 'multipart' &&
          (partSize <= 0 || plan.partUrls.length !== count)
        )
          throw new Error('Invalid multipart upload plan')
        const parts: UploadPart[] = []
        const concurrency = Number.isFinite(chunkConcurrency)
          ? Math.max(1, Math.min(6, Math.floor(chunkConcurrency)))
          : 3
        let nextIndex = 0
        let failure: unknown
        const worker = async () => {
          try {
            while (!cancelled && !stopped && nextIndex < count) {
              const index = nextIndex++
              const offset = index * partSize
              const partResponse = await request(
                'PUT',
                plan.mode === 'multipart'
                  ? plan.partUrls[index]!
                  : `${signedUrl}?index=${index}`,
                file.slice(offset, offset + partSize),
                index,
              )
              if (plan.mode === 'multipart') {
                const etag = partResponse.getResponseHeader('ETag')
                if (!etag) throw new Error(t('upload.runtimeError.missingEtag'))
                parts[index] = { partNumber: index + 1, etag }
              }
            }
          } catch (error) {
            if (!stopped) {
              failure = error
              stopped = true
              stopRequests()
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(count, concurrency) }, worker),
        )
        if (failure) throw failure
        if (cancelled) throw new Error(t('upload.runtimeError.aborted'))
        updateStatus({ status: 'finalizing' })
        updateProgress(file.size, file.size)
        callbacks.onProgress?.(uploadStatus.value.progress)
        callbacks.onStatusChange?.('finalizing')
        response = await request(
          'POST',
          signedUrl,
          plan.mode === 'multipart'
            ? new Blob([JSON.stringify({ parts })], {
                type: 'application/json',
              })
            : undefined,
          0,
          {},
          false,
        )
      } else {
        response = await request(
          plan.mode === 'single' ? plan.method || 'PUT' : 'PUT',
          signedUrl,
          file,
          0,
          plan.mode === 'single' ? plan.headers : {},
        )
      }
      if (cancelled) throw new Error(t('upload.runtimeError.aborted'))
      updateStatus({ status: 'success', endTime: Date.now() })
      updateProgress(file.size, file.size)
      callbacks.onProgress?.(uploadStatus.value.progress)
      callbacks.onStatusChange?.('success')
      callbacks.onSuccess?.(response)
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = cancelled ? 'aborted' : 'error'
      updateStatus({ status, error: message, endTime: Date.now() })
      callbacks.onStatusChange?.(status)
      if (cancelled) callbacks.onAbort?.()
      else if (failureXHR || currentXHR)
        callbacks.onError?.(message, (failureXHR || currentXHR)!)
      if (managedSession)
        void $fetch(signedUrl, { method: 'DELETE' }).catch(() => {})
      throw error
    } finally {
      clearInterval(progressTimer)
      stopRequests()
      active = false
      currentXHR = null
    }
  }

  const abortUpload = () => {
    if (!active) return
    cancelled = true
    stopRequests()
  }
  // 格式化字节大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0)
      return t('upload.progress.calculating')

    const rounded = Math.ceil(seconds)
    const hours = Math.floor(rounded / 3600)
    const minutes = Math.floor((rounded % 3600) / 60)
    const secs = rounded % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    } else if (minutes > 0) {
      return `${minutes}:${secs.toString().padStart(2, '0')}`
    } else {
      return t('upload.progress.seconds', { seconds: secs })
    }
  }

  // 计算属性
  const isUploading = computed(() =>
    ['uploading', 'finalizing'].includes(uploadStatus.value.status),
  )
  const isIdle = computed(() => uploadStatus.value.status === 'idle')
  const isSuccess = computed(() => uploadStatus.value.status === 'success')
  const isError = computed(() => uploadStatus.value.status === 'error')
  const isAborted = computed(() => uploadStatus.value.status === 'aborted')
  const canAbort = computed(() => isUploading.value && currentXHR !== null)

  // 格式化的进度信息
  const formattedProgress = computed(() => {
    const { loaded, total, percentage, speed, timeRemaining } =
      uploadStatus.value.progress
    return {
      percentage,
      loadedText: formatBytes(loaded),
      totalText: formatBytes(total),
      speedText: speed ? `${formatBytes(speed)}/s` : '',
      timeRemainingText:
        timeRemaining !== undefined ? formatTime(timeRemaining) : '',
      progressText: `${formatBytes(loaded)} / ${formatBytes(total)} (${percentage}%)`,
    }
  })

  // 清理函数（仅在组件上下文中可用）
  try {
    onUnmounted(() => {
      abortUpload()
      currentXHR = null
    })
  } catch {
    /* empty */
  }

  return {
    uploadStatus: readonly(uploadStatus),

    isUploading,
    isIdle,
    isSuccess,
    isError,
    isAborted,
    canAbort,
    formattedProgress,

    uploadFile,
    abortUpload,
    resetStatus,
    formatBytes,
    formatTime,
  }
}

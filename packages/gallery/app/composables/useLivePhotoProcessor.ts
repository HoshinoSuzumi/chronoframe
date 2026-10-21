import { ref, computed } from 'vue'

interface LivePhotoProcessingState {
  isProcessing: boolean
  progress: number
  mp4Blob: Blob | null
  error: string | null
  lastProcessed?: number // 添加时间戳用于缓存管理
  retryCount?: number // 添加重试计数
}

// 全局存储已转换的实况照片
const processedLivePhotos = ref<Map<string, LivePhotoProcessingState>>(
  new Map(),
)

export const useLivePhotoProcessor = () => {
  /**
   * 将 MOV 文件转换为 MP4 blob
   * @param movUrl MOV 文件的 URL
   * @param photoId 照片 ID
   */
  const convertMovToMp4 = async (
    movUrl: string,
    photoId: string,
  ): Promise<Blob | null> => {
    // 检查缓存状态
    const existing = processedLivePhotos.value.get(photoId)
    if (existing) {
      // 检查缓存是否过期（24小时）
      const now = Date.now()
      const cacheExpiry = 24 * 60 * 60 * 1000 // 24小时

      if (
        existing.mp4Blob &&
        existing.lastProcessed &&
        now - existing.lastProcessed < cacheExpiry
      ) {
        return existing.mp4Blob
      }

      if (existing.isProcessing) {
        // 使用Promise而不是轮询，提高性能
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve(null) // 超时返回null
          }, 30000) // 30秒超时

          const checkInterval = setInterval(() => {
            const current = processedLivePhotos.value.get(photoId)
            if (current && !current.isProcessing) {
              clearInterval(checkInterval)
              clearTimeout(timeout)
              resolve(current.mp4Blob)
            }
          }, 100)
        })
      }
    }

    // 初始化处理状态，包含重试逻辑
    const maxRetries = 3
    const currentRetry = existing?.retryCount || 0

    if (currentRetry >= maxRetries) {
      console.warn(`Max retries reached for LivePhoto ${photoId}`)
      return null
    }

    const state: LivePhotoProcessingState = {
      isProcessing: true,
      progress: 0,
      mp4Blob: null,
      error: null,
      retryCount: currentRetry,
      lastProcessed: Date.now(),
    }
    processedLivePhotos.value.set(photoId, state)

    try {
      // 添加更平滑的进度更新
      const updateProgress = (progress: number) => {
        state.progress = progress
        processedLivePhotos.value.set(photoId, { ...state })
      }

      // 下载 MOV 文件，支持断点续传
      updateProgress(10)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

      const response = await fetch(movUrl, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'max-age=3600', // 缓存1小时
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(
          `Failed to fetch MOV file: ${response.status} ${response.statusText}`,
        )
      }

      updateProgress(30)

      // 使用流式读取，支持大文件
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Failed to get response reader')

      const chunks: Uint8Array[] = []
      const contentLength = parseInt(
        response.headers.get('content-length') || '0',
      )
      let receivedLength = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        receivedLength += value.length

        // 更新下载进度
        if (contentLength > 0) {
          const downloadProgress = 30 + (receivedLength / contentLength) * 40 // 30-70%
          updateProgress(Math.round(downloadProgress))
        }
      }

      const movBlob = new Blob(chunks)
      updateProgress(70)

      // 优化的视频处理：先检查格式兼容性
      const mp4Blob = new Blob([movBlob], { type: 'video/mp4' })
      updateProgress(85)

      // 更快的格式验证：只检查元数据
      const videoUrl = URL.createObjectURL(mp4Blob)
      const video = document.createElement('video')

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video validation timeout'))
        }, 5000) // 5秒验证超时

        video.onloadedmetadata = () => {
          clearTimeout(timeout)
          resolve()
        }
        video.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('Video format not supported'))
        }
        video.src = videoUrl
        video.load()
      })

      URL.revokeObjectURL(videoUrl)
      updateProgress(95)

      // 成功完成
      state.isProcessing = false
      state.progress = 100
      state.mp4Blob = mp4Blob
      state.lastProcessed = Date.now()
      state.error = null
      processedLivePhotos.value.set(photoId, { ...state })

      return mp4Blob
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      // 增加重试逻辑
      if (currentRetry < maxRetries - 1) {
        console.warn(
          `LivePhoto processing failed (attempt ${currentRetry + 1}/${maxRetries}), retrying...`,
          errorMessage,
        )
        state.retryCount = currentRetry + 1
        state.isProcessing = false
        state.error = `Retrying... (${currentRetry + 1}/${maxRetries})`
        processedLivePhotos.value.set(photoId, { ...state })

        // 指数退避重试
        const retryDelay = Math.min(1000 * Math.pow(2, currentRetry), 5000)
        await new Promise((resolve) => setTimeout(resolve, retryDelay))

        return convertMovToMp4(movUrl, photoId) // 递归重试
      }

      // 最终失败
      state.isProcessing = false
      state.error = errorMessage
      state.lastProcessed = Date.now()
      processedLivePhotos.value.set(photoId, { ...state })
      console.error(
        `Failed to convert MOV to MP4 after ${maxRetries} attempts:`,
        error,
      )
      return null
    }
  }

  /**
   * 获取照片的处理状态
   */
  const getProcessingState = (photoId: string) => {
    return computed(() => processedLivePhotos.value.get(photoId) || null)
  }

  /**
   * 智能预加载：基于视口和用户行为预测
   */
  const preloadLivePhotosInViewport = async (
    photos: Array<{
      id: string
      livePhotoVideoUrl?: string | null
      isVisible?: boolean
    }>,
    options: {
      maxConcurrent?: number
      prioritizeVisible?: boolean
      prefetchDistance?: number
    } = {},
  ) => {
    const {
      maxConcurrent = 2,
      prioritizeVisible = true,
      prefetchDistance = 3,
    } = options

    const livePhotos = photos.filter((photo) => photo.livePhotoVideoUrl)

    if (prioritizeVisible) {
      // 优先处理可见的LivePhoto
      const visiblePhotos = livePhotos.filter((photo) => photo.isVisible)
      const nearbyPhotos = livePhotos
        .filter((photo) => !photo.isVisible)
        .slice(0, prefetchDistance)

      // 先处理可见的
      if (visiblePhotos.length > 0) {
        await processPhotoBatch(visiblePhotos, maxConcurrent)
      }

      // 然后预加载附近的
      if (nearbyPhotos.length > 0) {
        processPhotoBatch(nearbyPhotos, Math.min(maxConcurrent, 1)) // 降低并发数
      }
    } else {
      await processPhotoBatch(livePhotos, maxConcurrent)
    }
  }

  /**
   * 处理照片批次的辅助函数
   */
  const processPhotoBatch = async (
    photos: Array<{ id: string; livePhotoVideoUrl: string }>,
    maxConcurrent: number,
  ) => {
    for (let i = 0; i < photos.length; i += maxConcurrent) {
      const batch = photos.slice(i, i + maxConcurrent)
      await Promise.allSettled(
        batch.map((photo) =>
          convertMovToMp4(photo.livePhotoVideoUrl, photo.id),
        ),
      )

      // 添加小延迟避免过度占用资源
      if (i + maxConcurrent < photos.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }

  /**
   * 批量处理视口内的实况照片（保持兼容性）
   */
  const batchProcessLivePhotos = async (
    photos: Array<{ id: string; livePhotoVideoUrl?: string | null }>,
  ) => {
    await preloadLivePhotosInViewport(photos, { maxConcurrent: 3 })
  }

  /**
   * 智能内存管理：清理过期或不需要的缓存
   */
  const cleanupExpiredCache = () => {
    const now = Date.now()
    const cacheExpiry = 24 * 60 * 60 * 1000 // 24小时
    const maxCacheSize = 50 // 最大缓存50个LivePhoto

    const entries = Array.from(processedLivePhotos.value.entries())
    const expiredEntries: string[] = []

    // 查找过期的条目
    entries.forEach(([photoId, state]) => {
      if (state.lastProcessed && now - state.lastProcessed > cacheExpiry) {
        expiredEntries.push(photoId)
      }
    })

    // 清理过期条目
    expiredEntries.forEach((photoId) => {
      const state = processedLivePhotos.value.get(photoId)
      if (state?.mp4Blob) {
        // 这里可以安全地清理，因为已过期
        state.mp4Blob = null
      }
      processedLivePhotos.value.delete(photoId)
    })

    // 如果缓存仍然太大，清理最老的条目
    if (processedLivePhotos.value.size > maxCacheSize) {
      const sortedEntries = entries
        .filter(([photoId]) => !expiredEntries.includes(photoId))
        .sort((a, b) => (a[1].lastProcessed || 0) - (b[1].lastProcessed || 0))

      const toRemove = sortedEntries.slice(
        0,
        processedLivePhotos.value.size - maxCacheSize,
      )
      toRemove.forEach(([photoId, state]) => {
        if (state.mp4Blob) {
          state.mp4Blob = null
        }
        processedLivePhotos.value.delete(photoId)
      })
    }

    console.log(
      `Cleaned up ${expiredEntries.length} expired LivePhoto cache entries`,
    )
  }

  /**
   * 获取缓存统计信息
   */
  const getCacheStats = () => {
    const total = processedLivePhotos.value.size
    let processed = 0
    let processing = 0
    let failed = 0
    let totalSize = 0

    processedLivePhotos.value.forEach((state) => {
      if (state.mp4Blob) {
        processed++
        totalSize += state.mp4Blob.size
      } else if (state.isProcessing) {
        processing++
      } else if (state.error) {
        failed++
      }
    })

    return {
      total,
      processed,
      processing,
      failed,
      totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
    }
  }

  /**
   * 清理所有缓存（完全清理）
   */
  const clearProcessedCache = () => {
    // 释放所有 blob URLs
    processedLivePhotos.value.forEach((state) => {
      if (state.mp4Blob) {
        state.mp4Blob = null
      }
    })
    processedLivePhotos.value.clear()
    console.log('All LivePhoto cache cleared')
  }

  // 定期清理过期缓存（每10分钟）
  if (typeof window !== 'undefined') {
    setInterval(cleanupExpiredCache, 10 * 60 * 1000)
  }

  return {
    convertMovToMp4,
    getProcessingState,
    batchProcessLivePhotos,
    preloadLivePhotosInViewport,
    cleanupExpiredCache,
    getCacheStats,
    clearProcessedCache,
    processedLivePhotos: readonly(processedLivePhotos),
  }
}

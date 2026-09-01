import { fileTypeFromBlob } from 'file-type'
import { LRUCache } from './lru'

export interface ImageLoaderState {
  isVisible: boolean
  isHeic?: boolean
  progress?: number
  bytesLoaded?: number
  bytesTotal?: number
  isConverting?: boolean
  message?: string
  codec?: string
}

export interface ImageLoaderCallbacks {
  onProgress?: (progress: number) => void
  onError?: () => void
  onUpdateLoadingState?: (state: Partial<ImageLoaderState>) => void
}

export interface ImageLoaderResult {
  blobSrc: string
  resultUrl?: string
}

export interface ImageLoaderCacheResult {
  blobSrc: string
  originalSize: number
  format: string
}

const normalImageCache: LRUCache<string, ImageLoaderCacheResult> = new LRUCache<
  string,
  ImageLoaderCacheResult
>(6, (v, k, reason) => {
  try {
    URL.revokeObjectURL(v.blobSrc)
    console.log(`已释放 Blob URL - ${k} (${reason})`)
  } catch (err) {
    console.warn(`Blob URL 释放失败 (${k}):`, err)
  }
})

export class ImageLoaderManager {
  private lastXHR: XMLHttpRequest | null = null
  private timer: NodeJS.Timeout | null = null

  private async isValidImageBlob(blob: Blob): Promise<boolean> {
    if (blob.size === 0) return false

    try {
      const fileType = await fileTypeFromBlob(blob)

      if (!fileType) return false
      if (!fileType.mime.startsWith('image/')) return false

      return true
    } catch {
      return false
    }
  }

  async loadImage(
    src: string,
    callbacks: ImageLoaderCallbacks = {},
  ): Promise<ImageLoaderResult> {
    const { onProgress, onError, onUpdateLoadingState } = callbacks

    onUpdateLoadingState?.({
      isVisible: true,
    })

    return new Promise((resolve, reject) => {
      this.timer = setTimeout(async () => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', src)
        xhr.responseType = 'blob'

        xhr.onload = async () => {
          if (xhr.status === 200) {
            try {
              const blob = xhr.response as Blob
              if (!(await this.isValidImageBlob(blob))) {
                onError?.()
                onUpdateLoadingState?.({
                  isVisible: false,
                })
                return
              }

              const processResult = await this.processNormalImage(
                blob,
                src,
                callbacks,
              )
              resolve(processResult)
            } catch (err) {
              onError?.()
              onUpdateLoadingState?.({
                isVisible: false,
              })
              reject(err)
            }
          } else {
            onError?.()
            onUpdateLoadingState?.({
              isVisible: false,
            })
            reject(new Error(`Failed to load image: ${xhr.status}`))
          }
        }

        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100
            onProgress?.(progress)
            onUpdateLoadingState?.({
              progress,
              bytesLoaded: event.loaded,
              bytesTotal: event.total,
            })
          }
        }

        xhr.onerror = () => {
          onError?.()
          onUpdateLoadingState?.({
            isVisible: false,
          })
          reject(new Error(`Failed to load image`))
        }

        xhr.send()

        this.lastXHR = xhr
      }, 300)
    })
  }

  async processNormalImage(
    blob: Blob,
    originalUrl: string,
    callbacks: ImageLoaderCallbacks,
  ) {
    const { onUpdateLoadingState } = callbacks
    const cacheKey = originalUrl
    const cacheResult = normalImageCache.get(cacheKey)
    if (cacheResult) {
      onUpdateLoadingState?.({
        isVisible: false,
      })
      return {
        blobSrc: cacheResult.blobSrc,
      }
    }
    const url = URL.createObjectURL(blob)
    const result: ImageLoaderCacheResult = {
      blobSrc: url,
      originalSize: blob.size,
      format: blob.type,
    }
    normalImageCache.set(cacheKey, result)
    onUpdateLoadingState?.({
      isVisible: false,
    })
    return {
      blobSrc: url,
    }
  }

  cleanup() {
    if (this.lastXHR) {
      this.lastXHR.abort()
      this.lastXHR = null
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

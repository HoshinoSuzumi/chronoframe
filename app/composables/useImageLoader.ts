import type { LoadingIndicatorRef } from '~/components/photo/LoadingIndicator.vue'
import { ImageLoaderManager } from '~/libs/image-loader-manager'

export const useImageLoader = (
  src: string,
  isCurrentImage: boolean,
  highResLoaded: boolean,
  error: boolean,
  loadingIndicatorRef?: LoadingIndicatorRef | null,
  onProgress?: (progress: number) => void,
  onError?: () => void,
  updateBlobSrc?: (blobSrc: string | null) => void,
  updateHighResLoaded?: (highResLoaded: boolean) => void,
  updateError?: (error: boolean) => void,
  updateHighResImageRendered?: (isRendered: boolean) => void,
  onImageLoaded?: () => void,
) => {
  if (highResLoaded || !isCurrentImage || error) return null

  const loaderManager = new ImageLoaderManager()

  const cleanup = () => {
    loaderManager.cleanup()
    updateBlobSrc?.(null)
    updateHighResImageRendered?.(false)
    updateHighResLoaded?.(false)
    updateError?.(false)
  }

  const loadImage = async () => {
    try {
      const loadResult = await loaderManager.loadImage(src, {
        onProgress,
        onError,
        onUpdateLoadingState: (state) => {
          loadingIndicatorRef?.updateLoadingState(state)
        },
      })

      updateBlobSrc?.(loadResult.blobSrc)
      updateHighResLoaded?.(true)
      onImageLoaded?.() // 通知图片加载完成
    } catch {
      updateError?.(true)
      loadingIndicatorRef?.updateLoadingState({
        isVisible: true,
        isError: true,
        message: '载入图片失败',
      })
    }
  }

  cleanup()
  loadImage()

  return loaderManager
}

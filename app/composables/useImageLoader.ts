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
  shouldApply: () => boolean = () => true,
) => {
  // useImageLoader() is invoked from loadImage(), which also runs inside watch
  // callbacks (outside the synchronous setup context) — useI18n() would throw
  // "Must be called at the top of a `setup` function". Use the Nuxt-global
  // i18n instead, which is safe to access outside setup.
  const { $i18n } = useNuxtApp()
  const t = $i18n.t
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
        onProgress: (progress) => {
          if (shouldApply()) onProgress?.(progress)
        },
        onError: () => {
          if (shouldApply()) onError?.()
        },
        onUpdateLoadingState: (state) => {
          if (!shouldApply()) return
          loadingIndicatorRef?.updateLoadingState(state)
        },
      })

      if (!shouldApply()) return
      updateBlobSrc?.(loadResult.blobSrc)
      updateHighResLoaded?.(true)
      onImageLoaded?.() // 通知图片加载完成
    } catch {
      if (!shouldApply()) return
      updateError?.(true)
      loadingIndicatorRef?.updateLoadingState({
        isVisible: true,
        isError: true,
        message: t('viewer.photoload.loadError'),
      })
    }
  }

  cleanup()
  loadImage()

  return loaderManager
}

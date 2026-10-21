import type { LoadingIndicatorRef } from '#gallery/components/photo/LoadingIndicator.vue'
import { LoadingState } from '@chronoframe/webgl-image'

export const useWebGLWorkState = (
  loadingIndicatorRef: LoadingIndicatorRef | null,
) => {
  const { t } = useI18n()

  return (
    isLoading: boolean,
    state?: LoadingState,
    quality?: 'high' | 'medium' | 'low' | 'unknown',
  ) => {
    let message = ''

    if (state === LoadingState.TEXTURE_LOADING) {
      message = t('viewer.photoload.loadingTexture')
    } else if (state === LoadingState.IMAGE_LOADING) {
      message = t('viewer.photoload.loading')
    }

    loadingIndicatorRef?.updateLoadingState({
      isVisible: isLoading,
      isWebGLLoading: isLoading,
      webglMessage: message,
      webglQuality: quality,
    })
  }
}

export interface TransitionData {
  sourceRect: DOMRect
  targetRect?: DOMRect
  photoId: string
  imageUrl: string
  thumbnailHash?: string
}

export const useViewerState = defineStore('photo-viewer-state', () => {
  const currentPhotoIndex = ref(0)
  const isViewerOpen = ref(false)
  
  // 动画相关状态
  const isTransitioning = ref(false)
  const transitionData = ref<TransitionData | null>(null)
  const transitionElement = ref<HTMLElement | null>(null)

  const openViewer = (index: number) => {
    currentPhotoIndex.value = index
    isViewerOpen.value = true
  }

  const switchToIndex = (index: number) => {
    currentPhotoIndex.value = index
  }

  const closeViewer = () => {
    isViewerOpen.value = false
    
    // 清理转场元素
    if (transitionElement.value) {
      try {
        if (transitionElement.value.parentNode) {
          transitionElement.value.parentNode.removeChild(transitionElement.value)
        }
      } catch (error) {
        console.warn('Failed to cleanup transition element on close:', error)
      }
    }
    
    // 清理动画状态
    isTransitioning.value = false
    transitionData.value = null
    transitionElement.value = null
  }

  // 开始转场动画
  const startTransition = (data: TransitionData, index: number) => {
    transitionData.value = data
    isTransitioning.value = true
    currentPhotoIndex.value = index
  }

  // 完成转场动画
  const completeTransition = () => {
    isTransitioning.value = false
    transitionData.value = null
    transitionElement.value = null
    isViewerOpen.value = true
  }

  return {
    currentPhotoIndex,
    isViewerOpen,
    isTransitioning,
    transitionData,
    transitionElement,
    openViewer,
    switchToIndex,
    closeViewer,
    startTransition,
    completeTransition,
  }
})

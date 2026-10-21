import type { Photo } from '@chronoframe/contracts/resources'
import type { Ref } from 'vue'

/** Compose viewer navigation without owning the entry photo query or authentication. */
export function useGalleryViewer(photos: Ref<Photo[]>) {
  const router = useRouter()
  const route = useRoute()
  const { switchToIndex, closeViewer, clearReturnRoute } = useViewerState()
  const {
    currentPhotoIndex,
    isViewerOpen,
    returnRoute,
    isDirectAccess,
    scopedPhotos,
  } = storeToRefs(useViewerState())

  // The photo collection the viewer actually navigates: the scoped list (e.g. an
  // album) when present, otherwise the global list.
  const viewerPhotos = computed(() => scopedPhotos.value ?? photos.value)

  const handleIndexChange = (newIndex: number) => {
    switchToIndex(newIndex)
    const photoId = viewerPhotos.value[newIndex]?.id
    if (!photoId) return
    if (
      returnRoute.value?.startsWith('/albums/') &&
      route.path === returnRoute.value
    ) {
      router.replace({
        path: route.path,
        query: { ...route.query, photo: photoId },
      })
    } else {
      router.replace(`/${photoId}`)
    }
  }

  const handleClose = () => {
    closeViewer()

    // 如果是直接访问详情页面，关闭时返回首页
    if (isDirectAccess.value) {
      isDirectAccess.value = false
      router.replace('/')
    } else if (returnRoute.value) {
      // 如果有指定的返回路由，返回到该路由
      const destination = returnRoute.value
      clearReturnRoute()
      router.replace(destination)
    } else {
      // 否则使用历史记录或默认返回首页
      if (window.history.length > 1) {
        router.back()
      } else {
        router.replace('/')
      }
    }
  }

  return {
    viewerPhotos,
    currentPhotoIndex,
    isViewerOpen,
    handleClose,
    handleIndexChange,
  }
}

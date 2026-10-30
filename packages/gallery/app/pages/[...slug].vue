<script lang="ts" setup>
definePageMeta({
  layout: 'masonry',
  // 固定 key 防止路径参数变化时创建新的实例
  key: 'photo-viewer-route',
})

const route = useRoute()

const { switchToIndex, closeViewer, openViewer } = useViewerState()
const { isViewerOpen, scopedPhotos } = storeToRefs(useViewerState())

const { photos } = usePhotos()

const slug = computed(() => (route.params.slug as string[]) || [])
const photoId = computed(() => slug.value[0] || null)

const { t } = useI18n()
// Register one reactive head entry so unmount disposes it and every close restores
// the layout title; watcher-created entries can outlive their photo route.
useHead(() => ({
  title: photoId.value
    ? (scopedPhotos.value ?? photos.value).find(
        (photo) => photo.id === photoId.value,
      )?.title || t('title.fallback.photo')
    : '',
}))

watch(
  [photoId, photos],
  ([currentPhotoId, globalPhotos]) => {
    if (!currentPhotoId) {
      closeViewer()
      return
    }

    // An already-open session (album browsing, prev/next) keeps its current
    // photo scope; a fresh open (direct access or global gallery click) always
    // starts from the global list, and openViewer resets the scope.
    const activePhotos =
      isViewerOpen.value && scopedPhotos.value
        ? scopedPhotos.value
        : globalPhotos

    if (activePhotos.length === 0) return

    const foundIndex = activePhotos.findIndex(
      (photo) => photo.id === currentPhotoId,
    )
    if (foundIndex === -1) return

    if (!isViewerOpen.value) {
      // Direct access to a photo detail page: don't set a returnRoute (pass null)
      openViewer(foundIndex, null)
    } else {
      switchToIndex(foundIndex)
    }
  },
  { immediate: true },
)

onBeforeRouteLeave(() => closeViewer())
</script>

<template>
  <div />
</template>

<style scoped></style>

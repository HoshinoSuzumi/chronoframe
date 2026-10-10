<script lang="ts" setup>
definePageMeta({
  layout: 'masonry',
  // 固定 key 防止路径参数变化时创建新的实例
  key: 'photo-viewer-route',
})

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const { switchToIndex, closeViewer, openViewer } = useViewerState()
const { isViewerOpen, scopedPhotos } = storeToRefs(useViewerState())

const { photos } = usePhotos()

const slug = computed(() => (route.params.slug as string[]) || [])
const photoId = computed(() => slug.value[0] || null)
const currentPhoto = computed(() =>
  photos.value.find((photo) => photo.id === photoId.value),
)

if (photoId.value) {
  defineOgImage('Photo', {
    photo: currentPhoto.value || undefined,
    appTitle: (getSetting('app:title') as string) || 'ChronoFrame',
  })
} else {
  // Social previews must never include photos visible only to administrators.
  const { data: publicPhotos } = await useFetch<Photo[]>('/api/photos/visible')
  defineOgImage('Home', {
    appTitle: (getSetting('app:title') as string) || 'ChronoFrame',
    slogan: (getSetting('app:slogan') as string) || '',
    author: (getSetting('app:author') as string) || '',
    photoCount: publicPhotos.value?.length || 0,
    photoCountLabel: t(
      'plural.photo',
      { count: publicPhotos.value?.length || 0 },
      publicPhotos.value?.length || 0,
    ),
    thumbnails: (publicPhotos.value || [])
      .filter((photo) => photo.thumbnailUrl)
      .slice(0, 3)
      .map((photo) => photo.thumbnailUrl),
  })
}

// 处理标签查询参数
const { clearAllFilters, toggleFilter } = usePhotoFilters()

// 监听路由查询参数中的标签
watch(
  () => route.query.tag,
  (tagParam) => {
    if (tagParam && typeof tagParam === 'string' && !photoId.value) {
      clearAllFilters()
      toggleFilter('tags', tagParam)

      router.replace('/')
    }
  },
  { immediate: true },
)

watch(
  [photoId, photos],
  ([currentPhotoId, globalPhotos]) => {
    if (!currentPhotoId) {
      closeViewer()
      useHead({
        title: '',
      })
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

    useHead({
      title: activePhotos[foundIndex]?.title || $t('title.fallback.photo'),
    })

    if (!isViewerOpen.value) {
      // Direct access to a photo detail page: don't set a returnRoute (pass null)
      openViewer(foundIndex, null)
    } else {
      switchToIndex(foundIndex)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div />
</template>

<style scoped></style>

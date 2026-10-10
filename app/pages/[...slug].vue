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

const nuxtApp = useNuxtApp()
// This public collection is route-independent; late results must only update
// Home metadata while the current route is still the home page.
const { data: publicPhotos, execute: loadPublicPhotos } = await useFetch<
  Photo[]
>('/api/photos/visible', { immediate: !photoId.value })
watch(photoId, (id) => {
  if (!id && !publicPhotos.value) void loadPublicPhotos()
})

function updateOgImage() {
  const id = photoId.value
  const appTitle = (getSetting('app:title') as string) || 'ChronoFrame'
  nuxtApp.runWithContext(() => {
    if (id) {
      defineOgImage('Photo', {
        photo: currentPhoto.value?.id === id ? currentPhoto.value : undefined,
        appTitle,
      })
      return
    }
    const visiblePhotos = publicPhotos.value || []
    defineOgImage('Home', {
      appTitle,
      slogan: (getSetting('app:slogan') as string) || '',
      author: (getSetting('app:author') as string) || '',
      photoCount: visiblePhotos.length,
      photoCountLabel: t(
        'plural.photo',
        { count: visiblePhotos.length },
        visiblePhotos.length,
      ),
      thumbnails: visiblePhotos
        .map((photo) => photo.thumbnailUrl)
        .filter((url): url is string => Boolean(url))
        .slice(0, 3),
    })
  })
}
watch(
  [
    photoId,
    currentPhoto,
    publicPhotos,
    () => route.fullPath,
    () => t('plural.photo', 0),
  ],
  updateOgImage,
  { immediate: true },
)
// nuxt-og-image skips client updates during hydration. Reconcile once mounted
// in case the route changed while the initial public-photo request was pending.
onMounted(updateOgImage)

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

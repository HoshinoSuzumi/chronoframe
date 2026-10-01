<script lang="ts" setup>
import { motion } from 'motion-v'

const route = useRoute()
const router = useRouter()
const dayjs = useDayjs()

const albumId = computed(() => {
  const id = route.params.albumId as string
  return parseInt(id, 10)
})

const {
  data: album,
  error,
  pending,
  refresh,
} = await useFetch(() => `/api/albums/${albumId.value}`, {
  watch: [albumId],
})

if (error.value && error.value.statusCode !== 403) {
  throw createError({
    statusCode: 404,
    statusMessage: $t('album.notFound'),
  })
}

const albumPassword = ref('')
const isUnlocking = ref(false)
const unlockError = ref(false)
const unlockSucceeded = ref(false)
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const unlockAlbum = async () => {
  isUnlocking.value = true
  unlockError.value = false
  unlockSucceeded.value = false
  try {
    await $fetch(`/api/albums/${albumId.value}/unlock`, {
      method: 'POST', body: { password: albumPassword.value },
    })
    albumPassword.value = ''
    await refresh()
    unlockSucceeded.value = true
    if (!prefersReducedMotion.value) {
      await new Promise((resolve) => setTimeout(resolve, 220))
    }
  } catch {
    unlockError.value = true
  } finally {
    isUnlocking.value = false
  }
}

const albumData = computed(() => album.value)

const albumStats = computed(() => {
  if (!albumData.value) return null

  const photos = albumData.value.photos || []
  const totalPhotos = photos.length
  const photosWithDates = photos.filter((p: any) => p.dateTaken).length
  const photosWithExif = photos.filter((p: any) => p.exif).length

  const allDates = photos
    .map((p: any) => p?.dateTaken)
    .filter((date: any): date is string => Boolean(date))
    .map((date: string) => dayjs(date))
    .sort((a, b) => (a.isBefore(b) ? -1 : 1))

  const dateRange =
    allDates.length > 0
      ? {
          start: allDates[0],
          end: allDates[allDates.length - 1],
        }
      : null

  return {
    total: totalPhotos,
    withDates: photosWithDates,
    withExif: photosWithExif,
    dateRange,
  }
})

// 计算日期范围文本
const dateRangeText = computed(() => {
  const range = albumStats.value?.dateRange
  if (!range || !range.start || !range.end) return null

  if (range.start.isSame(range.end, 'day')) {
    return range.start.format('ll')
  } else if (range.start.isSame(range.end, 'month')) {
    return range.start.format('MMM YYYY')
  } else if (range.start.isSame(range.end, 'year')) {
    return `${range.start.format('MMM')} - ${range.end.format('MMM YYYY')}`
  } else {
    return `${range.start.format('ll')} - ${range.end.format('ll')}`
  }
})

// 用于 MasonryWall 的照片数据
const masonryItems = computed(() => {
  return (
    albumData.value?.photos?.map((photo: any, index: number) => ({
      id: photo.id,
      photo,
      originalIndex: index,
    })) ?? []
  )
})

const isMobile = useMediaQuery('(max-width: 768px)')
const columnWidth = computed(() => (isMobile.value ? 280 : 280))
const maxColumns = computed(() => (isMobile.value ? 2 : 8))
const minColumns = computed(() => (isMobile.value ? 2 : 2))

const MASONRY_GAP = 4

const handleOpenViewer = (index: number) => {
  const photos = albumData.value?.photos
  if (photos && photos[index]) {
    const { openViewer } = useViewerState()
    const albumRoute = `/albums/${albumId.value}`
    // Scope the viewer to the album's photos so prev/next stays within this album.
    // The fetched photos are serialized rows of the same shape as Photo.
    openViewer(index, albumRoute, photos as Photo[])
    router.push(`/${photos[index].id}`)
  }
}

const coverPhoto = computed(() => {
  const album = albumData.value
  if (!album?.photos) return null

  // coverPhotoId first
  if (album.coverPhotoId) {
    const cover = album.photos.find((p: any) => p.id === album.coverPhotoId)
    if (cover) return cover
  }

  // otherwise first photo
  return album.photos[0] || null
})

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

const showFloatingActions = ref(false)

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showFloatingActions.value = scrollTop > 500
}

const goBackToAlbums = () => {
  router.push('/albums')
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

useHead({
  title: () => albumData.value?.title ||
    (error.value?.statusCode === 403 ? $t('album.passwordRequired') : $t('album.notFound')),
})
</script>

<template>
  <div class="relative w-full">
    <div
      v-if="pending && !isUnlocking"
      class="flex flex-col items-center justify-center min-h-[50vh] gap-4"
    >
      <UIcon
        name="tabler:loader"
        class="animate-spin size-8 text-primary-600"
      />
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        {{ $t('ui.loading') }}
      </p>
    </div>

    <motion.div
      v-else-if="error?.statusCode === 403 || isUnlocking"
      class="relative mx-auto flex min-h-[65vh] max-w-md items-center justify-center overflow-hidden px-6 py-16"
      :initial="prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.97 }"
      :animate="unlockSucceeded && !prefersReducedMotion
        ? { opacity: 0, y: -12, scale: 0.98 }
        : { opacity: 1, y: 0, scale: 1 }"
      :transition="{ duration: prefersReducedMotion ? 0 : 0.42, ease: 'easeOut' }"
    >
      <div class="relative w-full rounded-3xl border border-neutral-200/70 bg-white/80 p-8 shadow-xl shadow-neutral-900/5 backdrop-blur-xl dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:shadow-black/20 sm:p-10">
        <motion.div
          class="mx-auto mb-4 flex size-16 items-center justify-center text-primary-600 dark:text-primary-400"
          :initial="prefersReducedMotion ? false : { opacity: 0, scale: 0.7, rotate: -12 }"
          :animate="{ opacity: 1, scale: 1, rotate: 0 }"
          :transition="{ delay: prefersReducedMotion ? 0 : 0.12, type: 'spring', stiffness: 260, damping: 20 }"
        >
          <Icon name="tabler:lock" class="size-10" />
        </motion.div>
        <motion.h1
          class="mb-5 text-center text-2xl font-semibold text-neutral-900 dark:text-white"
          :initial="prefersReducedMotion ? false : { opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ delay: prefersReducedMotion ? 0 : 0.2, duration: prefersReducedMotion ? 0 : 0.35 }"
        >
          {{ $t('album.passwordRequired') }}
        </motion.h1>
        <motion.div
          :initial="prefersReducedMotion ? false : { opacity: 0, y: 12 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ delay: prefersReducedMotion ? 0 : 0.28, duration: prefersReducedMotion ? 0 : 0.35 }"
        >
          <form class="flex flex-col gap-3" @submit.prevent="unlockAlbum">
            <motion.div
              :animate="unlockError && !prefersReducedMotion
                ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }"
              :transition="{ duration: 0.32 }"
            >
              <UInput v-model="albumPassword" type="password" autocomplete="off"
                :placeholder="$t('album.passwordPlaceholder')" autofocus class="w-full" />
            </motion.div>
            <p v-if="unlockError" role="alert" class="text-sm text-error-500">
              {{ $t('album.incorrectPassword') }}
            </p>
            <UButton type="submit" block :loading="isUnlocking" :disabled="!albumPassword">
              {{ $t('album.unlock') }}
            </UButton>
          </form>
        </motion.div>
      </div>
    </motion.div>
    <template v-else-if="albumData">
      <!-- Backdrop layer -->
      <div
        v-if="coverPhoto"
        class="absolute inset-0 h-2/3 sm:h-[500px] overflow-hidden -z-10"
      >
        <ThumbImage
          :src="coverPhoto.thumbnailUrl || ''"
          :thumbhash="coverPhoto.thumbnailHash"
          :alt="albumData.title"
          class="w-full h-full object-cover opacity-40 dark:opacity-20 scale-110 saturate-150"
        />
        <div
          class="absolute -inset-1 bg-gradient-to-b from-transparent via-white/50 to-white dark:via-neutral-900/50 dark:to-neutral-900 backdrop-blur-xl sm:backdrop-blur-2xl"
        />
      </div>

      <!-- Back Button -->
      <div class="relative container mx-auto px-4 sm:px-6 lg:px-8 pt-4 z-10">
        <UButton
          variant="ghost"
          color="neutral"
          icon="tabler:arrow-left"
          size="sm"
          @click="goBackToAlbums"
        />
      </div>

      <!-- Album Information -->
      <div class="relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        <AnimatePresence>
          <motion.div
            class="flex flex-col gap-6"
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.4 }"
          >
            <!-- title -->
            <div>
              <h1
                class="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white tracking-tight"
              >
                {{ albumData.title }}
              </h1>
            </div>

            <!-- metadata -->
            <div class="flex flex-col gap-4">
              <!-- description -->
              <p
                class="text-base text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl"
              >
                {{ albumData.description || $t('album.noDescription') }}
              </p>

              <!-- metadata row -->
              <div class="flex flex-wrap items-center gap-4 text-sm">
                <!-- Photos -->
                <div class="flex items-center gap-1">
                  <Icon
                    name="tabler:photo"
                    class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
                  />
                  <span class="text-neutral-700 dark:text-neutral-200">
                    <span class="text-neutral-900 dark:text-white">
                      {{ albumStats?.total || 0 }}
                    </span>
                    <span class="text-neutral-500 dark:text-neutral-400 ml-1">
                      {{ $t('album.metadata.photos') }}
                    </span>
                  </span>
                </div>

                <!-- Date Range -->
                <div
                  v-if="dateRangeText"
                  class="flex items-center gap-1"
                >
                  <Icon
                    name="tabler:calendar"
                    class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
                  />
                  <span class="text-neutral-700 dark:text-neutral-200">
                    {{ dateRangeText }}
                  </span>
                </div>

                <!-- Created -->
                <div
                  class="flex items-center gap-1"
                  :title="$t('album.createdTooltip', { date: $dayjs(albumData.createdAt).format('YYYY-MM-DD HH:mm:ss') })"
                >
                  <Icon
                    name="tabler:clock-plus"
                    class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
                  />
                  <span class="text-neutral-700 dark:text-neutral-200">
                    {{ $t('album.metadata.created') }}
                    {{ $dayjs(albumData.createdAt).fromNow() }}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <!-- Photos Waterfall or Empty State -->
      <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ delay: 0.2, duration: 0.4 }"
        >
          <div
            v-if="albumStats?.total === 0"
            class="flex flex-col items-center justify-center gap-6 px-4"
          >
            <div class="flex flex-col items-center gap-4">
              <Icon
                name="tabler:library-photo"
                class="size-20 text-neutral-300 dark:text-neutral-600"
              />
              <div class="text-center">
                <p
                  class="text-xl font-normal text-neutral-800 dark:text-neutral-200 mb-2"
                >
                  {{ $t('album.emptyAlbumTitle') }}
                </p>
              </div>
            </div>
          </div>

          <MasonryWall
            v-else
            :items="masonryItems"
            :column-width="columnWidth"
            :gap="MASONRY_GAP"
            :min-columns="minColumns"
            :max-columns="maxColumns"
            :ssr-columns="2"
            :key-mapper="
              (_item, _column, _row, index) =>
                masonryItems[index]?.originalIndex ?? index
            "
          >
            <template #default="{ item }">
              <MasonryItem
                v-if="item.photo && typeof item.originalIndex === 'number'"
                :key="item.photo.id"
                :photo="item.photo"
                :index="item.originalIndex"
                :has-animated="false"
                :first-screen-items="50"
                @open-viewer="handleOpenViewer($event)"
              />
            </template>
          </MasonryWall>
        </motion.div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col items-center justify-center min-h-[50vh] gap-6">
        <div class="flex flex-col items-center gap-4">
          <Icon
            name="tabler:alert-circle"
            class="size-20 text-red-400"
          />
          <div class="text-center">
            <p
              class="text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mb-2"
            >
              {{ $t('album.failedToLoadTitle') }}
            </p>
            <p
              class="text-base text-neutral-600 dark:text-neutral-400 max-w-md"
            >
              {{ $t('album.failedToLoadDescription') }}
            </p>
          </div>
        </div>
        <UButton @click="goBackToAlbums">
          {{ $t('album.backToAlbums') }}
        </UButton>
      </div>
    </template>

    <!-- Back to Top Button -->
    <motion.div
      v-if="showFloatingActions"
      class="fixed bottom-6 right-6 z-50"
      :initial="{ opacity: 0, scale: 0.8 }"
      :animate="{ opacity: 1, scale: 1 }"
      :exit="{ opacity: 0, scale: 0.8 }"
      :transition="{ duration: 0.2 }"
    >
      <UTooltip :text="$t('ui.action.backtotop.tooltip')">
        <UButton
          variant="soft"
          color="neutral"
          class="cursor-pointer bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm flex justify-center items-center rounded-full shadow-lg hover:bg-white dark:hover:bg-neutral-800 transition-all duration-300 border border-neutral-200/50 dark:border-neutral-700/50"
          icon="tabler:arrow-up"
          size="lg"
          :aria-label="$t('ui.action.backtotop.ariaLabel')"
          @click="scrollToTop"
        />
      </UTooltip>
    </motion.div>
  </div>
</template>

<style scoped></style>

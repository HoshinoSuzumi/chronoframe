<script lang="ts" setup>
import { motion } from 'motion-v'
import type { Album } from '~~/server/utils/db'

interface AlbumWithPhotos extends Album {
  photoIds?: string[]
}

const config = useRuntimeConfig()
const { photos } = usePhotos()
const { loggedIn } = useUserSession()

const { data: albums } = useAsyncData<AlbumWithPhotos[]>(
  'albums',
  () => $fetch('/api/albums'),
  {
    watch: [],
  },
)

// 根据登录状态决定是否过滤隐藏的相册
// 登录用户可以看到所有相册，未登录用户只能看到非隐藏相册
const visibleAlbums = computed(() => {
  if (loggedIn.value) {
    return albums.value || []
  }
  return (albums.value || []).filter((album) => !album.isHidden)
})

// randomly pick 30 photos for waterfall
const waterfallPhotos = computed(() =>
  photos.value.toSorted(() => 0.5 - Math.random()).slice(0, 30),
)
const isMobile = useMediaQuery('(max-width: 768px)')

const waterfallColumnCount = computed(() => (isMobile.value ? 3 : 8))
const columnDurations = ref<number[]>([])

onMounted(() => {
  columnDurations.value = Array.from(
    { length: waterfallColumnCount.value },
    () => {
      // Base duration 120s, random offset -60 to +30s
      return 120 + (Math.random() * 90 - 60)
    },
  )
})

const columns = computed(() => {
  const cols: (typeof waterfallPhotos.value)[] = Array.from(
    { length: waterfallColumnCount.value },
    () => [],
  )

  if (waterfallPhotos.value.length === 0) return cols

  const photosPerColumn = 8

  for (let colIndex = 0; colIndex < waterfallColumnCount.value; colIndex++) {
    for (let i = 0; i < photosPerColumn; i++) {
      const photoIndex =
        (colIndex + i * waterfallColumnCount.value) %
        waterfallPhotos.value.length
      cols[colIndex]?.push(waterfallPhotos.value[photoIndex]!)
    }
  }

  return cols
})

const getPhotoById = (photoId: string) => {
  return photos.value.find((p) => p.id === photoId) || null
}

const getAlbumDisplayPhotos = (album: AlbumWithPhotos) => {
  if (!album.photoIds || album.photoIds.length === 0) return []

  const displayPhotos: Photo[] = []

  // 第一张：优先使用封面照片
  if (album.coverPhotoId) {
    const coverPhoto = getPhotoById(album.coverPhotoId)
    if (coverPhoto) {
      displayPhotos.push(coverPhoto)
    }
  }

  // 如果没有封面照片或封面照片不存在，使用第一张
  if (displayPhotos.length === 0 && album.photoIds[0]) {
    const firstPhoto = getPhotoById(album.photoIds[0])
    if (firstPhoto) {
      displayPhotos.push(firstPhoto)
    }
  }

  // 添加其他照片（最多3张）
  for (const photoId of album.photoIds) {
    if (displayPhotos.length >= 3) break
    const photo = getPhotoById(photoId)
    if (photo && !displayPhotos.find((p) => p.id === photo.id)) {
      displayPhotos.push(photo)
    }
  }

  return displayPhotos
}

// 每张照片的初始位置和悬浮位置
const getPhotoTransform = (index: number, isHover: boolean) => {
  if (index === 0) {
    return {
      x: 0,
      y: 0,
      rotate: 0,
    }
  } else if (index === 1) {
    return isHover
      ? { x: -20, y: -16, rotate: -8 }
      : { x: -6, y: -4, rotate: -4 }
  } else {
    return isHover ? { x: 28, y: -20, rotate: 10 } : { x: 8, y: -6, rotate: 5 }
  }
}

const hoveredAlbum = ref<number | null>(null)
</script>

<template>
  <div class="relative">
    <!-- Animated waterfall area -->
    <div
      class="absolute inset-x-0 top-0 h-[30vh] sm:h-[50vh] overflow-hidden -z-10"
    >
      <div class="absolute inset-0 flex h-full gap-0">
        <!-- Per column -->
        <div
          v-for="(column, colIndex) in columns"
          :key="colIndex"
          class="flex-1 relative overflow-hidden select-none"
        >
          <div
            class="flex flex-col"
            :class="
              colIndex % 2 === 0 ? 'animate-scroll-down' : 'animate-scroll-up'
            "
            :style="{
              animationDuration: columnDurations[colIndex]
                ? `${columnDurations[colIndex]}s`
                : '200s',
            }"
          >
            <template
              v-for="groupIndex in 3"
              :key="groupIndex"
            >
              <div
                v-for="(photo, photoIndex) in column"
                :key="`${photo.id}-${groupIndex}-${photoIndex}`"
                class="w-full overflow-hidden"
              >
                <ClientOnly>
                  <ThumbImage
                    class="w-full h-auto object-cover saturate-50"
                    :lazy="false"
                    :src="photo.thumbnailUrl!"
                    :thumbhash="photo.thumbnailHash"
                    :alt="photo.exif?.ImageDescription || 'Photo'"
                    :style="{
                      aspectRatio: photo.aspectRatio || 1,
                    }"
                  />
                </ClientOnly>
              </div>
            </template>
          </div>
        </div>
      </div>
      <!-- Overlay -->
      <div
        class="absolute -inset-1 bg-gradient-to-b from-neutral-100/80 to-white dark:from-neutral-900/80 dark:to-neutral-900"
      />
    </div>

    <div class="absolute p-4">
      <!-- Back to home -->
      <UTooltip :text="$t('ui.action.home.tooltip')">
        <UButton
          variant="ghost"
          color="neutral"
          icon="tabler:arrow-left"
          :label="$t('ui.action.home.tooltip')"
          size="sm"
          to="/"
        />
      </UTooltip>
    </div>

    <!-- Titles -->
    <div class="flex flex-col items-center pt-16 sm:pt-48 pb-24">
      <h1
        class="font-black text-6xl sm:text-7xl drop-shadow-2xl bg-clip-text bg-gradient-to-br from-neutral-800 to-neutral-400 dark:from-white dark:to-neutral-500 text-transparent"
      >
        {{ $t('title.albums').toUpperCase() }}
      </h1>
      <p
        class="mt-2 text-lg text-neutral-600 dark:text-neutral-400 font-medium font-[Pacifico]"
      >
        {{ config.public.app.slogan }}
      </p>
    </div>

    <!-- Albums Grid -->
    <div class="container mx-auto px-10 sm:px-6 lg:px-8 py-12">
      <div
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-16"
      >
        <NuxtLink
          v-for="album in visibleAlbums"
          :key="album.id"
          :to="`/albums/${album.id}`"
          class="block"
          @mouseenter="hoveredAlbum = album.id"
          @mouseleave="hoveredAlbum = null"
        >
          <!-- Stacked Photos Card -->
          <div class="relative h-48 mb-4 group">
            <!-- Photo Stack (3 layers) -->
            <motion.div
              v-for="(photo, index) in getAlbumDisplayPhotos(album)"
              :key="photo.id"
              class="absolute inset-0 rounded-xl shadow-lg overflow-hidden bg-white dark:bg-neutral-800"
              :initial="{
                x: getPhotoTransform(index, false).x,
                y: getPhotoTransform(index, false).y,
                rotate: getPhotoTransform(index, false).rotate,
                opacity: 1 - index * 0.12,
              }"
              :animate="{
                x: getPhotoTransform(index, hoveredAlbum === album.id).x,
                y: getPhotoTransform(index, hoveredAlbum === album.id).y,
                rotate: getPhotoTransform(index, hoveredAlbum === album.id)
                  .rotate,
                opacity: hoveredAlbum === album.id ? 1 : 1 - index * 0.12,
              }"
              :transition="{
                type: 'spring',
                stiffness: 300,
                damping: 30,
                mass: 0.8,
              }"
              :style="{
                zIndex: 3 - index,
              }"
            >
              <ThumbImage
                class="w-full h-full object-cover"
                :src="photo.thumbnailUrl!"
                :thumbhash="photo.thumbnailHash"
                :alt="album.title"
                :style="{
                  aspectRatio: photo.aspectRatio || 1,
                }"
              />
              <!-- Overlay for stacked cards -->
              <motion.div
                v-if="index > 0"
                class="absolute inset-0 bg-black/10 dark:bg-black/30"
                :initial="{ opacity: 1 }"
                :animate="{ opacity: hoveredAlbum === album.id ? 0 : 1 }"
                :transition="{ duration: 0.3 }"
              />
            </motion.div>

            <!-- Empty state -->
            <div
              v-if="!album.photoIds || album.photoIds.length === 0"
              class="absolute inset-0 rounded-xl shadow-lg bg-gradient-to-br from-neutral-100 to-neutral-50 dark:from-neutral-700 dark:to-neutral-800 flex flex-col items-center justify-center gap-3 border border-neutral-200 dark:border-neutral-600 group-hover:shadow-xl dark:group-hover:shadow-neutral-900/50 transition-shadow"
            >
              <Icon
                name="tabler:library-photo"
                class="size-10 text-neutral-400 dark:text-neutral-500"
              />
              <div class="text-center">
                <p
                  class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  {{ $t('ui.album.noImage') }}
                </p>
                <!-- <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {{ $t('ui.album.emptyAlbumTip') }}
                </p> -->
              </div>
            </div>
          </div>

          <!-- Album Info -->
          <div class="px-2">
            <div class="flex flex-col gap-0">
              <div class="flex items-center gap-8">
                <h2
                  class="flex-1 truncate text-lg font-semibold text-neutral-800 dark:text-neutral-200 transition-colors"
                  :class="{
                    'text-primary-600 dark:text-primary-400':
                      hoveredAlbum === album.id,
                  }"
                >
                  {{ album.title }}
                </h2>

                <p
                  class="flex items-center gap-0.5 text-sm text-neutral-600 dark:text-neutral-400"
                >
                  <Icon
                    name="tabler:clock"
                    class="h-[1lh] size-4"
                  />
                  {{ $dayjs(album.createdAt).fromNow() }}
                </p>
              </div>
              <p
                class="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2"
              >
                {{ album.description || $t('ui.album.noDescription') }}
              </p>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes scroll-down {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(calc(-100% / 3));
  }
}

@keyframes scroll-up {
  0% {
    transform: translateY(calc(-100% / 3));
  }
  100% {
    transform: translateY(0);
  }
}

.animate-scroll-down {
  animation: scroll-down linear infinite;
}

.animate-scroll-up {
  animation: scroll-up linear infinite;
}
</style>

<script setup lang="ts">
import { motion } from 'motion-v'
import {
  FIXED_HEADER_HEIGHT_PX,
  FIXED_HEADER_SOCIAL_ROW_HEIGHT_PX,
} from '#gallery/utils'
import { parseSocialLinks } from '@chronoframe/contracts/social-links'
interface Props {
  photos: Photo[]
  columns?: number | 'auto'
}

const props = withDefaults(defineProps<Props>(), {
  columns: 'auto',
})

const dayjs = useDayjs()
const router = useRouter()
const route = useRoute()
const locationLabel = useLocationLabel()

const { filteredPhotos, hasActiveFilters } = usePhotoFilters()
const { sortedPhotos } = usePhotoSort()
const homeHeaderLayout = useSettingRef('app:appearance.homeHeaderLayout')
const isFixedHeader = computed(() => homeHeaderLayout.value === 'fixed')
const socialLinksSetting = useSettingRef('app:socialLinks')
const hasSocialLinks = computed(() => {
  try {
    return parseSocialLinks(socialLinksSetting.value).length > 0
  } catch {
    return false
  }
})

const displayPhotos = computed(() => {
  return hasActiveFilters.value ? filteredPhotos.value : sortedPhotos.value
})

const viewer = useViewerState()
const { currentPhotoIndex, isViewerOpen } = storeToRefs(viewer)

const FIRST_SCREEN_ITEMS_COUNT = 50
const MASONRY_GAP = 4

const masonryWrapper = ref<HTMLElement>()
const hasAnimated = ref(false)
const showFloatingActions = ref(false)
const dateRange = ref<string>()
const visiblePhotos = ref(new Set<number>())

const isMobile = useMediaQuery('(max-width: 768px)')
const { batchProcessLivePhotos } = useLivePhotoProcessor()

const processedBatch = ref(new Set<string>())
const fixedHeaderRef = ref<HTMLElement>()
const fixedHeaderHeight = ref(FIXED_HEADER_HEIGHT_PX)
const embeddedHeaderRef = ref<HTMLElement>()
const embeddedHeaderHeight = ref(0)
const headerColumnWidth = ref(0)

const columnWidth = computed(() => {
  if (props.columns === 'auto') {
    return isMobile.value ? 280 : 280
  }
  return 280
})

const maxColumns = computed(() => {
  if (props.columns !== 'auto') {
    return props.columns
  }
  return isMobile.value ? 2 : 8
})

const minColumns = computed(() => {
  if (props.columns !== 'auto') {
    return props.columns
  }
  return 2
})

// Prepare items for masonry-wall
const masonryItems = computed(() => {
  return (
    displayPhotos.value?.map((photo, index) => ({
      id: photo.id,
      photo,
      originalIndex: index,
    })) ?? []
  )
})
const measureHeaderHeights = () => {
  if (fixedHeaderRef.value) {
    fixedHeaderHeight.value =
      fixedHeaderRef.value.getBoundingClientRect().height
  }
  if (embeddedHeaderRef.value) {
    embeddedHeaderHeight.value =
      embeddedHeaderRef.value.getBoundingClientRect().height
  }
}

useResizeObserver(fixedHeaderRef, measureHeaderHeights)
useResizeObserver(embeddedHeaderRef, measureHeaderHeights)

const updateEmbeddedHeaderWidth = () => {
  if (isMobile.value || isFixedHeader.value) {
    headerColumnWidth.value = 0
    return
  }

  const columnElement = masonryWrapper.value?.querySelector<HTMLElement>(
    '.masonry-wall .masonry-column',
  )

  headerColumnWidth.value =
    columnElement?.getBoundingClientRect().width ?? columnWidth.value
}

useResizeObserver(masonryWrapper, updateEmbeddedHeaderWidth)

const embeddedHeaderOffset = computed(() => {
  return isMobile.value ? 0 : embeddedHeaderHeight.value + MASONRY_GAP
})

const embeddedHeaderStyle = computed(() => {
  if (isMobile.value) {
    return { width: '100%', marginBottom: `${MASONRY_GAP}px` }
  }

  return { width: `${headerColumnWidth.value || columnWidth.value}px` }
})

watch([isMobile, isFixedHeader, columnWidth, maxColumns, minColumns], () => {
  nextTick(() => {
    updateEmbeddedHeaderWidth()
    measureHeaderHeights()
  })
})

const photoStats = computed(() => {
  const totalPhotos = displayPhotos.value?.length || 0
  const photosWithDates =
    displayPhotos.value?.filter((p) => p.dateTaken).length || 0
  const photosWithTitles =
    displayPhotos.value?.filter((p) => p.title).length || 0
  const photosWithExif = displayPhotos.value?.filter((p) => p.exif).length || 0

  // Get date range of all photos
  const allDates = displayPhotos.value
    ?.map((p) => p?.dateTaken)
    .filter((date): date is string => Boolean(date))
    .map((date) => dayjs(date))
    .sort((a, b) => b.valueOf() - a.valueOf())
    .map((date) => date.format('ll'))

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
    withTitles: photosWithTitles,
    withExif: photosWithExif,
    dateRange,
  }
})

const dateRangeText = computed(() => {
  const range = photoStats.value?.dateRange
  if (!range || !range.start || !range.end) return ''
  return `${range.start} - ${range.end}`
})

const handleVisibilityChange = ({
  index,
  isVisible,
}: {
  index: number
  isVisible: boolean
  date: string | Date
}) => {
  if (isVisible) {
    visiblePhotos.value.add(index)
  } else {
    visiblePhotos.value.delete(index)
  }
  updateDateRange()

  // Process LivePhotos for visible photos
  nextTick(() => {
    processVisibleLivePhotos()
  })
}

// Process LivePhotos for currently visible photos
const processVisibleLivePhotos = async () => {
  const visiblePhotosArray = Array.from(visiblePhotos.value)
  const livePhotosToProcess = visiblePhotosArray
    .map((index) => displayPhotos.value[index])
    .filter(
      (photo): photo is Photo =>
        photo != null &&
        photo.isLivePhoto === 1 &&
        Boolean(photo.livePhotoVideoUrl) &&
        !processedBatch.value.has(photo.id),
    )

  if (livePhotosToProcess.length === 0) return

  // Mark as processed to avoid reprocessing
  livePhotosToProcess.forEach((photo) => {
    processedBatch.value.add(photo.id)
  })

  // Start background processing
  batchProcessLivePhotos(
    livePhotosToProcess.map((photo) => ({
      id: photo.id,
      livePhotoVideoUrl: photo.livePhotoVideoUrl!,
    })),
  )
}

const visibleCities = ref<string>()

const updateDateRange = () => {
  if (visiblePhotos.value.size === 0) {
    dateRange.value = undefined
    visibleCities.value = undefined
    return
  }

  const visiblePhotosArray = Array.from(visiblePhotos.value)

  // Calculate visible dates
  const visibleDates = visiblePhotosArray
    .map((index) => displayPhotos.value[index]?.dateTaken)
    .filter((date): date is string => Boolean(date))
    .map((date) => dayjs(date))
    .sort((a, b) => (a.isBefore(b) ? -1 : 1))

  // Calculate visible cities
  const cities = visiblePhotosArray
    .map((index) =>
      displayPhotos.value[index]
        ? locationLabel(displayPhotos.value[index]!)
        : undefined,
    )
    .filter((city): city is string => Boolean(city))

  const uniqueCities = [...new Set(cities)]

  if (uniqueCities.length === 0) {
    visibleCities.value = undefined
  } else if (uniqueCities.length === 1) {
    visibleCities.value = uniqueCities[0]
  } else if (uniqueCities.length <= 3) {
    visibleCities.value = uniqueCities.join('、')
  } else {
    visibleCities.value =
      `${uniqueCities.slice(0, 2).join('、')} ` +
      $t('ui.indexPanelCountCity', { count: uniqueCities.length })
  }

  if (visibleDates.length === 0) {
    dateRange.value = undefined
    return
  }

  const startDate = visibleDates[0]
  const endDate = visibleDates[visibleDates.length - 1]

  if (!startDate || !endDate) {
    dateRange.value = undefined
    return
  }

  // Check if dates are the same day
  if (startDate.isSame(endDate, 'day')) {
    // Same day
    dateRange.value = startDate.format('ll')
  } else if (startDate.isSame(endDate, 'month')) {
    // Same month
    dateRange.value = startDate.format('MMM YYYY')
  } else if (startDate.isSame(endDate, 'year')) {
    // Same year, different months
    dateRange.value = `${startDate.format('MMM')} - ${endDate.format('MMM YYYY')}`
  } else {
    // Different years
    dateRange.value = `${startDate.format('ll')} - ${endDate.format('ll')}`
  }
}

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showFloatingActions.value = scrollTop > 500
}

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })

  nextTick(() => {
    updateEmbeddedHeaderWidth()
    measureHeaderHeights()

    if (currentPhotoIndex.value) {
      scrollToPhoto(currentPhotoIndex.value)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

const handleOpenViewer = (index: number) => {
  const photo = displayPhotos.value[index]
  if (!photo) return

  viewer.openViewer(index, route.path, displayPhotos.value)
  router.push(`/${photo.id}`)
}

const scrollToPhoto = (photoIndex: number) => {
  if (!displayPhotos.value[photoIndex]) return

  const photoId = displayPhotos.value[photoIndex].id
  const photoElement = document.querySelector(`[data-photo-id="${photoId}"]`)

  if (photoElement) {
    const elementRect = photoElement.getBoundingClientRect()
    const windowHeight = window.innerHeight
    const currentScrollY = window.pageYOffset

    // 让图片在视口中央
    const targetScrollY =
      currentScrollY +
      elementRect.top -
      windowHeight / 2 +
      elementRect.height / 2

    window.scrollTo({
      top: Math.max(0, targetScrollY),
      behavior: 'smooth',
    })
  }
}

watch(currentPhotoIndex, (newIndex) => {
  if (isViewerOpen.value && newIndex >= 0) {
    nextTick(() => {
      scrollToPhoto(newIndex)
    })
  }
})
</script>

<template>
  <div class="relative w-full">
    <DateRangeIndicator
      :date-range="dateRange"
      :locations="visibleCities"
      :is-visible="!!dateRange && showFloatingActions"
      :is-mobile="isMobile"
      :top-offset="isFixedHeader ? fixedHeaderHeight : undefined"
    />

    <div
      v-if="isFixedHeader"
      ref="fixedHeaderRef"
      class="fixed inset-x-0 top-0 z-30"
    >
      <MasonryItemHeaderFixed
        :stats="photoStats"
        :date-range-text
      />
    </div>

    <div
      v-if="isFixedHeader"
      aria-hidden="true"
      :class="{ 'fixed-header-spacer-with-social-links': hasSocialLinks }"
      :style="{
        height: `${fixedHeaderHeight}px`,
        '--fixed-header-mobile-min-height': `${FIXED_HEADER_HEIGHT_PX + FIXED_HEADER_SOCIAL_ROW_HEIGHT_PX}px`,
      }"
    />

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

    <div
      class="lg:px-0 lg:pb-0"
      :class="isMobile ? 'px-1 pb-1' : 'p-1'"
    >
      <div
        ref="masonryWrapper"
        class="relative"
        :class="{ 'pt-2': isMobile }"
        :style="{ '--masonry-header-offset': `${embeddedHeaderOffset}px` }"
      >
        <div
          v-if="!isFixedHeader"
          ref="embeddedHeaderRef"
          class="masonry-header-wrapper"
          :class="{ 'masonry-header-desktop': !isMobile }"
          :style="embeddedHeaderStyle"
        >
          <MasonryItemHeader
            :stats="photoStats"
            :date-range-text
          />
        </div>

        <!-- Masonry Wall -->
        <MasonryWall
          :class="{ 'masonry-wall-with-header': !isFixedHeader }"
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
            <!-- Photo Items -->
            <MasonryItem
              v-if="item.photo && typeof item.originalIndex === 'number'"
              :key="item.photo.id"
              :photo="item.photo"
              :index="item.originalIndex"
              :has-animated
              :first-screen-items="FIRST_SCREEN_ITEMS_COUNT"
              @visibility-change="handleVisibilityChange"
              @open-viewer="handleOpenViewer($event)"
            />
          </template>
        </MasonryWall>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 1023px) {
  .fixed-header-spacer-with-social-links {
    min-height: var(--fixed-header-mobile-min-height);
  }
}

.masonry-header-wrapper {
  z-index: 1;
}

.masonry-header-desktop {
  left: 0;
  position: absolute;
  top: 0;
}

.masonry-wall-with-header :deep(.masonry-column:first-child) {
  padding-top: var(--masonry-header-offset, 0px);
}

.masonry-wall-with-header
  :deep(.masonry-column:first-child .masonry-item:first-child) {
  margin-top: 0;
}
</style>

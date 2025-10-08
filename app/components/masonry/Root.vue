<script setup lang="ts">
interface Props {
  photos: Photo[]
  columns?: number | 'auto'
}

const props = withDefaults(defineProps<Props>(), {
  columns: 'auto',
})

const dayjs = useDayjs()
const router = useRouter()

const { filteredPhotos, hasActiveFilters } = usePhotoFilters()
const { sortedPhotos } = usePhotoSort()

const displayPhotos = computed(() => {
  return hasActiveFilters.value ? filteredPhotos.value : sortedPhotos.value
})

const { currentPhotoIndex, isViewerOpen } = storeToRefs(useViewerState())

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
const headerRef = ref<HTMLElement>()
const headerHeight = ref(0)
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
useResizeObserver(headerRef, (entries) => {
  const entry = entries[0]
  if (entry) {
    headerHeight.value = entry.contentRect.height
  }
})

const updateHeaderWidth = () => {
  if (isMobile.value) {
    headerColumnWidth.value = 0
    return
  }

  const columnElement =
    masonryWrapper.value?.querySelector<HTMLElement>(
      '.masonry-wall .masonry-column',
    )

  if (columnElement) {
    headerColumnWidth.value = columnElement.getBoundingClientRect().width
    return
  }

  headerColumnWidth.value = columnWidth.value
}

useResizeObserver(masonryWrapper, () => {
  updateHeaderWidth()
})

const headerOffset = computed(() => {
  if (isMobile.value) {
    return 0
  }
  return headerHeight.value + MASONRY_GAP
})

const headerStyle = computed(() => {
  const styles: Record<string, string> = {}

  if (isMobile.value) {
    styles.width = '100%'
    styles.marginBottom = `${MASONRY_GAP}px`
    return styles
  }

  const width = headerColumnWidth.value || columnWidth.value
  styles.width = `${width}px`

  return styles
})

watch([columnWidth, maxColumns, minColumns], () => {
  if (isMobile.value) {
    return
  }

  nextTick(() => {
    updateHeaderWidth()
  })
})

watch(isMobile, (mobile) => {
  if (mobile) {
    headerColumnWidth.value = 0
    return
  }

  nextTick(() => {
    updateHeaderWidth()
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
    .map((date) => dayjs(date).format('ll'))
    .sort((a, b) => (dayjs(a).isBefore(dayjs(b)) ? 1 : -1))

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
    .map((index) => displayPhotos.value[index]?.city)
    .filter((city): city is string => Boolean(city))

  const uniqueCities = [...new Set(cities)]

  if (uniqueCities.length === 0) {
    visibleCities.value = undefined
  } else if (uniqueCities.length === 1) {
    visibleCities.value = uniqueCities[0]
  } else if (uniqueCities.length <= 3) {
    visibleCities.value = uniqueCities.join('、')
  } else {
    visibleCities.value = `${uniqueCities.slice(0, 2).join('、')} `+$t('ui.indexPanelCountCity',{ count: uniqueCities.length })
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

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', updateHeaderWidth)

  nextTick(() => {
    updateHeaderWidth()

    if (currentPhotoIndex.value) {
      scrollToPhoto(currentPhotoIndex.value)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', updateHeaderWidth)
})

const handleOpenViewer = (index: number) => {
  router.push(`/${displayPhotos.value[index]?.id}`)
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
    />

    <div
      class="lg:px-0 lg:pb-0"
      :class="isMobile ? 'px-1 pb-1' : 'p-1'"
    >
      <div
        ref="masonryWrapper"
        class="relative"
        :class="{ 'pt-2': isMobile }"
        :style="{ '--masonry-header-offset': `${headerOffset}px` }"
      >
        <div
          ref="headerRef"
          class="masonry-header-wrapper"
          :class="{ 'masonry-header-desktop': !isMobile }"
          :style="headerStyle"
        >
          <MasonryItemHeader
            :stats="photoStats"
            :date-range-text
          />
        </div>

        <!-- Masonry Wall -->
        <MasonryWall
          class="masonry-wall-with-header"
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

.masonry-wall-with-header :deep(.masonry-column:first-child .masonry-item:first-child) {
  margin-top: 0;
}
</style>


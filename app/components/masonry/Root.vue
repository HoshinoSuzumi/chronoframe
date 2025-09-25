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

// 使用筛选和排序功能
const { filteredPhotos, hasActiveFilters } = usePhotoFilters()
const { sortedPhotos } = usePhotoSort()

// 使用筛选后的照片（已包含排序），或者使用排序后的原始照片
const displayPhotos = computed(() => {
  return hasActiveFilters.value ? filteredPhotos.value : sortedPhotos.value
})

// Constants
const FIRST_SCREEN_ITEMS_COUNT = 42
const COLUMN_GAP = 4
const AUTO_COLUMN_WIDTH = 280
const MAX_COLUMN_COUNT = 8
const MIN_COLUMN_COUNT = 2

// Reactive state
const masonryContainer = ref<HTMLElement>()
const containerWidth = ref(0)
const hasAnimated = ref(false)
const showFloatingActions = ref(false)
const dateRange = ref<string>()
const visiblePhotos = ref(new Set<number>())

// Composables
const isMobile = useMediaQuery('(max-width: 768px)')
const { batchProcessLivePhotos } = useLivePhotoProcessor()

// Track processed photos to avoid reprocessing
const processedBatch = ref(new Set<string>())

// Computed
const columnCount = computed(() => {
  if (props.columns === 'auto') {
    if (!containerWidth.value) return MIN_COLUMN_COUNT

    const availableWidth = containerWidth.value - (isMobile.value ? 16 : 32)
    const maxColumns = isMobile.value ? 2 : MAX_COLUMN_COUNT
    const calculatedColumns = Math.floor(
      (availableWidth + COLUMN_GAP) / (AUTO_COLUMN_WIDTH + COLUMN_GAP),
    )

    return Math.min(Math.max(calculatedColumns, MIN_COLUMN_COUNT), maxColumns)
  }

  return props.columns
})

const photoStats = computed(() => {
  const totalPhotos = displayPhotos.value?.length || 0
  const photosWithDates = displayPhotos.value?.filter((p) => p.dateTaken).length || 0
  const photosWithTitles = displayPhotos.value?.filter((p) => p.title).length || 0
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
    .map(index => displayPhotos.value[index])
    .filter((photo): photo is Photo => 
      photo != null && 
      photo.isLivePhoto === 1 && 
      Boolean(photo.livePhotoVideoUrl) &&
      !processedBatch.value.has(photo.id)
    )
  
  if (livePhotosToProcess.length === 0) return
  
  // Mark as processed to avoid reprocessing
  livePhotosToProcess.forEach(photo => {
    processedBatch.value.add(photo.id)
  })
  
  // Start background processing
  batchProcessLivePhotos(livePhotosToProcess.map(photo => ({
    id: photo.id,
    livePhotoVideoUrl: photo.livePhotoVideoUrl!
  })))
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
    visibleCities.value = `${uniqueCities.slice(0, 2).join('、')} 等 ${uniqueCities.length} 个城市`
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

const updateContainerWidth = () => {
  if (masonryContainer.value) {
    containerWidth.value = masonryContainer.value.offsetWidth
  }
}

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showFloatingActions.value = scrollTop > 500
}

// Lifecycle
onMounted(() => {
  updateContainerWidth()

  // Set up resize observer
  const resizeObserver = new ResizeObserver(() => {
    updateContainerWidth()
  })

  if (masonryContainer.value) {
    resizeObserver.observe(masonryContainer.value)
  }

  // Set up scroll listener
  window.addEventListener('scroll', handleScroll, { passive: true })

  // Cleanup
  onUnmounted(() => {
    resizeObserver.disconnect()
    window.removeEventListener('scroll', handleScroll)
  })
})

const { executeTransition } = usePhotoTransition()

const handleOpenViewer = (index: number, transitionData?: any) => {
  const photo = displayPhotos.value[index]
  if (!photo) return

  if (transitionData) {
    // 使用转场动画
    executeTransition(transitionData, index)
  } else {
    // 回退到普通导航
    router.push(`/${photo.id}`)
  }
}
</script>

<template>
  <div class="relative w-full">
    <DateRangeIndicator
      :date-range="dateRange"
      :locations="visibleCities"
      :is-visible="!!dateRange && showFloatingActions"
      :is-mobile="isMobile"
    />

    <!-- 移动端时 HeaderItem 显示在瀑布流容器外 -->
    <div
      v-if="isMobile"
      class="px-1 pt-2 pb-1"
    >
      <MasonryHeaderItem
        :stats="photoStats"
        :date-range-text
      />
    </div>

    <!-- Masonry Container -->
    <div
      class="lg:px-0 lg:pb-0"
      :class="isMobile ? 'px-1 pb-1' : 'p-1'"
    >
      <!-- Masonry Grid -->
      <div
        ref="masonryContainer"
        class="masonry-grid"
        :style="{
          columnCount: columnCount,
          columnGap: `${COLUMN_GAP}px`,
        }"
      >
        <!-- 非移动端时 HeaderItem 显示在瀑布流内 -->
        <MasonryHeaderItem
          v-if="!isMobile"
          :stats="photoStats"
          :date-range-text
        />

        <!-- Photo Items -->
        <MasonryItem
          v-for="(photo, index) in displayPhotos"
          :key="photo.id || index"
          :photo="photo"
          :index="index"
          :has-animated
          :first-screen-items="FIRST_SCREEN_ITEMS_COUNT"
          @visibility-change="handleVisibilityChange"
          @open-viewer="(index, transitionData) => handleOpenViewer(index, transitionData)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.masonry-container {
  position: relative;
  width: 100%;
}

.masonry-grid {
  width: 100%;
  column-fill: balance;
}
</style>

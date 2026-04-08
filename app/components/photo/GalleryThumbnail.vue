<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { motion } from 'motion-v'

interface Props {
  photos: Photo[]
  currentIndex: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  indexChange: [index: number]
}>()

// DOM 引用
const galleryScrollContainer = ref<HTMLDivElement>()
const containerClientWidth = ref(0)

// 响应式断点
const isMobile = useMediaQuery('(max-width: 768px)')

// 缩略图配置
const THUMBNAIL_CONFIG = {
  size: { sm: 48, lg: 64 },
  gap: { sm: 8, lg: 12 },
  padding: { sm: 12, lg: 16 },
} as const

// 计算当前设备的样式配置
const currentThumbnailSize = computed(() =>
  isMobile.value ? THUMBNAIL_CONFIG.size.sm : THUMBNAIL_CONFIG.size.lg,
)

const currentGapSize = computed(() =>
  isMobile.value ? THUMBNAIL_CONFIG.gap.sm : THUMBNAIL_CONFIG.gap.lg,
)

const currentPaddingSize = computed(() =>
  isMobile.value ? THUMBNAIL_CONFIG.padding.sm : THUMBNAIL_CONFIG.padding.lg,
)

// 处理缩略图列表
const thumbnailList = computed(() => {
  return props.photos.map((photo, index) => ({
    ...photo,
    index,
    isActive: index === props.currentIndex,
  }))
})

// 处理缩略图点击
const onThumbnailClick = (index: number) => {
  // 通知父组件索引变化，这会触发 currentIndex 的更新
  // 然后 watch 会自动处理后续的高分辨率图片加载
  emit('indexChange', index)
}

// 容器尺寸管理
const updateContainerSize = () => {
  if (galleryScrollContainer.value) {
    containerClientWidth.value = galleryScrollContainer.value.clientWidth
  }
}

// 滚动到指定的缩略图位置
const scrollToActiveThumbnail = async () => {
  if (!galleryScrollContainer.value) return

  await nextTick()

  const containerWidth = containerClientWidth.value
  const thumbnailSize = currentThumbnailSize.value
  const gapSize = currentGapSize.value

  const thumbnailLeftPosition =
    props.currentIndex * thumbnailSize + gapSize * props.currentIndex
  const targetScrollLeft =
    thumbnailLeftPosition - containerWidth / 2 + thumbnailSize / 2

  galleryScrollContainer.value.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth',
  })
}

// 处理滚轮横向滚动
const onScrollWheel = (event: WheelEvent) => {
  if (!galleryScrollContainer.value) return

  // 阻止默认垂直滚动
  event.preventDefault()

  // 优先使用触控板横向滚动，否则将垂直滚动转为横向
  const deltaAmount =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY

  galleryScrollContainer.value.scrollLeft += deltaAmount
}

onMounted(() => {
  updateContainerSize()

  // 观察容器尺寸变化
  if (galleryScrollContainer.value) {
    const sizeObserver = new ResizeObserver(updateContainerSize)
    sizeObserver.observe(galleryScrollContainer.value)

    // 绑定滚轮事件
    galleryScrollContainer.value.addEventListener('wheel', onScrollWheel, {
      passive: false,
    })

    onUnmounted(() => {
      sizeObserver.disconnect()
      if (galleryScrollContainer.value) {
        galleryScrollContainer.value.removeEventListener('wheel', onScrollWheel)
      }
    })
  }

  setTimeout(() => {
    scrollToActiveThumbnail()
  }, 500)
})

watch(
  () => props.currentIndex,
  (_newIndex, _oldIndex) => {
    scrollToActiveThumbnail()
    // 这里不需要再次 emit，因为索引变化是由外部传入的
    // 只需要确保滚动位置正确即可
  },
  { immediate: true },
)

watch(isMobile, scrollToActiveThumbnail)
</script>

<template>
  <motion.div
    :initial="{ opacity: 0, y: 100 }"
    :animate="{ opacity: 1, y: 0 }"
    :exit="{ opacity: 0, y: 100 }"
    :transition="{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }"
    class="gallery-thumbnail-container bg-black/20 dark:bg-black/30 backdrop-blur-xl border-t border-white/10 shrink-0 z-10"
  >
    <div
      ref="galleryScrollContainer"
      class="gallery-scroll-area overflow-x-auto scrollbar-none flex"
      :style="{
        gap: `${currentGapSize}px`,
        padding: `${currentPaddingSize}px`,
      }"
    >
      <button
        v-for="photo in thumbnailList"
        :key="photo.id"
        type="button"
        class="thumbnail-item relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-200 contain-intrinsic-size"
        :class="{
          'thumbnail-active border-white shadow-lg scale-110': photo.isActive,
          'thumbnail-inactive border-white/20 hover:border-white/40 grayscale-50 hover:grayscale-0':
            !photo.isActive,
        }"
        :style="{
          width: `${currentThumbnailSize}px`,
          height: `${currentThumbnailSize}px`,
        }"
        @click="onThumbnailClick(photo.index)"
      >
        <ThumbHash
          v-if="photo.thumbnailHash"
          :thumbhash="photo.thumbnailHash"
          class="absolute inset-0 w-full h-full"
        />
        <img
          v-if="photo.thumbnailUrl"
          :src="photo.thumbnailUrl"
          :alt="photo.title || 'Photo thumbnail'"
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div
          v-else-if="!photo.thumbnailHash"
          class="absolute inset-0 w-full h-full bg-gray-700 flex items-center justify-center"
        >
          <Icon
            name="tabler:photo"
            class="w-6 h-6 text-gray-400"
          />
        </div>
      </button>
    </div>
  </motion.div>
</template>

<style scoped>
/* 滚动条隐藏 */
.scrollbar-none {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.scrollbar-none::-webkit-scrollbar {
  display: none; /* Webkit browsers */
}

/* 备用滚动条样式（如需要显示时使用） */
.gallery-scroll-area::-webkit-scrollbar {
  height: 6px;
}

.gallery-scroll-area::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.gallery-scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

.gallery-scroll-area::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>

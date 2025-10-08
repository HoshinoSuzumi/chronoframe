<script setup lang="ts">
import { motion, AnimatePresence, useDomRef } from 'motion-v'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Navigation, Keyboard, Virtual } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'

import 'swiper/swiper-bundle.css'

import LoadingIndicator from './LoadingIndicator.vue'
import ProgressiveImage from './ProgressiveImage.vue'
import GalleryThumbnail from './GalleryThumbnail.vue'
import InfoPanel from './InfoPanel.vue'
import ReactionPicker from './ReactionPicker.vue'
import ReactionConfetti from './ReactionConfetti.vue'
import type { LoadingIndicatorRef } from './LoadingIndicator.vue'

interface Props {
  photos: Photo[]
  currentIndex: number
  isOpen: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  indexChange: [index: number]
}>()

const toast = useToast()

const containerRef = ref<HTMLDivElement>()
const swiperRef = ref<SwiperType>()
const loadingIndicatorRef = ref<LoadingIndicatorRef>()

const isImageZoomed = ref(false)
const showExifPanel = ref(false)
const showShareModal = ref(false)
const currentBlobSrc = ref<string | null>(null)
const zoomLevel = ref(0)
const showZoomLevel = ref(false)
const zoomLevelTimer = ref<NodeJS.Timeout | null>(null)

const showReactionPicker = ref(false)
const selectedReaction = ref<string | null>(null)
const reactionCounts = ref<Record<string, number>>({})
const isLoadingReaction = ref(false)
const confettiIcon = ref<string | null>(null)
const confettiTriggerCount = ref(0)

// 表态图标映射
const reactionIcons: Record<string, string> = {
  like: 'fluent-emoji-flat:thumbs-up',
  love: 'fluent-emoji-flat:red-heart',
  amazing: 'fluent-emoji-flat:smiling-face-with-heart-eyes',
  funny: 'fluent-emoji-flat:face-with-tears-of-joy',
  wow: 'fluent-emoji-flat:face-with-open-mouth',
  sad: 'fluent-emoji-flat:crying-face',
  fire: 'fluent-emoji-flat:fire',
  sparkle: 'fluent-emoji-flat:sparkles',
}

const currentReactionIcon = computed(() => {
  return selectedReaction.value ? reactionIcons[selectedReaction.value] : null
})

// 计算总表态数
const totalReactions = computed(() => {
  return Object.values(reactionCounts.value).reduce(
    (sum, count) => sum + count,
    0,
  )
})

// 加载照片表态数据
const loadPhotoReactions = async (photoId: string) => {
  try {
    const data = (await $fetch(`/api/photos/${photoId}/reactions`)) as any
    selectedReaction.value = data.userReaction || null
    reactionCounts.value = data.reactions || {}
  } catch (error) {
    console.error('Failed to load reactions:', error)
  }
}

// LivePhoto state
const isLivePhotoHovering = ref(false)
const isLivePhotoPlaying = ref(false)
const isLivePhotoTouching = ref(false)
const isLivePhotoMuted = ref(true)
const touchCount = ref(0)
const livePhotoVideoBlob = ref<Blob | null>(null)
const livePhotoVideoBlobUrl = ref<string | null>(null)
const livePhotoVideoRef = useDomRef()
const longPressTimer = ref<NodeJS.Timeout | null>(null)

// Import LivePhoto processor
const { convertMovToMp4, getProcessingState } = useLivePhotoProcessor()

// Computed
const currentPhoto = computed(() => props.photos[props.currentIndex])
const isMobile = useMediaQuery('(max-width: 768px)')

// LivePhoto processing state
const livePhotoProcessingState = computed(() => {
  return currentPhoto.value
    ? getProcessingState(currentPhoto.value.id)
    : ref(null)
})

// 当 PhotoViewer 关闭时重置状态
watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      isImageZoomed.value = false
      showExifPanel.value = false
      showShareModal.value = false
      currentBlobSrc.value = null
      zoomLevel.value = 0
      showZoomLevel.value = false

      // Reset reaction state
      showReactionPicker.value = false
      selectedReaction.value = null
      confettiIcon.value = null
      confettiTriggerCount.value = 0

      // Reset LivePhoto state
      isLivePhotoHovering.value = false
      isLivePhotoPlaying.value = false
      isLivePhotoTouching.value = false
      touchCount.value = 0
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }
      if (livePhotoVideoBlobUrl.value) {
        URL.revokeObjectURL(livePhotoVideoBlobUrl.value)
        livePhotoVideoBlobUrl.value = null
      }
      livePhotoVideoBlob.value = null

      if (zoomLevelTimer.value) {
        clearTimeout(zoomLevelTimer.value)
        zoomLevelTimer.value = null
      }
      // TODO: 实现自定义的 ScrollArea 后移除
      document.body.style.overflow = ''
    } else {
      document.body.style.overflow = 'hidden'
      // Process current LivePhoto when viewer opens
      nextTick(() => {
        processCurrentLivePhoto()
      })
    }
  },
  { immediate: true },
)

// 同步 Swiper 的索引
watch(
  () => props.currentIndex,
  (newIndex) => {
    if (swiperRef.value && swiperRef.value.activeIndex !== newIndex) {
      swiperRef.value.slideTo(newIndex, 300)
    }
    // 切换图片时重置缩放状态
    isImageZoomed.value = false
    zoomLevel.value = 0

    // Reset reaction state when switching photos
    showReactionPicker.value = false
    selectedReaction.value = null

    // Reset LivePhoto state when switching photos
    isLivePhotoPlaying.value = false
    isLivePhotoHovering.value = false
    isLivePhotoTouching.value = false
    touchCount.value = 0
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }

    // Process new current LivePhoto
    nextTick(() => {
      processCurrentLivePhoto()
    })
  },
)

// 当图片缩放状态改变时，控制 Swiper 的触摸行为
watch(isImageZoomed, (isZoomed) => {
  if (swiperRef.value) {
    swiperRef.value.allowTouchMove = !isZoomed
  }
})

// Navigation methods
const handlePrevious = () => {
  if (props.currentIndex > 0) {
    emit('indexChange', props.currentIndex - 1)
    swiperRef.value?.slidePrev()
  }
}

const handleNext = () => {
  if (props.currentIndex < props.photos.length - 1) {
    emit('indexChange', props.currentIndex + 1)
    swiperRef.value?.slideNext()
  }
}

// Handle Swiper events
const handleSwiperInit = (swiper: SwiperType) => {
  swiperRef.value = swiper
  swiper.allowTouchMove = !isImageZoomed.value
}

const handleSlideChange = (swiper: SwiperType) => {
  emit('indexChange', swiper.activeIndex)
}

// Handle image events
const handleZoomChange = (isZoomed: boolean, level?: number) => {
  isImageZoomed.value = isZoomed
  if (level !== undefined) {
    zoomLevel.value = level
    // 缩放变化时显示缩放倍率 2 秒
    showZoomLevel.value = true
    if (zoomLevelTimer.value) {
      clearTimeout(zoomLevelTimer.value)
    }
    zoomLevelTimer.value = setTimeout(() => {
      showZoomLevel.value = false
      zoomLevelTimer.value = null
    }, 2000)
  }
}

const handleBlobSrcChange = (blobSrc: string | null) => {
  currentBlobSrc.value = blobSrc
}

const handleImageLoaded = () => {
  // 图片加载完成时显示缩放倍率 2 秒
  showZoomLevel.value = true
  if (zoomLevelTimer.value) {
    clearTimeout(zoomLevelTimer.value)
  }
  zoomLevelTimer.value = setTimeout(() => {
    showZoomLevel.value = false
    zoomLevelTimer.value = null
  }, 2000)
}

// LivePhoto processing and playback functions
const processCurrentLivePhoto = async () => {
  const photo = currentPhoto.value
  if (!photo || !photo.isLivePhoto || !photo.livePhotoVideoUrl) return

  try {
    const blob = await convertMovToMp4(photo.livePhotoVideoUrl, photo.id)
    if (blob) {
      livePhotoVideoBlob.value = blob
      // Clean up previous blob URL
      if (livePhotoVideoBlobUrl.value) {
        URL.revokeObjectURL(livePhotoVideoBlobUrl.value)
      }
      livePhotoVideoBlobUrl.value = URL.createObjectURL(blob)
    }
  } catch (error) {
    console.error('Failed to process LivePhoto in viewer:', error)
  }
}

const playLivePhotoVideo = () => {
  if (!livePhotoVideoRef.value || !livePhotoVideoBlobUrl.value) return

  livePhotoVideoRef.value.currentTime = 0
  isLivePhotoPlaying.value = true

  // Provide haptic feedback on mobile when starting playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(50) // Short vibration for start
  }

  livePhotoVideoRef.value?.play().catch((error: any) => {
    console.warn('Failed to play LivePhoto video in viewer:', error)
    isLivePhotoPlaying.value = false
  })
}

const stopLivePhotoVideo = () => {
  const wasPlaying = isLivePhotoPlaying.value

  if (livePhotoVideoRef.value && !livePhotoVideoRef.value.paused) {
    livePhotoVideoRef.value?.pause()
    livePhotoVideoRef.value.currentTime = 0

    // Provide haptic feedback on mobile when manually stopping playback
    if (isMobile.value && wasPlaying && 'vibrate' in navigator) {
      navigator.vibrate(25) // Very short vibration for manual stop
    }
  }
  isLivePhotoPlaying.value = false
}

const handleLivePhotoMouseEnter = () => {
  if (
    !isMobile.value &&
    currentPhoto.value?.isLivePhoto &&
    livePhotoVideoBlobUrl.value
  ) {
    isLivePhotoHovering.value = true
    playLivePhotoVideo()
  }
}

const handleLivePhotoMouseLeave = () => {
  if (!isMobile.value) {
    isLivePhotoHovering.value = false
    stopLivePhotoVideo()
  }
}

const handleLivePhotoTouchStart = (event: TouchEvent) => {
  if (
    isMobile.value &&
    currentPhoto.value?.isLivePhoto &&
    livePhotoVideoBlobUrl.value
  ) {
    touchCount.value = event.touches.length

    // Only handle single finger touch to avoid conflicts with pinch-to-zoom
    if (event.touches.length === 1) {
      // Check if the touch target is an interactive element (button, etc.)
      const target = event.target as HTMLElement
      const isInteractiveElement =
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.classList.contains('pointer-events-auto')

      // Don't prevent default for interactive elements to allow clicks
      if (!isInteractiveElement) {
        // Prevent browser's default long-press actions (context menu, image save dialog, etc.)
        event.preventDefault()
        isLivePhotoTouching.value = true

        // Set a 500ms timer before starting playback
        longPressTimer.value = setTimeout(() => {
          // Double check: only play if still single touch and touching
          if (
            isLivePhotoTouching.value &&
            touchCount.value === 1 &&
            !isImageZoomed.value
          ) {
            playLivePhotoVideo()
          }
        }, 350)
      }
    }
  }
}

const handleLivePhotoTouchEnd = () => {
  if (isMobile.value) {
    touchCount.value = 0
    isLivePhotoTouching.value = false

    // Clear the long press timer
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }

    // Stop video playback
    stopLivePhotoVideo()
  }
}

const handleLivePhotoTouchMove = (event: TouchEvent) => {
  if (isMobile.value && isLivePhotoTouching.value) {
    touchCount.value = event.touches.length

    // If user adds more fingers (pinch-to-zoom), cancel LivePhoto playback
    if (event.touches.length > 1) {
      isLivePhotoTouching.value = false

      // Clear the long press timer
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }

      // Stop video playback
      stopLivePhotoVideo()
    }
  }
}

const handleLivePhotoVideoEnded = () => {
  // Provide haptic feedback on mobile when ending playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(30) // Shorter vibration for end
  }

  // Video ended naturally, keep it visible but reset to beginning
  if (livePhotoVideoRef.value) {
    livePhotoVideoRef.value.currentTime = 0
  }
}

const clearConfetti = useDebounceFn(() => {
  confettiIcon.value = null
}, 1600)

// Reaction handlers
const handleReactionSelect = async (reactionId: string, iconName: string) => {
  if (!currentPhoto.value) return

  isLoadingReaction.value = true

  try {
    if (selectedReaction.value === reactionId) {
      // 取消表态
      await $fetch(`/api/photos/${currentPhoto.value.id}/reactions`, {
        method: 'DELETE',
      })
      selectedReaction.value = null
      // 减少计数
      if (reactionCounts.value[reactionId]) {
        reactionCounts.value[reactionId]--
      }
    } else {
      // 如果之前有表态，先减少旧表态的计数
      const oldReaction = selectedReaction.value
      if (oldReaction && reactionCounts.value[oldReaction] !== undefined) {
        reactionCounts.value[oldReaction]--
      }

      // 添加或更新表态
      await $fetch(`/api/photos/${currentPhoto.value.id}/reactions`, {
        method: 'POST',
        body: { reactionType: reactionId },
      })

      selectedReaction.value = reactionId
      // 增加计数
      reactionCounts.value[reactionId] =
        (reactionCounts.value[reactionId] || 0) + 1

      // 触发礼花效果
      confettiIcon.value = iconName
      confettiTriggerCount.value++

      // 在动画完成后清除 confetti
      clearConfetti()
    }
  } catch (error: any) {
    console.error('Failed to update reaction:', error)

    // 显示错误提示
    if (error?.statusCode === 429) {
      toast.add({
        icon: 'tabler:alert-circle',
        title: '表态失败',
        description: '操作过于频繁，请稍后再试',
        color: 'warning',
      })
    } else {
      toast.add({
        icon: 'tabler:alert-circle',
        title: '表态失败',
        description: error instanceof Error ? error.message : '未知错误',
        color: 'warning',
      })
    }
  } finally {
    isLoadingReaction.value = false
  }

  showReactionPicker.value = false
}

const toggleReactionPicker = () => {
  showReactionPicker.value = !showReactionPicker.value
}

// 监听当前照片变化，加载表态数据
watch(
  () => currentPhoto.value?.id,
  (newPhotoId) => {
    if (newPhotoId) {
      loadPhotoReactions(newPhotoId)
    }
  },
  { immediate: true },
)

defineShortcuts({
  escape: () => {
    emit('close')
  },
})

// 清理定时器
onUnmounted(() => {
  if (zoomLevelTimer.value) {
    clearTimeout(zoomLevelTimer.value)
    zoomLevelTimer.value = null
  }

  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // Clean up LivePhoto blob URL
  if (livePhotoVideoBlobUrl.value) {
    URL.revokeObjectURL(livePhotoVideoBlobUrl.value)
    livePhotoVideoBlobUrl.value = null
  }
})

// Swiper modules
const swiperModules = [Navigation, Keyboard, Virtual]
</script>

<template>
  <Teleport to="body">
    <!-- 背景层 -->
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-2xl z-50"
        @click="emit('close')"
      />
    </AnimatePresence>

    <!-- 交叉溶解的 Thumbhash 背景 -->
    <AnimatePresence mode="sync">
      <motion.div
        v-if="isOpen && currentPhoto?.thumbnailHash"
        :key="currentPhoto.id"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 z-40"
      >
        <ThumbHash
          :thumbhash="currentPhoto.thumbnailHash"
          class="w-full h-full scale-110"
        />
      </motion.div>
    </AnimatePresence>

    <!-- 主内容区域 -->
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        ref="containerRef"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 z-50 flex items-center justify-center"
        :style="{ touchAction: isMobile ? 'manipulation' : 'none' }"
        @click.self="emit('close')"
      >
        <div
          class="flex w-full h-full"
          :class="isMobile ? 'flex-col' : 'flex-row'"
        >
          <!-- 图片显示区域 -->
          <div class="z-10 flex min-h-0 min-w-0 flex-1 flex-col">
            <div class="group relative flex min-h-0 min-w-0 flex-1">
              <!-- 顶部工具栏 -->
              <motion.div
                :initial="{ opacity: 0 }"
                :animate="{ opacity: 1 }"
                :exit="{ opacity: 0 }"
                :transition="{ duration: 0.3 }"
                class="absolute z-30 flex items-center justify-between"
                :class="
                  isMobile ? 'top-2 right-2 left-2' : 'top-4 right-4 left-4'
                "
              >
                <!-- 左侧工具按钮 -->
                <div class="flex items-center gap-1">
                  <!-- LivePhoto 标志 -->
                  <PhotoLivePhotoIndicator
                    v-if="currentPhoto?.isLivePhoto"
                    :class="isMobile ? 'cursor-default' : 'cursor-pointer'"
                    :photo="currentPhoto"
                    :is-video-playing="isLivePhotoPlaying"
                    :processing-state="livePhotoProcessingState?.value || null"
                    @mouseenter="handleLivePhotoMouseEnter"
                    @mouseleave="handleLivePhotoMouseLeave"
                  />

                  <!-- 静音图标 -->
                  <div
                    v-if="currentPhoto?.isLivePhoto"
                    class="pointer-events-auto backdrop-blur-md bg-black/40 text-white rounded-full p-1 text-[13px] font-bold flex items-center gap-0.5 leading-0 select-none"
                    :class="isMobile ? 'cursor-default' : 'cursor-pointer'"
                    @click="isLivePhotoMuted = !isLivePhotoMuted"
                  >
                    <Icon
                      :name="
                        isLivePhotoMuted ? 'tabler:volume-off' : 'tabler:volume'
                      "
                      class="size-[17px]"
                    />
                  </div>
                </div>

                <!-- 右侧按钮组 -->
                <div class="flex items-center gap-2">
                  <!-- 信息按钮 - 在移动设备上显示 -->
                  <GlassButton
                    v-if="isMobile"
                    icon="tabler:info-circle"
                    :class="
                      !showExifPanel
                        ? ''
                        : 'bg-black/20 hover:bg-black/30 text-white'
                    "
                    size="sm"
                    rounded
                    @click="showExifPanel = !showExifPanel"
                  />

                  <!-- 分享按钮 -->
                  <GlassButton
                    icon="tabler:share-3"
                    size="sm"
                    rounded
                    @click="showShareModal = true"
                  />

                  <!-- 关闭按钮 -->
                  <GlassButton
                    icon="tabler:x"
                    size="sm"
                    rounded
                    @click="emit('close')"
                  />
                </div>
              </motion.div>

              <!-- 加载指示器 -->
              <LoadingIndicator ref="loadingIndicatorRef" />

              <!-- Swiper 容器 -->
              <Swiper
                :modules="swiperModules"
                :space-between="0"
                :slides-per-view="1"
                :initial-slide="currentIndex"
                :virtual="true"
                :keyboard="{
                  enabled: true,
                  onlyInViewport: true,
                }"
                class="h-full w-full"
                :style="{ touchAction: isMobile ? 'pan-x' : 'pan-y' }"
                @swiper="handleSwiperInit"
                @slide-change="handleSlideChange"
              >
                <SwiperSlide
                  v-for="(photo, index) in photos"
                  :key="photo.id"
                  :virtual-index="index"
                  class="flex items-center justify-center"
                >
                  <motion.div
                    :initial="{ opacity: 0.5, scale: 0.95 }"
                    :animate="{ opacity: 1, scale: 1 }"
                    :exit="{ opacity: 0, scale: 0.95 }"
                    :transition="{ type: 'spring', duration: 0.4, bounce: 0 }"
                    class="relative flex h-full w-full items-center justify-center"
                    style="
                      user-select: none;
                      -webkit-user-select: none;
                      -webkit-touch-callout: none;
                      -webkit-tap-highlight-color: transparent;
                    "
                    @touchstart="handleLivePhotoTouchStart"
                    @touchmove="handleLivePhotoTouchMove"
                    @touchend="handleLivePhotoTouchEnd"
                    @touchcancel="handleLivePhotoTouchEnd"
                    @contextmenu.prevent=""
                  >
                    <!-- Main Image -->
                    <ProgressiveImage
                      class="h-full w-full object-contain transition-opacity duration-400"
                      :class="{
                        'opacity-0':
                          isLivePhotoPlaying && currentPhoto?.isLivePhoto,
                      }"
                      :loading-indicator-ref="loadingIndicatorRef || null"
                      :is-current-image="index === currentIndex"
                      :src="photo.originalUrl!"
                      :thumbnail-src="photo.thumbnailUrl!"
                      :alt="photo.title || ''"
                      :width="
                        index === currentIndex
                          ? (currentPhoto?.width ?? undefined)
                          : undefined
                      "
                      :height="
                        index === currentIndex
                          ? (currentPhoto?.height ?? undefined)
                          : undefined
                      "
                      :enable-pan="
                        index === currentIndex
                          ? !isMobile || isImageZoomed
                          : true
                      "
                      :enable-zoom="true"
                      :on-zoom-change="
                        index === currentIndex ? handleZoomChange : undefined
                      "
                      :on-blob-src-change="
                        index === currentIndex ? handleBlobSrcChange : undefined
                      "
                      :on-image-loaded="
                        index === currentIndex ? handleImageLoaded : undefined
                      "
                      :is-live-photo="photo.isLivePhoto === 1"
                      :live-photo-video-url="
                        photo.livePhotoVideoUrl || undefined
                      "
                    />

                    <!-- LivePhoto Video -->
                    <motion.video
                      v-if="
                        photo.isLivePhoto &&
                        index === currentIndex &&
                        livePhotoVideoBlobUrl
                      "
                      :ref="
                        (el) => {
                          if (index === currentIndex) livePhotoVideoRef = el
                        }
                      "
                      :src="livePhotoVideoBlobUrl"
                      class="absolute inset-0 w-full h-full object-contain pointer-events-none select-none touch-none"
                      :muted="isLivePhotoMuted"
                      playsinline
                      preload="metadata"
                      :initial="{ opacity: 0 }"
                      :animate="{
                        opacity: isLivePhotoPlaying ? 1 : 0,
                      }"
                      :transition="{
                        duration: 0.4,
                        ease: [0.25, 0.1, 0.25, 1],
                        delay: isLivePhotoPlaying ? 0.1 : 0,
                      }"
                      @ended="handleLivePhotoVideoEnded"
                      @contextmenu.prevent=""
                    />

                    <!-- 缩放倍率提示 -->
                    <AnimatePresence>
                      <motion.div
                        v-if="showZoomLevel && zoomLevel > 0"
                        :initial="{ opacity: 0, y: 10 }"
                        :animate="{ opacity: 1, y: 0 }"
                        :exit="{ opacity: 0, y: 10 }"
                        :transition="{ duration: 0.2 }"
                        class="absolute bottom-4 left-4 z-20 bg-black/40 backdrop-blur-3xl rounded-xl border border-white/10 px-4 py-2 shadow-2xl"
                      >
                        <span class="text-white font-medium"
                          >{{ zoomLevel }}x</span
                        >
                      </motion.div>
                    </AnimatePresence>

                    <!-- 操作提示 -->
                    <AnimatePresence>
                      <motion.div
                        v-if="!isImageZoomed && !isLivePhotoPlaying"
                        :initial="{ opacity: 0, scale: 0.95 }"
                        :animate="{ opacity: 0.6, scale: 1 }"
                        :exit="{ opacity: 0, scale: 0.95 }"
                        :transition="{ duration: 0.2 }"
                        class="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 bg-black/50 rounded-lg border border-white/10 px-2 py-1 shadow-2xl text-white text-xs font-bold"
                      >
                        <span v-if="currentPhoto?.isLivePhoto && isMobile">
                          {{ $t('viewer.hint.livePhoto.mobile') }}
                        </span>
                        <span
                          v-else-if="currentPhoto?.isLivePhoto && !isMobile"
                        >
                          {{ $t('viewer.hint.livePhoto.desktop') }}
                        </span>
                        <span v-else>
                          {{
                            isMobile
                              ? $t('viewer.hint.mobile')
                              : $t('viewer.hint.desktop')
                          }}
                        </span>
                      </motion.div>
                    </AnimatePresence>

                    <!-- 表态按钮 -->
                    <AnimatePresence>
                      <motion.div
                        v-if="!isImageZoomed && !isLivePhotoPlaying"
                        :initial="{ opacity: 0, scale: 0.8, y: 20 }"
                        :animate="{ opacity: 1, scale: 1, y: 0 }"
                        :exit="{ opacity: 0, scale: 0.8, y: 20 }"
                        :transition="{
                          type: 'spring',
                          stiffness: 300,
                          damping: 20,
                          delay: 0.1,
                        }"
                        class="absolute bottom-4 right-4 z-20"
                      >
                        <div class="relative">
                          <!-- 表态选择器 -->
                          <ReactionPicker
                            :is-open="showReactionPicker"
                            :selected-reaction="selectedReaction"
                            :reaction-counts="reactionCounts"
                            @select="handleReactionSelect"
                            @close="showReactionPicker = false"
                          />

                          <!-- 礼花效果 -->
                          <ReactionConfetti
                            v-if="confettiIcon"
                            :icon-name="confettiIcon"
                            :trigger-count="confettiTriggerCount"
                          />

                          <!-- 表态按钮 -->
                          <motion.button
                            type="button"
                            :initial="{ scale: 0.8, opacity: 0 }"
                            :animate="{
                              scale: showReactionPicker ? 0.92 : 1,
                              opacity: 1,
                              transition: showReactionPicker
                                ? { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
                                : {
                                    type: 'spring',
                                    stiffness: 300,
                                    damping: 25,
                                    mass: 0.8,
                                  },
                            }"
                            :while-hover="{
                              scale: showReactionPicker ? 0.95 : 1.05,
                            }"
                            :while-tap="{ scale: 0.88 }"
                            :class="[
                              'pointer-events-auto flex items-center justify-center gap-2 cursor-pointer',
                              'px-4 h-11 rounded-full',
                              'backdrop-blur-xl border shadow-lg',
                              'transition-all duration-200',
                              selectedReaction
                                ? 'bg-blue-500/90 border-blue-400/50 text-white shadow-blue-500/30'
                                : 'bg-white/90 dark:bg-neutral-800/90 border-neutral-200/50 dark:border-white/10 text-neutral-700 dark:text-white/80 shadow-black/10 dark:shadow-black/30',
                              'hover:shadow-xl',
                            ]"
                            @click="toggleReactionPicker"
                          >
                            <Icon
                              v-if="selectedReaction && currentReactionIcon"
                              :name="currentReactionIcon"
                              class="text-xl leading-none select-none"
                            />
                            <Icon
                              v-else
                              name="tabler:mood-smile"
                              class="text-xl"
                            />
                            <div class="flex flex-col items-start gap-0.5">
                              <span class="text-sm font-medium leading-none">
                                {{
                                  selectedReaction
                                    ? $t('viewer.reaction.change')
                                    : $t('viewer.reaction.add')
                                }}
                              </span>
                              <span
                                v-if="totalReactions > 0"
                                class="text-[10px] leading-none opacity-70"
                              >
                                {{
                                  $t(
                                    'viewer.reaction.count',
                                    { count: totalReactions },
                                    totalReactions,
                                  )
                                }}
                              </span>
                            </div>
                          </motion.button>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                </SwiperSlide>
              </Swiper>

              <!-- 自定义导航按钮 (桌面端) -->
              <template v-if="!isMobile">
                <button
                  v-if="currentIndex > 0"
                  type="button"
                  class="absolute top-1/2 left-4 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 backdrop-blur-sm duration-200 group-hover:opacity-100 bg-black/30 hover:bg-black/40"
                  @click="handlePrevious"
                >
                  <Icon
                    name="tabler:chevron-left"
                    class="text-xl cursor-pointer"
                  />
                </button>

                <button
                  v-if="currentIndex < photos.length - 1"
                  type="button"
                  class="absolute top-1/2 right-4 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 backdrop-blur-sm duration-200 group-hover:opacity-100 bg-black/30 hover:bg-black/40"
                  @click="handleNext"
                >
                  <Icon
                    name="tabler:chevron-right"
                    class="text-xl cursor-pointer"
                  />
                </button>
              </template>
            </div>

            <!-- 缩略图导航 -->
            <GalleryThumbnail
              :current-index="currentIndex"
              :photos="photos"
              @index-change="emit('indexChange', $event)"
            />
          </div>

          <!-- EXIF 面板 - 在桌面端始终显示，在移动端根据状态显示 -->
          <AnimatePresence v-if="isMobile">
            <InfoPanel
              v-if="showExifPanel && currentPhoto"
              :current-photo="currentPhoto"
              :exif-data="currentPhoto?.exif"
              :on-close="() => (showExifPanel = false)"
            />
          </AnimatePresence>
          <InfoPanel
            v-else-if="currentPhoto"
            :current-photo="currentPhoto"
            :exif-data="currentPhoto?.exif"
          />
        </div>
      </motion.div>
    </AnimatePresence>

    <!-- Share Modal -->
    <PhotoShareModal
      v-if="currentPhoto"
      :is-open="showShareModal"
      :photo="currentPhoto"
      @close="showShareModal = false"
    />
  </Teleport>
</template>

<style scoped>
/* Swiper 样式调整 */
.swiper {
  width: 100%;
  height: 100%;
}

.swiper-slide {
  text-align: center;
  font-size: 18px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>

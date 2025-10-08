<script setup lang="ts">
import { formatCameraInfo } from '~/utils/camera'
import { motion, useDomRef } from 'motion-v'

interface Props {
  photo: Photo
  index: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'visibility-change': [
    { index: number; isVisible: boolean; date: string | Date },
  ]
  openViewer: [number]
}>()

const { gtag } = useGtag()

const isLoading = ref(true)
const photoRef = ref<HTMLElement>()
const videoRef = useDomRef()
const isVisible = ref(false)
const containerWidth = ref(0)

const isHovering = ref(false)
const isVideoPlaying = ref(false)
const isVideoLoaded = ref(false)
const videoBlob = ref<Blob | null>(null)
const videoBlobUrl = ref<string | null>(null)
const { convertMovToMp4, getProcessingState } = useLivePhotoProcessor()

const isTouching = ref(false)
const touchCount = ref(0)
const longPressTimer = ref<NodeJS.Timeout | null>(null)
const initialTouchPos = ref<{ x: number; y: number } | null>(null)
const isMobile = useMediaQuery('(max-width: 768px)')

const resizeObserverRef = ref<ResizeObserver | null>(null)
const intersectionObserverRef = ref<IntersectionObserver | null>(null)

const processingState = getProcessingState(props.photo.id)

const aspectRatio = computed(() => {
  // Priority 1: Use aspectRatio from photo data if available
  if (props.photo.aspectRatio) {
    return props.photo.aspectRatio
  }

  // Priority 2: Calculate from width and height if available
  if (props.photo.width && props.photo.height) {
    return props.photo.height / props.photo.width
  }

  // Fallback: Default aspect ratio
  return 1.2
})

// Show info overlay only when not playing video or video has finished
const shouldShowInfoOverlay = computed(() => {
  if (!props.photo.isLivePhoto) return true

  // On mobile, don't show overlay when touching or playing video
  if (isMobile.value) {
    if (isTouching.value || isVideoPlaying.value) return false
    return true
  }

  // On desktop, show overlay when hovering but not playing video
  if (!isHovering.value) return true
  if (isVideoPlaying.value) return false
  return isVideoLoaded.value
})

// Methods
const handleImageLoad = () => {
  isLoading.value = false
}

const handleImageError = () => {
  isLoading.value = false
  console.warn(`Failed to load image: ${props.photo.thumbnailUrl}`)
}

// LivePhoto video handling - 优化的交互逻辑
const handleMouseEnter = async () => {
  // Skip mouse events on mobile devices
  if (isMobile.value) return

  isHovering.value = true

  if (!props.photo.isLivePhoto || !props.photo.livePhotoVideoUrl) return

  // 如果视频已准备好，立即播放
  if (videoBlob.value && videoBlobUrl.value && isVideoLoaded.value) {
    playLivePhotoVideo()
  } else if (!processingState.value?.isProcessing) {
    // 如果视频还未处理，立即开始处理
    processLivePhotoWhenVisible()
  }
}

const handleMouseLeave = () => {
  // Skip mouse events on mobile devices
  if (isMobile.value) return

  isHovering.value = false
  if (videoRef.value && !videoRef.value.paused) {
    videoRef.value.pause()
    videoRef.value.currentTime = 0
  }

  // Use a slight delay for smoother transition when mouse leaves
  setTimeout(() => {
    if (!isHovering.value && !isTouching.value) {
      // Also check touching state
      isVideoPlaying.value = false
    }
  }, 150)
}

const playLivePhotoVideo = () => {
  if (!videoRef.value || !videoBlobUrl.value) return

  // 预加载视频以确保流畅播放
  if (videoRef.value.readyState < 2) {
    videoRef.value.load()
  }

  // 确保视频从头开始播放
  videoRef.value.currentTime = 0

  // 添加播放前的准备动画
  isVideoPlaying.value = true

  // Provide haptic feedback on mobile when starting playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(50) // Short vibration for start
  }

  // 延迟播放以确保动画状态已设置
  nextTick(() => {
    if (!videoRef.value || !isVideoPlaying.value) return

    // 设置视频播放属性
    videoRef.value.muted = true // 确保静音播放
    videoRef.value.playsInline = true

    // 立即尝试播放，使用更好的错误处理
    const playPromise = videoRef.value.play()

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // 播放成功，确保状态正确
          if (videoRef.value && !videoRef.value.paused) {
            // 视频播放成功，状态已正确设置
          }
        })
        .catch((error: any) => {
          console.warn('Failed to play LivePhoto video:', error)
          isVideoPlaying.value = false

          // 如果是因为用户交互策略导致的失败，尝试重新加载
          if (error.name === 'NotAllowedError') {
            console.log('Video play blocked by browser policy, retrying...')
            if (videoRef.value) {
              videoRef.value.load()
              setTimeout(() => {
                if (videoRef.value && isVideoPlaying.value) {
                  const retryPromise = videoRef.value.play()
                  if (retryPromise !== undefined) {
                    retryPromise.catch(() => {
                      isVideoPlaying.value = false
                    })
                  }
                }
              }, 100)
            }
          }
        })
    }
  })
}

const handleVideoEnded = () => {
  // Provide haptic feedback on mobile when ending playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(30) // Shorter vibration for end
  }

  // Add a small delay before hiding video to make the transition smoother
  setTimeout(() => {
    isVideoPlaying.value = false
  }, 100)
}

// Mobile touch handlers for LivePhoto
const handleTouchStart = (event: TouchEvent) => {
  if (!isMobile.value || !props.photo.isLivePhoto || !videoBlobUrl.value) return

  touchCount.value = event.touches.length

  // Only handle single finger touch to avoid conflicts with pinch-to-zoom and scrolling
  if (event.touches.length === 1) {
    const touch = event.touches[0]
    if (touch) {
      initialTouchPos.value = { x: touch.clientX, y: touch.clientY }
      isTouching.value = true

      // Set a timer for long press (350ms)
      longPressTimer.value = setTimeout(() => {
        // Double check: only play if still single touch and touching
        if (isTouching.value && touchCount.value === 1) {
          playLivePhotoVideo()
        }
      }, 350)
    }
  }
}

const handleTouchMove = (event: TouchEvent) => {
  if (!isMobile.value || !isTouching.value || !initialTouchPos.value) return

  touchCount.value = event.touches.length

  // If user adds more fingers, cancel LivePhoto playback
  if (event.touches.length > 1) {
    cancelLivePhotoTouch()
    return
  }

  // Check if user is moving finger significantly (scrolling intent)
  const touch = event.touches[0]
  if (touch) {
    const deltaX = Math.abs(touch.clientX - initialTouchPos.value.x)
    const deltaY = Math.abs(touch.clientY - initialTouchPos.value.y)
    const threshold = 10 // pixels

    // If movement exceeds threshold, cancel LivePhoto and allow scrolling
    if (deltaX > threshold || deltaY > threshold) {
      cancelLivePhotoTouch()
    }
  }
}

const handleTouchEnd = () => {
  if (!isMobile.value) return

  cancelLivePhotoTouch()
}

const cancelLivePhotoTouch = () => {
  const wasPlaying = isVideoPlaying.value

  touchCount.value = 0
  isTouching.value = false
  initialTouchPos.value = null

  // Clear the long press timer
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // Stop video playback
  if (videoRef.value && !videoRef.value.paused) {
    videoRef.value.pause()
    videoRef.value.currentTime = 0

    // Provide haptic feedback on mobile when manually stopping playback
    if (isMobile.value && wasPlaying && 'vibrate' in navigator) {
      navigator.vibrate(25) // Very short vibration for manual stop
    }
  }

  // Use a slight delay for smoother transition
  setTimeout(() => {
    if (!isTouching.value && !isHovering.value) {
      isVideoPlaying.value = false
    }
  }, 150)
}

// Handle click events - prevent opening viewer when video is playing
const handleClick = (event: Event) => {
  // On mobile, if video is playing or user is touching, don't open the viewer
  if (isMobile.value && (isVideoPlaying.value || isTouching.value)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // Track photo view event in Google Analytics
  gtag('event', 'photo_view', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    has_live_photo: props.photo.isLivePhoto ? 'yes' : 'no',
  })

  // On desktop, always allow opening the viewer
  // Otherwise, open the viewer
  emit('openViewer', props.index)
}

// 智能LivePhoto处理：基于可见性和用户行为
const processLivePhotoWhenVisible = async () => {
  if (
    !props.photo.isLivePhoto ||
    !props.photo.livePhotoVideoUrl ||
    !isVisible.value
  )
    return

  try {
    // 使用优化的转换函数，支持重试和缓存
    const blob = await convertMovToMp4(
      props.photo.livePhotoVideoUrl,
      props.photo.id,
    )

    if (blob) {
      videoBlob.value = blob
      // Clean up previous blob URL
      if (videoBlobUrl.value) {
        URL.revokeObjectURL(videoBlobUrl.value)
      }
      videoBlobUrl.value = URL.createObjectURL(blob)
      isVideoLoaded.value = true

      // 预热视频元素以提高播放性能
      if (videoRef.value) {
        videoRef.value.load()
      }
    }
  } catch (error) {
    console.error('Failed to process LivePhoto:', error)
    // 错误状态会通过processingState反映出来
  }
}

const formatExposureTime = (
  exposureTime: string | number | undefined,
): string => {
  if (!exposureTime) return ''

  let seconds: number

  // Handle different input formats
  if (typeof exposureTime === 'string') {
    // Try to parse fraction format like "1/60"
    if (exposureTime.includes('/')) {
      const parts = exposureTime.split('/')
      if (parts.length === 2 && parts[0] && parts[1]) {
        const numerator = parseFloat(parts[0])
        const denominator = parseFloat(parts[1])
        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
          seconds = numerator / denominator
        } else {
          return exposureTime // Return original if can't parse
        }
      } else {
        return exposureTime // Return original if format is unexpected
      }
    } else {
      // Try to parse as decimal
      seconds = parseFloat(exposureTime)
      if (isNaN(seconds)) {
        return exposureTime // Return original if can't parse
      }
    }
  } else {
    seconds = exposureTime
  }

  // Convert to fraction format
  if (seconds >= 1) {
    // For exposures 1 second or longer, show as decimal with "s"
    return `${seconds}s`
  } else {
    // For fast exposures, convert to 1/x format
    const denominator = Math.round(1 / seconds)
    return `1/${denominator}`
  }
}

// Preload image on mount to get dimensions
onMounted(() => {
  // Get container width
  nextTick(() => {
    if (photoRef.value) {
      containerWidth.value = photoRef.value.offsetWidth

      // Set up resize observer to track width changes
      const resizeObserver = new ResizeObserver(() => {
        if (photoRef.value) {
          containerWidth.value = photoRef.value.offsetWidth
        }
      })
      resizeObserver.observe(photoRef.value)
      resizeObserverRef.value = resizeObserver
    }
  })

  // Preload thumbnail image
  if (props.photo.thumbnailUrl) {
    const img = new Image()
    img.onload = () => {
      // Update loading state after preload completes
      isLoading.value = false
    }
    img.onerror = () => {
      // Even if preload fails, we should stop loading state
      isLoading.value = false
    }
    img.src = props.photo.thumbnailUrl
  } else {
    // If no thumbnail URL, stop loading immediately
    isLoading.value = false
  }

  // Set up intersection observer for visibility tracking
  nextTick(() => {
    if (photoRef.value) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const newVisibility = entry.isIntersecting
            if (newVisibility !== isVisible.value) {
              isVisible.value = newVisibility
              emit('visibility-change', {
                index: props.index,
                isVisible: newVisibility,
                date: props.photo.dateTaken || new Date().toISOString(),
              })

              // Process LivePhoto when it becomes visible
              if (newVisibility) {
                nextTick(() => {
                  processLivePhotoWhenVisible()
                })
              }
            }
          })
        },
        {
          threshold: 0.1, // Trigger when 10% of the item is visible
          rootMargin: '50px 0px 50px 0px', // Add some margin for smoother transitions
        },
      )

      observer.observe(photoRef.value)
      intersectionObserverRef.value = observer
    }
  })
})

// Cleanup observers on unmount
onUnmounted(() => {
  if (resizeObserverRef.value) {
    resizeObserverRef.value.disconnect()
  }
  if (intersectionObserverRef.value) {
    intersectionObserverRef.value.disconnect()
  }

  // Clean up touch timer
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // Clean up video blob URL
  if (videoBlobUrl.value) {
    URL.revokeObjectURL(videoBlobUrl.value)
  }
})
</script>

<template>
  <div
    ref="photoRef"
    class="w-full transition-all duration-300 cursor-pointer select-none"
    :style="{
      transform: 'translateZ(0)',
    }"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
    @contextmenu.prevent=""
  >
    <div class="relative group overflow-hidden transition-all duration-300 rounded-lg">
      <!-- Container with fixed aspect ratio -->
      <div
        class="w-full relative"
        :style="{ aspectRatio }"
      >
        <ThumbImage
          :src="photo.thumbnailUrl || ''"
          :alt="photo.title || 'Photo thumbnail'"
          :thumbhash="photo.thumbnailHash || ''"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          @load="handleImageLoad"
          @error="handleImageError"
        />

        <!-- LivePhoto video with enhanced motion transition -->
        <motion.video
          v-if="photo.isLivePhoto && videoBlobUrl"
          ref="videoRef"
          :src="videoBlobUrl"
          class="absolute inset-0 w-full h-full object-cover"
          :class="{ 'select-none pointer-events-none': isVideoPlaying }"
          muted
          playsinline
          preload="metadata"
          :initial="{
            opacity: 0,
            scale: 1.02,
          }"
          :animate="{
            opacity: isVideoPlaying ? 1 : 0,
            scale: isVideoPlaying ? 1 : 1.02,
          }"
          :transition="{
            duration: isVideoPlaying ? 0.3 : 0.2,
            ease: isVideoPlaying
              ? [0.23, 1, 0.32, 1]
              : [0.25, 0.46, 0.45, 0.94],
            delay: isVideoPlaying ? 0.05 : 0,
          }"
          @ended="handleVideoEnded"
          @loadeddata="
            () => {
              // 视频加载完成后预热
              if (videoRef && !isVideoPlaying) {
                videoRef.currentTime = 0.1
                videoRef.pause()
              }
            }
          "
        />
      </div>

      <!-- Overlay -->
      <div
        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"
      />

      <!-- Live Photo indicator -->
      <PhotoLivePhotoIndicator
        v-if="photo.isLivePhoto"
        class="absolute top-2 left-2"
        :photo="photo"
        :is-video-playing="isVideoPlaying"
        :processing-state="processingState || null"
      />

      <!-- Photo info overlay (bottom) -->
      <motion.div
        v-show="shouldShowInfoOverlay"
        class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3"
        :initial="{ y: '100%', opacity: 0 }"
        :animate="{
          y: shouldShowInfoOverlay && isHovering && !isMobile ? 0 : '100%',
          opacity: shouldShowInfoOverlay && isHovering && !isMobile ? 1 : 0,
        }"
        :transition="{
          duration: 0.3,
          ease: [0.25, 0.1, 0.25, 1],
        }"
      >
        <div class="text-white flex flex-col gap-1">
          <div class="flex flex-col">
            <p
              v-if="photo.title"
              class="text-base font-medium text-ellipsis line-clamp-2"
            >
              {{ photo.title }}
            </p>
            <p
              v-if="photo.description"
              class="text-xs opacity-80"
            >
              {{ photo.description }}
            </p>
            <p
              v-if="photo.dateTaken"
              class="text-xs font-medium opacity-80"
            >
              {{ $dayjs(photo.dateTaken).format('YYYY-MM-DD') }}
            </p>
          </div>
          <div
            v-if="photo.tags?.length"
            class="mt-1 flex items-center gap-1"
          >
            <UBadge
              v-for="tag in photo.tags"
              :key="tag"
              size="sm"
              color="neutral"
              class="bg-white/20 text-white/80 backdrop-blur-3xl"
            >
              {{ tag }}
            </UBadge>
          </div>
          <div>
            <!-- Camera info from EXIF if available -->
            <div
              v-if="photo.exif && (photo.exif.Make || photo.exif.Model)"
              class="text-sm opacity-70 mt-1 flex items-center gap-1"
            >
              <Icon name="tabler:camera" />
              <span class="text-xs font-medium text-ellipsis line-clamp-1">
                {{ formatCameraInfo(photo.exif.Make, photo.exif.Model) }}
              </span>
            </div>
            <!-- Photo specs from EXIF -->
            <div
              v-if="
                photo.exif &&
                (photo.exif.FNumber ||
                  photo.exif.ExposureTime ||
                  photo.exif.ISO)
              "
              class="text-sm opacity-70 mt-1 flex gap-2"
            >
              <div
                v-if="photo.exif.FocalLengthIn35mmFormat"
                class="flex items-center gap-0.5"
              >
                <Icon
                  name="streamline:image-accessories-lenses-photos-camera-shutter-picture-photography-pictures-photo-lens"
                  class="-mt-0.5"
                />
                <span class="text-xs font-medium">
                  {{ photo.exif.FocalLengthIn35mmFormat }}
                </span>
              </div>
              <div
                v-if="photo.exif.FNumber"
                class="flex items-center gap-0.5"
              >
                <Icon
                  name="tabler:aperture"
                  class="-mt-0.5"
                />
                <span class="text-xs font-medium">
                  f/{{ photo.exif.FNumber }}
                </span>
              </div>
              <div
                v-if="photo.exif.ExposureTime"
                class="flex items-center gap-0.5"
              >
                <Icon
                  name="material-symbols:shutter-speed"
                  class="-mt-0.5"
                />
                <span class="text-xs font-medium">
                  {{ formatExposureTime(photo.exif.ExposureTime) }}
                </span>
              </div>
              <div
                v-if="photo.exif.ISO"
                class="flex items-center gap-0.5"
              >
                <Icon
                  name="carbon:iso-outline"
                  class="-mt-0.5"
                />
                <span class="text-xs font-medium">{{ photo.exif.ISO }}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  </div>
</template>

<style scoped></style>

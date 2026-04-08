<script lang="ts" setup>
import { twMerge } from 'tailwind-merge'
import {
  calculateHistogramCompressed,
  drawHistogramToCanvas,
  type HistogramDataCompressed,
} from '~/libs/histogram'

const props = defineProps<{
  thumbnailUrl: string
  options?: Parameters<typeof drawHistogramToCanvas>[2]
  class?: string
}>()

const canvasRef = useTemplateRef('canvasRef')
const isLoading = ref(true)
const isError = ref(false)
const histogramData = ref<HistogramDataCompressed | null>(null)

// 跟踪当前加载的缩略图，以便在切换时打断加载
let currentImage: HTMLImageElement | null = null

// 清理当前正在加载的缩略图
const cleanup = () => {
  if (currentImage) {
    currentImage.onload = null
    currentImage.onerror = null
    currentImage.src = '' // 取消缩略图加载
    currentImage = null
  }
}

watchEffect(() => {
  isLoading.value = true
  isError.value = false
  histogramData.value = null

  // 如果有正在加载的缩略图，打断
  cleanup()

  const img = new Image()
  currentImage = img
  img.crossOrigin = 'anonymous'

  const url = new URL(props.thumbnailUrl, window.location.origin)
  url.searchParams.set('_cors', Date.now().toString())
  img.src = url.toString()

  img.onload = () => {
    // 检查这是否还是当前的缩略图
    if (img !== currentImage) {
      return
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      isError.value = true
      isLoading.value = false
      return
    }

    const scale = 360 / Math.max(img.width, img.height)
    const [w, h] = [
      Math.floor(img.width * scale),
      Math.floor(img.height * scale),
    ]
    canvas.width = w
    canvas.height = h
    ctx.drawImage(img, 0, 0, w, h)

    try {
      const imageData = ctx.getImageData(0, 0, w, h)
      histogramData.value = calculateHistogramCompressed(imageData)
    } catch (e) {
      isError.value = true
      console.error('Failed to calculate histogram', e)
    } finally {
      isLoading.value = false
      currentImage = null
    }
  }

  img.onerror = () => {
    // 检查这是否还是当前的缩略图
    if (img !== currentImage) {
      return
    }
    isError.value = true
    isLoading.value = false
    currentImage = null
  }
})

watchEffect(() => {
  if (histogramData.value && canvasRef.value) {
    drawHistogramToCanvas(canvasRef.value, histogramData.value, props.options)
  }
})

// 组件卸载时清理正在加载的缩略图
onUnmounted(cleanup)
</script>

<template>
  <div
    :class="twMerge('relative w-full h-32 group overflow-hidden', $props.class)"
  >
    <Transition name="fade">
      <div
        v-if="isLoading"
        class="absolute inset-0 bg-neutral-900/50 flex flex-col gap-2 items-center justify-center rounded-lg backdrop-blur-xl z-10 text-white"
      >
        <Icon
          name="tabler:loader"
          class="text-xl animate-spin"
        />
        <span class="text-xs font-medium">Rendering</span>
      </div>
    </Transition>
    <Transition name="fade">
      <div
        v-if="isError"
        class="absolute inset-0 bg-neutral-900/50 flex flex-col gap-2 items-center justify-center rounded-lg backdrop-blur-xl z-10 text-white"
      >
        <Icon
          name="tabler:alert-triangle"
          class="text-xl"
        />
        <span class="text-xs font-medium">直方图加载失败</span>
      </div>
    </Transition>
    <Transition name="fade">
      <canvas
        v-if="histogramData"
        ref="canvasRef"
        class="w-full h-full rounded-lg backdrop-blur-xl"
      />
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  @apply transition-all duration-150;
}

.fade-enter-from,
.fade-leave-to {
  @apply opacity-0;
}
</style>

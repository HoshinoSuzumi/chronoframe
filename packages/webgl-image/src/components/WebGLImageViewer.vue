<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'

import { DEFAULT_CONFIG } from '../constants'
import { WebGLImageViewerEngine } from '../core/WebGLImageViewerEngine'
import { checkWebGLSupport } from '../core/utils'
import DebugInfoComponent from './DebugInfo.vue'
import type {
  WebGLImageViewerEmits,
  WebGLImageViewerProps,
  DebugInfo,
  EngineConfig,
  LoadingState,
  WebGLImageViewerRef,
} from '@/types'

// Props & Emits
const props = withDefaults(defineProps<WebGLImageViewerProps>(), {
  initialScale: 1,
  minScale: 0.1,
  maxScale: 10,
  centerOnInit: true,
  debug: false,
  limitToBounds: true,
  smooth: true,
  wheel: () => ({ step: 0.1 }),
  pinch: () => ({ step: 0.5 }),
  doubleClick: () => ({
    step: 2,
    mode: 'toggle' as const,
    animationTime: 200,
  }),
  panning: () => ({ velocityDisabled: true }),
  alignmentAnimation: () => ({
    duration: 300,
    easing: (t: number) => 1 - Math.pow(1 - t, 4), // easeOutQuart
  }),
  velocityAnimation: () => ({
    duration: 400,
    easing: (t: number) => 1 - Math.pow(1 - t, 3), // easeOutCubic
  }),
  tile: () => ({
    enabled: true,
    size: DEFAULT_CONFIG.tileSize,
  }),
})

const emit = defineEmits<WebGLImageViewerEmits>()

// Refs
const canvasRef = ref<HTMLCanvasElement>()
const engine = ref<WebGLImageViewerEngine>()
const debugInfo = ref<DebugInfo | null>(null)
const error = ref<string>('')

// Computed
const config = computed<EngineConfig>(() => ({
  ...DEFAULT_CONFIG,
  initialScale: props.initialScale,
  minScale: props.minScale,
  maxScale: props.maxScale,
  centerOnInit: props.centerOnInit,
  debug: props.debug,
  limitToBounds: props.limitToBounds,
  smooth: props.smooth,
  wheelStep: props.wheel?.step ?? DEFAULT_CONFIG.wheelStep,
  wheelDisabled: props.wheel?.wheelDisabled ?? DEFAULT_CONFIG.wheelDisabled,
  touchPadDisabled:
    props.wheel?.touchPadDisabled ?? DEFAULT_CONFIG.touchPadDisabled,
  pinchStep: props.pinch?.step ?? DEFAULT_CONFIG.pinchStep,
  pinchDisabled: props.pinch?.disabled ?? DEFAULT_CONFIG.pinchDisabled,
  doubleClickStep: props.doubleClick?.step ?? DEFAULT_CONFIG.doubleClickStep,
  doubleClickMode: props.doubleClick?.mode ?? DEFAULT_CONFIG.doubleClickMode,
  doubleClickDisabled:
    props.doubleClick?.disabled ?? DEFAULT_CONFIG.doubleClickDisabled,
  animationTime:
    props.doubleClick?.animationTime ?? DEFAULT_CONFIG.animationTime,
  panningDisabled: props.panning?.disabled ?? DEFAULT_CONFIG.panningDisabled,
  velocityDisabled:
    props.panning?.velocityDisabled ?? DEFAULT_CONFIG.velocityDisabled,
  tileEnabled: props.tile?.enabled ?? DEFAULT_CONFIG.tileEnabled,
  tileSize: props.tile?.size ?? DEFAULT_CONFIG.tileSize,
  alignmentAnimation: {
    ...DEFAULT_CONFIG.alignmentAnimation,
    ...props.alignmentAnimation,
  },
  velocityAnimation: {
    ...DEFAULT_CONFIG.velocityAnimation,
    ...props.velocityAnimation,
  },
}))

// Methods
const initEngine = async (): Promise<void> => {
  if (!canvasRef.value) {
    throw new Error('Canvas not available')
  }

  if (!checkWebGLSupport()) {
    throw new Error('WebGL not supported')
  }

  try {
    engine.value = new WebGLImageViewerEngine(canvasRef.value, config.value)

    engine.value.setCallbacks({
      onZoomChange: (originalScale: number, relativeScale: number) => {
        emit('zoomChange', originalScale, relativeScale)

        // 更新调试信息
        if (config.value.debug) {
          updateDebugInfo()
        }
      },
      onImageCopied: () => {
        emit('imageCopied')
      },
      onLoadingStateChange: (
        isLoading: boolean,
        state?: LoadingState,
        quality?: 'high' | 'medium' | 'low' | 'unknown',
      ) => {
        emit('loadingStateChange', isLoading, state, quality)
      },
      onTransformChange: (_transform) => {
        // 在任何变换变化时更新调试信息
        if (config.value.debug) {
          updateDebugInfo()
        }
      },
    })

    // 加载图片
    if (props.src) {
      await engine.value.loadImage(props.src)

      // 初始化调试信息
      if (config.value.debug) {
        updateDebugInfo()
      }
    }
  } catch (err) {
    console.error('Failed to initialize WebGL engine:', err)
    error.value = err instanceof Error ? err.message : 'Unknown error'
    throw err
  }
}

const updateDebugInfo = (): void => {
  if (engine.value) {
    debugInfo.value = engine.value.getDebugInfo()
  }
}

const handleError = (event: Event): void => {
  console.error('Canvas error:', event)
  error.value = 'Canvas error occurred'
}

// 公共方法 (通过 defineExpose 暴露)
const zoomIn = (animate = false): void => {
  engine.value?.zoomIn(animate)
}

const zoomOut = (animate = false): void => {
  engine.value?.zoomOut(animate)
}

const resetView = (): void => {
  engine.value?.resetView()
}

const getScale = (): number => {
  return engine.value?.getScale() ?? 1
}

const getRelativeScale = (): number => {
  return engine.value?.getRelativeScale() ?? 1
}

const copyToClipboard = async (): Promise<void> => {
  if (!engine.value) {
    throw new Error('Engine not initialized')
  }
  return engine.value.copyOriginalImageToClipboard()
}

// 生命周期
onMounted(async () => {
  try {
    await initEngine()
  } catch (err) {
    console.error('Failed to mount WebGL Image Viewer:', err)
  }
})

onUnmounted(() => {
  engine.value?.destroy()
})

// 监听 src 变化
watch(
  () => props.src,
  async (newSrc) => {
    if (newSrc && engine.value) {
      try {
        await engine.value.loadImage(newSrc)

        if (config.value.debug) {
          updateDebugInfo()
        }
      } catch (err) {
        console.error('Failed to load new image:', err)
        error.value =
          err instanceof Error ? err.message : 'Failed to load image'
      }
    }
  },
)

watch(
  config,
  (_newConfig) => {
    if (engine.value) {
      engine.value.destroy()
      initEngine().catch(console.error)
    }
  },
  { deep: true },
)

defineExpose<WebGLImageViewerRef>({
  zoomIn,
  zoomOut,
  resetView,
  getScale,
  getRelativeScale,
  copyToClipboard,
})
</script>

<template>
  <div
    class="webgl-image-viewer"
    :class="props.class"
  >
    <canvas
      ref="canvasRef"
      class="webgl-canvas"
      @error="handleError"
    />

    <DebugInfoComponent
      v-if="config.debug && debugInfo"
      :debug-info="debugInfo"
    />
  </div>
</template>

<style scoped>
.webgl-image-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.webgl-canvas {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  touch-action: none;
  border: none;
  outline: none;
  image-rendering: pixelated;
}

.webgl-canvas:active {
  cursor: grabbing;
}

.webgl-image-viewer.error {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #666;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.webgl-image-viewer.error::before {
  content: attr(data-error);
}
</style>

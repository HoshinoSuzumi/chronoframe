<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'

export interface LoadingState {
  isVisible: boolean
  isConverting: boolean
  isHeic: boolean
  progress: number
  bytesLoaded: number
  bytesTotal: number
  codec?: string

  isWebGLLoading?: boolean
  webglMessage?: string
  webglQuality?: string

  isError?: boolean
  message?: string
  errorMessage?: string
}

const defaultLoadingState: LoadingState = {
  isVisible: false,
  isConverting: false,
  isHeic: false,
  progress: 0,
  bytesLoaded: 0,
  bytesTotal: 0,
  codec: undefined,

  isWebGLLoading: false,
  webglMessage: undefined,
  webglQuality: 'unknown',

  isError: false,
  message: undefined,
  errorMessage: undefined,
}

const loadingState = ref<LoadingState>(defaultLoadingState)

export interface LoadingIndicatorRef {
  updateLoadingState: (state: Partial<LoadingState>) => void
  resetLoadingState: () => void
}

const updateLoadingState = (state: Partial<LoadingState>): void => {
  loadingState.value =
    state.isVisible === false
      ? defaultLoadingState
      : { ...loadingState.value, ...state }
}

const resetLoadingState = (): void => {
  loadingState.value = defaultLoadingState
}

defineExpose({
  updateLoadingState,
  resetLoadingState,
} satisfies LoadingIndicatorRef)

const loadingVariants = {
  initial: {
    opacity: 0,
    x: 20,
    y: 10,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
  },
}
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-show="loadingState.isVisible"
      key="loading-indicator"
      class="absolute bottom-4 right-4 z-40 pointer-events-none bg-black/40 backdrop-blur-3xl rounded-xl border border-white/10 p-3 shadow-2xl"
      :initial="loadingVariants.initial"
      :animate="loadingVariants.animate"
      :exit="loadingVariants.initial"
      :transition="{
        type: 'spring',
        duration: 0.3,
        bounce: 0,
      }"
    >
      <div class="flex items-start gap-2 text-white">
        <Icon
          name="tabler:loader-2"
          class="text-lg animate-spin"
        />
        <div class="flex flex-col min-w-0 gap-0.5">
          <template v-if="loadingState.isError">
            <p class="text-xs font-medium text-red-400">
              {{
                loadingState.errorMessage || $t('viewer.photoload.loadError')
              }}
            </p>
            <p class="text-xs text-white/70">
              {{ $t('viewer.photoload.loading') }}
            </p>
          </template>

          <template v-else-if="loadingState.isConverting">
            <p class="text-xs font-medium text-white tabular-nums">
              {{ loadingState.message || $t('viewer.photoload.converting') }}
            </p>
          </template>

          <template v-else-if="loadingState.isWebGLLoading">
            <div class="flex items-center gap-2">
              <p class="text-xs font-medium text-white">
                {{
                  loadingState.webglMessage ||
                  $t('viewer.photoload.loadingWebGL')
                }}
              </p>
              <span
                v-if="loadingState.webglQuality !== 'unknown'"
                class="text-xs tabular-nums"
                :style="{
                  color:
                    loadingState.webglQuality === 'high'
                      ? '#4ade80'
                      : loadingState.webglQuality === 'medium'
                        ? '#fbbf24'
                        : loadingState.webglQuality === 'low'
                          ? '#f87171'
                          : '#94a3b8',
                }"
              >
                {{ loadingState.webglQuality }}
              </span>
            </div>
            <p class="text-xs text-white/70">
              {{ $t('viewer.photoload.loadingTexture') }}
            </p>
          </template>

          <template v-else>
            <div class="flex items-center gap-2">
              <p class="text-xs font-medium text-white">
                {{
                  loadingState.isHeic
                    ? $t('viewer.photoload.loadingHEIC')
                    : $t('viewer.photoload.loading')
                }}
              </p>
              <span class="text-xs text-white/60 tabular-nums">
                {{ Math.round(loadingState.progress) }}%
              </span>
            </div>
            <p
              v-if="loadingState.bytesTotal > 0"
              class="text-xs text-white/70 tabular-nums"
            >
              {{ (loadingState.bytesLoaded / 1024 / 1024).toFixed(1) }}MB /
              {{ (loadingState.bytesTotal / 1024 / 1024).toFixed(1) }}MB
            </p>
          </template>
        </div>
      </div>
    </motion.div>
  </AnimatePresence>
</template>

<style scoped></style>

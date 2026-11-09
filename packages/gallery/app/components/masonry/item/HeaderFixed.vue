<script lang="ts" setup>
import { FIXED_HEADER_HEIGHT_PX } from '#gallery/utils'

// GradualBlur reference by Ansh Dhanani (github.com/ansh-dhanani).
const blurLayerCount = 8
const maxBlur = 2 * 12
const blurAt = (progress: number) => (maxBlur * (2 ** (4 * progress) - 1)) / 15
const blurLayers = Array.from({ length: blurLayerCount }, (_, index) => {
  const start = index / blurLayerCount
  const end = (index + 1) / blurLayerCount
  // Stacked Gaussian blurs add their variances.
  const radius = Math.sqrt(blurAt(end) ** 2 - blurAt(start) ** 2)

  return {
    '--blur-radius': `${radius.toFixed(3)}px`,
    maskImage: `linear-gradient(to top, transparent ${start * 100}%, black ${end * 100}%)`,
  }
})

const tintStops = Array.from({ length: 9 }, (_, index) => {
  const progress = index / 8
  const alpha = progress ** 3 * (progress * (progress * 6 - 15) + 10)
  return `rgb(0 0 0 / ${alpha.toFixed(3)}) ${progress * 100}%`
}).join(', ')

const blurRef = ref<HTMLElement>()
const { y } = useWindowScroll()
const { height } = useElementSize(blurRef)
const reveal = computed(() =>
  Math.min(Math.max(y.value / Math.max(height.value, 1), 0), 1),
)

defineProps<{
  stats?: {
    total: number
    dateRange: {
      start: string | undefined
      end: string | undefined
    } | null
  }
  dateRangeText: string
  visibleDateRange?: string
  visibleLocations?: string
  condensed?: boolean
}>()
</script>

<template>
  <header class="relative w-full text-neutral-900 dark:text-white">
    <div
      ref="blurRef"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 h-24"
      :style="{ '--blur-reveal': reveal }"
    >
      <div
        v-for="(layer, index) in blurLayers"
        :key="index"
        class="gradual-blur-layer absolute inset-0"
        :style="layer"
      />
      <div
        class="gradual-blur-tint absolute inset-0"
        :style="{ maskImage: `linear-gradient(to top, ${tintStops})` }"
      />
    </div>
    <AuthState>
      <template #default="{ loggedIn, clear }">
        <div
          class="relative flex w-full min-w-0 items-center gap-3 px-3 lg:gap-4"
          :style="{ height: `${FIXED_HEADER_HEIGHT_PX}px` }"
        >
          <MasonryItemHeaderIdentity
            variant="fixed"
            :logged-in="loggedIn"
            :visible-date-range="visibleDateRange"
            :visible-locations="visibleLocations"
            :condensed="condensed"
          />
          <MasonryItemHeaderStats
            variant="fixed"
            :total="stats?.total"
            :date-range-text="dateRangeText"
          />
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <MasonryItemHeaderSocialLinks variant="fixedDesktop" />
            <MasonryItemActions
              :logged-in="loggedIn"
              :clear="clear"
              compact
              grouped
              class="shrink-0"
            >
              <template #compact-details>
                <MasonryItemHeaderStats
                  variant="fixed"
                  compact
                  :total="stats?.total"
                  :date-range-text="dateRangeText"
                />
              </template>
            </MasonryItemActions>
          </div>
        </div>
      </template>
    </AuthState>
  </header>
</template>

<style scoped>
.gradual-blur-layer {
  backdrop-filter: blur(calc(var(--blur-radius) * var(--blur-reveal)));
  transition: backdrop-filter 0.3s ease-out;
}

.gradual-blur-tint {
  background: color-mix(in srgb, var(--ui-bg) 60%, transparent);
  opacity: var(--blur-reveal);
  transition: opacity 0.3s ease-out;
}

.dark .gradual-blur-tint {
  background: rgb(18 15 23 / 60%);
}
</style>

<script lang="ts" setup>
import { FIXED_HEADER_HEIGHT_PX } from '#gallery/utils'

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
  <header class="fixed-header-glass w-full text-neutral-900 dark:text-white">
    <AuthState>
      <template #default="{ loggedIn, clear }">
        <div
          class="flex w-full min-w-0 items-center gap-3 px-3 lg:gap-4"
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
.fixed-header-glass {
  background-image: linear-gradient(
    to bottom,
    rgb(255 255 255 / 96%) 0%,
    rgb(255 255 255 / 92%) 25%,
    rgb(255 255 255 / 78%) 50%,
    rgb(255 255 255 / 42%) 75%,
    transparent 100%
  );
}

.dark .fixed-header-glass {
  background-image: linear-gradient(
    to bottom,
    rgb(37 38 41 / 96%) 0%,
    rgb(37 38 41 / 92%) 25%,
    rgb(37 38 41 / 78%) 50%,
    rgb(37 38 41 / 42%) 75%,
    transparent 100%
  );
}
</style>

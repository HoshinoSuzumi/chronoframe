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
}>()
</script>

<template>
  <header
    class="w-full bg-white/90 text-neutral-900 backdrop-blur-xl dark:bg-neutral-950/90 dark:text-white"
  >
    <AuthState>
      <template #default="{ loggedIn, clear }">
        <div
          class="flex w-full min-w-0 items-center gap-3 px-3 sm:px-4 lg:gap-5"
          :style="{ height: `${FIXED_HEADER_HEIGHT_PX}px` }"
        >
          <MasonryItemHeaderIdentity
            variant="fixed"
            :logged-in="loggedIn"
          />
          <MasonryItemHeaderStats
            variant="fixed"
            :total="stats?.total"
            :date-range-text="dateRangeText"
          />
          <MasonryItemHeaderSocialLinks variant="fixedDesktop" />
          <MasonryItemActions
            :logged-in="loggedIn"
            :clear="clear"
            compact
            class="ml-auto shrink-0 gap-1 lg:ml-0"
          >
            <template #compact-details>
              <MasonryItemHeaderStats
                variant="fixed"
                compact
                :total="stats?.total"
                :date-range-text="dateRangeText"
              />
              <MasonryItemHeaderFooter
                variant="fixed"
                compact
              />
            </template>
          </MasonryItemActions>
          <MasonryItemHeaderFooter variant="fixed" />
        </div>
        <MasonryItemHeaderSocialLinks
          variant="fixedMobile"
          class="border-t border-neutral-200 px-2 dark:border-neutral-800"
        />
      </template>
    </AuthState>
  </header>
</template>

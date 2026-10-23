<script lang="ts" setup>
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
  <div class="relative w-full overflow-hidden">
    <div
      class="absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-35 blur-3xl"
      :style="{
        backgroundImage: `url(${getSetting('app:avatarUrl') || '/web-app-manifest-192x192.png'})`,
      }"
    ></div>
    <div
      class="absolute inset-0 -z-10 bg-white/50 dark:bg-neutral-900/50"
    ></div>
    <div class="flex flex-col items-center gap-2 py-6 pb-0">
      <AuthState>
        <template #default="{ loggedIn, clear }">
          <MasonryItemHeaderIdentity
            variant="embedded"
            :logged-in="loggedIn"
          />
          <MasonryItemHeaderStats
            variant="embedded"
            :total="stats?.total"
            :date-range-text="dateRangeText"
          />
          <MasonryItemActions
            :logged-in="loggedIn"
            :clear="clear"
            class="gap-0 rounded-full bg-white/30 p-1 dark:bg-neutral-900/50"
          />
        </template>
      </AuthState>
      <MasonryItemHeaderSocialLinks />
      <MasonryItemHeaderFooter variant="embedded" />
    </div>
  </div>
</template>

<script lang="ts" setup>
withDefaults(
  defineProps<{
    loggedIn: boolean
    clear: () => void | Promise<void>
    compact?: boolean
  }>(),
  { compact: false },
)

const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (dark) => {
    colorMode.preference = dark ? 'dark' : 'light'
  },
})

const { hasActiveFilters, selectedCounts } = usePhotoFilters()
const { currentSortIcon, currentSortOption } = usePhotoSort()
const { albumListPath } = useHomeView()
const totalSelectedFilters = computed(() =>
  Object.values(selectedCounts.value).reduce(
    (total, count) => total + count,
    0,
  ),
)
</script>

<template>
  <div class="flex items-center">
    <div
      :class="compact ? 'hidden lg:flex' : 'flex'"
      class="items-center"
    >
      <UTooltip :text="$t('ui.action.globe.tooltip')">
        <UButton
          variant="soft"
          color="neutral"
          class="cursor-pointer rounded-full bg-transparent"
          icon="tabler:map-pin-2"
          size="sm"
          to="/globe"
        />
      </UTooltip>
      <UTooltip :text="$t('title.albums')">
        <UButton
          variant="soft"
          color="neutral"
          class="cursor-pointer rounded-full bg-transparent"
          icon="tabler:photo"
          size="sm"
          :to="albumListPath"
        />
      </UTooltip>
    </div>
    <OverlayFilterPopover>
      <UTooltip :text="$t('ui.action.filter.tooltip')">
        <UChip
          inset
          size="sm"
          color="info"
          :show="totalSelectedFilters > 0"
        >
          <UButton
            variant="soft"
            :color="hasActiveFilters ? 'info' : 'neutral'"
            class="relative cursor-pointer rounded-full bg-transparent"
            icon="tabler:filter"
            size="sm"
          />
        </UChip>
      </UTooltip>
    </OverlayFilterPopover>
    <OverlaySortPopover>
      <UTooltip :text="$t('ui.action.sort.tooltip')">
        <UButton
          variant="soft"
          :color="
            currentSortOption?.key === 'dateTaken-desc' ? 'neutral' : 'info'
          "
          class="cursor-pointer rounded-full bg-transparent"
          :icon="currentSortIcon"
          size="sm"
        />
      </UTooltip>
    </OverlaySortPopover>
    <div
      :class="compact ? 'hidden lg:flex' : 'flex'"
      class="items-center"
    >
      <UTooltip :text="$t('ui.action.theme.tooltip')">
        <UButton
          variant="soft"
          color="neutral"
          class="cursor-pointer rounded-full bg-transparent"
          :icon="isDark ? 'tabler:sun' : 'tabler:moon'"
          size="sm"
          @click="isDark = !isDark"
        />
      </UTooltip>
      <UTooltip
        v-if="loggedIn"
        :text="$t('ui.action.dashboard.tooltip')"
      >
        <UButton
          size="sm"
          color="info"
          variant="soft"
          class="cursor-pointer rounded-full bg-transparent"
          icon="tabler:dashboard"
          data-tour="home-dashboard"
          to="/dashboard"
        />
      </UTooltip>
      <UTooltip
        v-if="loggedIn"
        :text="$t('ui.action.logout.tooltip')"
      >
        <UButton
          size="sm"
          color="error"
          variant="soft"
          class="cursor-pointer rounded-full bg-transparent"
          icon="tabler:logout"
          @click="clear"
        />
      </UTooltip>
    </div>
    <UPopover v-if="compact">
      <UButton
        variant="soft"
        color="neutral"
        class="cursor-pointer rounded-full bg-transparent lg:hidden"
        icon="tabler:dots"
        size="sm"
        :aria-label="$t('ui.action.more.tooltip')"
        :data-tour="loggedIn ? 'home-dashboard' : undefined"
      />
      <template #content>
        <div class="flex w-64 flex-col gap-1 p-2">
          <UButton
            variant="ghost"
            color="neutral"
            icon="tabler:map-pin-2"
            :label="$t('ui.action.globe.tooltip')"
            to="/globe"
          />
          <UButton
            variant="ghost"
            color="neutral"
            icon="tabler:photo"
            :label="$t('title.albums')"
            :to="albumListPath"
          />
          <UButton
            variant="ghost"
            color="neutral"
            :icon="isDark ? 'tabler:sun' : 'tabler:moon'"
            :label="$t('ui.action.theme.tooltip')"
            @click="isDark = !isDark"
          />
          <UButton
            v-if="loggedIn"
            variant="ghost"
            color="info"
            icon="tabler:dashboard"
            :label="$t('ui.action.dashboard.tooltip')"
            to="/dashboard"
          />
          <UButton
            v-if="loggedIn"
            variant="ghost"
            color="error"
            icon="tabler:logout"
            :label="$t('ui.action.logout.tooltip')"
            @click="clear"
          />
          <div
            class="mt-1 border-t border-neutral-200 px-2 pt-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
          >
            <slot name="compact-details" />
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script lang="ts" setup>
import {
  photoOverlayCardUi,
  photoOverlayPopoverUi,
} from '../../../utils/photoOverlayPresentation'

withDefaults(
  defineProps<{
    loggedIn: boolean
    clear: () => void | Promise<void>
    compact?: boolean
    grouped?: boolean
  }>(),
  { compact: false, grouped: false },
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
  <div
    class="flex items-center"
    :class="grouped ? 'gap-2' : undefined"
  >
    <div
      class="flex items-center"
      :class="
        grouped
          ? 'gap-0.5 rounded-2xl bg-neutral-900/[0.04] p-1 dark:bg-white/[0.06]'
          : undefined
      "
    >
      <div
        :class="
          grouped
            ? 'hidden items-center gap-0.5 lg:flex'
            : compact
              ? 'hidden items-center lg:flex'
              : 'flex items-center'
        "
      >
        <UTooltip
          :text="$t('ui.action.globe.tooltip')"
          :delay-duration="0"
        >
          <UButton
            variant="soft"
            color="neutral"
            class="cursor-pointer rounded-full bg-transparent"
            icon="tabler:map-pin-2"
            size="sm"
            to="/globe"
          />
        </UTooltip>
        <UTooltip
          :text="$t('title.albums')"
          :delay-duration="0"
        >
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
        <UTooltip
          :text="$t('ui.action.filter.tooltip')"
          :delay-duration="0"
        >
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
        <UTooltip
          :text="$t('ui.action.sort.tooltip')"
          :delay-duration="0"
        >
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
      <UPopover
        v-if="compact"
        :ui="photoOverlayPopoverUi"
      >
        <UTooltip
          :text="$t('ui.action.more.tooltip')"
          :delay-duration="0"
        >
          <UButton
            variant="soft"
            color="neutral"
            class="cursor-pointer rounded-full bg-transparent lg:hidden"
            icon="tabler:dots"
            size="sm"
            :aria-label="$t('ui.action.more.tooltip')"
            :data-tour="loggedIn ? 'home-dashboard' : undefined"
          />
        </UTooltip>
        <template #content>
          <UCard
            variant="glassmorphism"
            :ui="photoOverlayCardUi"
            class="w-3xs max-w-[calc(100vw-1rem)]"
          >
            <div class="space-y-1">
              <UButton
                variant="ghost"
                color="neutral"
                icon="tabler:map-pin-2"
                :label="$t('ui.action.globe.tooltip')"
                size="sm"
                block
                class="justify-start"
                to="/globe"
              />
              <UButton
                variant="ghost"
                color="neutral"
                icon="tabler:photo"
                :label="$t('title.albums')"
                size="sm"
                block
                class="justify-start"
                :to="albumListPath"
              />
              <UButton
                variant="ghost"
                color="neutral"
                :icon="isDark ? 'tabler:sun' : 'tabler:moon'"
                :label="$t('ui.action.theme.tooltip')"
                size="sm"
                block
                class="justify-start"
                @click="isDark = !isDark"
              />
              <UButton
                v-if="loggedIn"
                variant="ghost"
                color="info"
                icon="tabler:dashboard"
                :label="$t('ui.action.dashboard.tooltip')"
                size="sm"
                block
                class="justify-start"
                to="/dashboard"
              />
              <UButton
                v-if="loggedIn"
                variant="ghost"
                color="error"
                icon="tabler:logout"
                :label="$t('ui.action.logout.tooltip')"
                size="sm"
                block
                class="justify-start"
                @click="clear"
              />
            </div>
            <MasonryItemHeaderSocialLinksMenu />
            <div
              v-if="$slots['compact-details']"
              class="border-t border-neutral-300/50 px-1 pt-2 text-[11px] leading-4 text-neutral-500 dark:border-neutral-500/50 dark:text-neutral-400"
            >
              <slot name="compact-details" />
            </div>
            <MasonryItemHeaderFooter variant="menu" />
          </UCard>
        </template>
      </UPopover>
    </div>
    <div
      :class="[
        'items-center',
        grouped
          ? 'hidden gap-0.5 rounded-2xl bg-neutral-900/[0.04] p-1 lg:flex dark:bg-white/[0.06]'
          : compact
            ? 'hidden lg:flex'
            : 'flex',
      ]"
    >
      <UTooltip
        :text="$t('ui.action.theme.tooltip')"
        :delay-duration="0"
      >
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
        :delay-duration="0"
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
        :delay-duration="0"
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
  </div>
</template>

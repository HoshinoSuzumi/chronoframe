<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'

const {
  availableFilters,
  selectedCounts,
  toggleFilter,
  isFilterSelected,
  clearAllFilters,
  hasActiveFilters,
  activeFilters,
} = usePhotoFilters()

const { shufflePhotos } = usePhotoSort()

const currentTab = ref('labels')
const isSearchMode = ref(false)

const searchQuery = computed({
  get: () => activeFilters.value.search,
  set: (value: string) => {
    activeFilters.value.search = value
  },
})

const selectedRating = computed({
  get: () => activeFilters.value.ratings,
  set: (value: number) => {
    activeFilters.value.ratings = value
  },
})

const tabItems = computed<TabsItem[]>(() => [
  {
    label: $t('ui.action.filter.tabs.tags'),
    value: 'labels',
    badge: selectedCounts.value.tags || undefined,
    icon: 'tabler:tags',
    slot: 'tags',
  },
  {
    label: $t('ui.action.filter.tabs.cameras'),
    value: 'cameras',
    badge: selectedCounts.value.cameras || undefined,
    icon: 'tabler:camera',
    slot: 'cameras',
  },
  {
    label: $t('ui.action.filter.tabs.lenses'),
    value: 'lenses',
    badge: selectedCounts.value.lenses || undefined,
    icon: 'tabler:aperture',
    slot: 'lenses',
  },
  {
    label: $t('ui.action.filter.tabs.cities'),
    value: 'cities',
    badge: selectedCounts.value.cities || undefined,
    icon: 'tabler:map-pin',
    slot: 'cities',
  },
  {
    label: $t('ui.action.filter.tabs.ratings'),
    value: 'ratings',
    badge: selectedCounts.value.ratings || undefined,
    icon: 'tabler:star',
    slot: 'ratings',
  },
])

const handleToggleFilter = (type: string, value: string | number) => {
  toggleFilter(type as any, value)
}

const onShuffle = () => {
  shufflePhotos()
}
</script>

<template>
  <div class="space-y-1.5 w-[calc(100vw-34px)] sm:w-md">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-bold text-neutral-900 dark:text-white p-2">
        {{ $t('ui.action.filter.title') }}
      </h3>
      <div class="flex items-center gap-1">
        <UButton
          v-if="hasActiveFilters"
          size="sm"
          variant="ghost"
          color="neutral"
          icon="tabler:filter-x"
          @click="
            () => {
              clearAllFilters()
              isSearchMode = false
              searchQuery = ''
            }
          "
        >
          {{ $t('ui.action.filter.clearAll') }}
        </UButton>
        <!-- 搜索功能 -->
        <div
          v-if="isSearchMode"
          class="flex items-center gap-1"
        >
          <UInput
            v-model="searchQuery"
            size="sm"
            icon="tabler:search"
            :placeholder="$t('ui.action.filter.searchPlaceholder')"
            class="w-32"
            @keydown.escape="isSearchMode = false"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="tabler:x"
            @click="
              () => {
                isSearchMode = false
                searchQuery = ''
              }
            "
          />
        </div>
        <UButton
          v-else
          size="sm"
          variant="ghost"
          color="neutral"
          icon="tabler:search"
          @click="isSearchMode = true"
        />
        <UTooltip :text="$t('ui.action.filter.shuffleTooltip')">
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="tabler:dice-3"
            @click="onShuffle"
          />
        </UTooltip>
      </div>
    </div>
    <!-- 标签页 -->
    <UTabs
      v-model="currentTab"
      color="neutral"
      size="xs"
      :items="tabItems"
      :ui="{
        list: 'bg-white/30 dark:bg-neutral-800/50',
        indicator: 'bg-white/80',
        trigger:
          'data-[state=inactive]:text-muted data-[state=active]:text-default dark:data-[state=active]:text-inverted',
        trailingBadge:
          'ring-0 rounded-full py-0 bg-info-100/80 dark:bg-info-900/80 text-info-500 dark:text-info-400 border border-info-300/50 dark:border-info-700/50',
        trailingBadgeSize: 'sm',
      }"
    >
      <!-- 标签面板 -->
      <template #tags>
        <div class="space-y-0.5 max-h-64 overflow-y-auto">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="tag in availableFilters.tags"
              :key="tag.label"
              :label="tag.label"
              :color="isFilterSelected('tags', tag.label) ? 'info' : 'neutral'"
              :trailing-icon="
                isFilterSelected('tags', tag.label) ? 'tabler:check' : ''
              "
              variant="soft"
              class="cursor-pointer select-none transition-colors"
              :class="`${isFilterSelected('tags', tag.label) ? '' : 'bg-neutral-800/10 text-neutral-800 hover:bg-neutral-800/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20'}`"
              @click="handleToggleFilter('tags', tag.label)"
            />
          </div>
          <div
            v-if="availableFilters.tags.length === 0"
            class="text-center text-sm text-neutral-500 dark:text-neutral-400 py-4"
          >
            {{ $t('ui.action.filter.empty.tags') }}
          </div>
        </div>
      </template>

      <!-- 相机面板 -->
      <template #cameras>
        <div class="space-y-0.5 max-h-64 overflow-y-auto">
          <div
            v-for="camera in availableFilters.cameras"
            :key="camera.label"
            class="flex items-center justify-between cursor-pointer select-none hover:bg-neutral-400/30 dark:hover:bg-info-800/30 rounded-lg px-2 py-2"
            :class="
              isFilterSelected('cameras', camera.label)
                ? 'bg-neutral-400/30 dark:bg-info-800/30'
                : ''
            "
            @click="handleToggleFilter('cameras', camera.label)"
          >
            <span class="text-sm text-default font-medium truncate">
              {{ camera.label }}
            </span>
            <Icon
              v-if="isFilterSelected('cameras', camera.label)"
              name="tabler:check"
              class="size-4 text-green-500"
            />
          </div>
          <div
            v-if="availableFilters.cameras.length === 0"
            class="text-center text-sm text-neutral-500 dark:text-neutral-400 py-4"
          >
            {{ $t('ui.action.filter.empty.cameras') }}
          </div>
        </div>
      </template>

      <!-- 镜头面板 -->
      <template #lenses>
        <div class="space-y-0.5 max-h-64 overflow-y-auto">
          <div
            v-for="lens in availableFilters.lenses"
            :key="lens.label"
            class="flex items-center justify-between cursor-pointer select-none hover:bg-neutral-400/30 dark:hover:bg-info-800/30 rounded-lg px-2 py-2"
            :class="
              isFilterSelected('lenses', lens.label)
                ? 'bg-neutral-400/30 dark:bg-info-800/30'
                : ''
            "
            @click="handleToggleFilter('lenses', lens.label)"
          >
            <span class="text-sm text-default font-medium truncate">
              {{ lens.label }}
            </span>
            <Icon
              v-if="isFilterSelected('lenses', lens.label)"
              name="tabler:check"
              class="size-4 text-green-500"
            />
          </div>
          <div
            v-if="availableFilters.lenses.length === 0"
            class="text-center text-sm text-neutral-500 dark:text-neutral-400 py-4"
          >
            {{ $t('ui.action.filter.empty.lenses') }}
          </div>
        </div>
      </template>

      <!-- 城市面板 -->
      <template #cities>
        <div class="space-y-0.5 max-h-64 overflow-y-auto">
          <div
            v-for="city in availableFilters.cities"
            :key="city.label"
            class="flex items-center justify-between cursor-pointer select-none hover:bg-neutral-400/30 dark:hover:bg-info-800/30 rounded-lg px-2 py-2"
            :class="
              isFilterSelected('cities', city.label)
                ? 'bg-neutral-400/30 dark:bg-info-800/30'
                : ''
            "
            @click="handleToggleFilter('cities', city.label)"
          >
            <span class="text-sm text-default font-medium truncate">
              {{ city.label }}
            </span>
            <Icon
              v-if="isFilterSelected('cities', city.label)"
              name="tabler:check"
              class="size-4 text-green-500"
            />
          </div>
          <div
            v-if="availableFilters.cities.length === 0"
            class="text-center text-sm text-neutral-500 dark:text-neutral-400 py-4"
          >
            {{ $t('ui.action.filter.empty.cities') }}
          </div>
        </div>
      </template>

      <!-- 评分面板 -->
      <template #ratings>
        <div
          class="max-h-64 overflow-y-auto flex flex-col items-center gap-3 py-4"
        >
          <Rating
            v-model="selectedRating"
            size="xl"
            :allow-half="false"
          />
          <div
            class="text-xs font-semibold text-neutral-900/90 dark:text-white/90"
          >
            {{
              selectedRating
                ? $t(
                    'ui.action.filter.rating.showStarsAndAbove',
                    selectedRating,
                  )
                : $t('ui.action.filter.rating.showAll')
            }}
          </div>
        </div>
      </template>
    </UTabs>
  </div>
</template>

<style scoped></style>

<script setup lang="ts">
import '#gallery/assets/css/heatmap.css'
import type { CalendarItem } from '#gallery/components/ui/CalendarHeatmap/Heatmap'
const props = defineProps<{ photos: Array<{ dateTaken?: string | null }> }>()
const photos = computed(() => props.photos)
const dayjs = useDayjs()
const selectedYear = ref<number | 'recent'>('recent')
// 获取所有有照片的年份
const availableYears = computed(() => {
  if (!photos.value || photos.value.length === 0) return []

  const years = new Set<number>()
  photos.value.forEach((photo) => {
    if (photo.dateTaken) {
      const year = dayjs(photo.dateTaken).year()
      years.add(year)
    }
  })

  return Array.from(years).sort((a, b) => b - a) // 降序排列，最新年份在前
})

const heatmapData = computed(() => {
  if (!photos.value || photos.value.length === 0) return []

  const dateCountMap = new Map<string, number>()

  // 计算起止范围
  let start, end
  if (selectedYear.value === 'recent') {
    start = dayjs().subtract(1, 'year')
    end = dayjs().add(1, 'day') // 包含今天
  } else {
    start = dayjs(`${selectedYear.value}-01-01`).startOf('year')
    end = dayjs(`${selectedYear.value}-01-01`).endOf('year')
  }

  photos.value.forEach((photo) => {
    if (!photo.dateTaken) return
    const photoDate = dayjs(photo.dateTaken)

    if (photoDate.isBetween(start, end, 'day', '[]')) {
      const date = photoDate.format('YYYY-MM-DD')
      dateCountMap.set(date, (dateCountMap.get(date) || 0) + 1)
    }
  })

  return Array.from(dateCountMap.entries()).map(([date, count]) => ({
    date,
    count,
  }))
})

const heatmapStartDate = computed(() => {
  if (selectedYear.value === 'recent') {
    return dayjs().subtract(1, 'year').toDate()
  }
  return dayjs(`${selectedYear.value}-01-01`).startOf('year').toDate()
})

const heatmapEndDate = computed(() => {
  if (selectedYear.value === 'recent') {
    return dayjs().add(1, 'day').toDate()
  }
  return dayjs(`${selectedYear.value}-01-01`).endOf('year').toDate()
})

const yearOptions = computed(() => {
  const options: Array<{ label: string; value: number | 'recent' }> = [
    {
      label: $t('common.heatmap.legend.recentlyYear'),
      value: 'recent' as const,
    },
  ]

  availableYears.value.forEach((year) => {
    options.push({ label: year.toString(), value: year })
  })

  return options
})
</script>
<template>
  <div class="heatmap-container">
    <ClientOnly>
      <CalendarHeatmap
        theme="blue"
        :values="heatmapData"
        :start-date="heatmapStartDate"
        :end-date="heatmapEndDate"
        :round="3"
        :tooltip-formatter="
          (item: CalendarItem) => {
            return $t('common.heatmap.tooltip.data', [
              $dayjs(item.date).format('LL'),
              item.count || 0,
            ])
          }
        "
        :tooltip-no-data-formatter="
          (date: Date) =>
            $t('common.heatmap.tooltip.noData', [$dayjs(date).format('LL')])
        "
        :locale="{
          months: [
            $t('common.months.jan'),
            $t('common.months.feb'),
            $t('common.months.mar'),
            $t('common.months.apr'),
            $t('common.months.may'),
            $t('common.months.jun'),
            $t('common.months.jul'),
            $t('common.months.aug'),
            $t('common.months.sep'),
            $t('common.months.oct'),
            $t('common.months.nov'),
            $t('common.months.dec'),
          ],
          days: [
            $t('common.days.sun'),
            $t('common.days.mon'),
            $t('common.days.tue'),
            $t('common.days.wed'),
            $t('common.days.thu'),
            $t('common.days.fri'),
            $t('common.days.sat'),
          ],
          less: $t('common.heatmap.legend.less'),
          more: $t('common.heatmap.legend.more'),
        }"
        :dark-mode="$colorMode.value === 'dark'"
      >
        <template #vch__legend-left>
          <USelectMenu
            v-model="selectedYear"
            :items="yearOptions"
            :disabled="yearOptions.length <= 1"
            :search-input="false"
            value-key="value"
            size="xs"
            variant="soft"
            class="w-24"
          />
        </template>
      </CalendarHeatmap>
      <template #placeholder>
        <div class="flex items-center justify-center h-[164.5px]">
          <Icon
            name="svg-spinners:180-ring-with-bg"
            class="size-8 opacity-50"
            mode="svg"
          />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
<style>
.heatmap-container {
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 100%;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.heatmap-container::-webkit-scrollbar {
  height: 4px;
}

.heatmap-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 2px;
}

.heatmap-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.heatmap-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 暗色模式下的滚动条样式 */
.dark .heatmap-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.dark .heatmap-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.dark .heatmap-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.heatmap-container .vch__container {
  min-width: 720px;
}

.vch__day__label,
.vch__month__label,
.vch__legend {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
}

.vch__day__label,
.vch__month__label {
  font-size: var(--text-xs);
}
</style>

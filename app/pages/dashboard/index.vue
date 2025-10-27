<script lang="ts" setup>
import '@/assets/css/heatmap.css'
import type { CalendarItem } from '~/components/ui/CalendarHeatmap/Heatmap'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.dashboard'),
})

const dayjs = useDayjs()
const config = useRuntimeConfig()
const { photos } = usePhotos()

const { data: dashboardStats, refresh: refreshStats } =
  await useFetch('/api/system/stats')

const isLoading = ref(false)

// 年份选择器相关状态
const selectedYear = ref<number | 'recent'>('recent')

const refreshData = async () => {
  isLoading.value = true
  try {
    await Promise.all([refreshStats()])
  } finally {
    isLoading.value = false
  }
}

const refreshInterval = setInterval(refreshData, 5000)

onBeforeUnmount(() => {
  clearInterval(refreshInterval)
})

const systemStatus = computed(() => {
  if (!dashboardStats.value) return 'unknown'

  const memoryUsage = dashboardStats.value.memory
    ? (dashboardStats.value.memory.used / dashboardStats.value.memory.total) *
      100
    : 0

  if (memoryUsage > 90) return 'critical'
  if (memoryUsage > 70) return 'warning'
  return 'healthy'
})

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

const onShareSite = () => {
  const discussionParams = new URLSearchParams({
    category: 'showcases',
    title: `Show: ${config.public.app.title}`,
    body: `## Description / Motto\n\n${config.public.app.slogan}\n\n## URL\n\n[${window.location.origin}](${window.location.origin})`,
  })
  window.open(
    `https://github.com/HoshinoSuzumi/chronoframe/discussions/new?${discussionParams}`,
    '_blank',
  )
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('dashboard.overview.title')" />
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.totalPhotos')"
            icon="tabler:photo"
            color="blue"
            :value="dashboardStats?.photos?.total || 0"
            clickable
            @click="$router.push('/dashboard/photos')"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.thisMonth')"
            icon="tabler:photo-plus"
            color="green"
            :value="dashboardStats?.photos?.thisMonth || 0"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.queueStatus.title')"
            icon="tabler:loader"
            color="purple"
            :value="
              (dashboardStats?.workerPool?.activeWorkers || 0) > 0
                ? $t('dashboard.overview.indicator.queueStatus.processing')
                : $t('dashboard.overview.indicator.queueStatus.pending')
            "
            clickable
            @click="$router.push('/dashboard/queue')"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.storageUsage')"
            icon="tabler:database"
            color="blue"
            :value="formatBytes(dashboardStats?.storage?.totalSize || 0)"
          />
        </div>

        <!-- 运行信息 -->
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold pb-1.5">
              {{ $t('dashboard.overview.section.runtimeInfo.title') }}
            </h2>
          </template>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.section.runtimeInfo.version') }}
              </p>
              <NuxtLink
                class="text-lg font-bold hover:text-primary"
                target="_blank"
                external
                :to="`https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v${$config.public.VERSION}`"
              >
                v{{ $config.public.VERSION }}
              </NuxtLink>
            </div>
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.section.runtimeInfo.uptime') }}
              </p>
              <p class="text-lg font-bold">
                {{
                  dashboardStats?.uptime
                    ? $dayjs
                        .duration(dashboardStats.uptime, 'seconds')
                        .humanize()
                    : '-'
                }}
              </p>
            </div>
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.section.runtimeInfo.environment') }}
              </p>
              <UBadge
                :color="
                  dashboardStats?.runningOn === 'docker' ? 'info' : 'success'
                "
                variant="soft"
              >
                {{
                  $t(
                    `dashboard.overview.section.runtimeInfo.systems.${dashboardStats?.runningOn || 'unknown'}`,
                  )
                }}
              </UBadge>
            </div>
            <!-- <div>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ $t('dashboard.overview.section.runtimeInfo.lastUpdate') }}
          </p>
          <p class="text-lg font-bold">
            <ClientOnly>
              {{ $dayjs().fromNow() }}
              <template #placeholder>--</template>
            </ClientOnly>
          </p>
        </div> -->
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                Share Your Site
              </p>
              <p class="text-lg font-bold">
                <UButton
                  external
                  variant="subtle"
                  size="xs"
                  color="info"
                  trailing-icon="tabler:external-link"
                  @click="onShareSite"
                >
                  分享你的站点
                </UButton>
              </p>
            </div>
          </div>
        </UCard>

        <!-- 详细统计区域 -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <!-- 左侧 -->
          <div class="lg:col-span-3">
            <UCard>
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
                        $t('common.heatmap.tooltip.noData', [
                          $dayjs(date).format('LL'),
                        ])
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
            </UCard>
          </div>

          <!-- 右侧：系统资源监控 -->
          <div class="lg:col-span-2 w-full space-y-4">
            <!-- 内存使用 -->
            <UCard>
              <template #header>
                <h3 class="font-semibold pb-1.5">
                  {{ $t('dashboard.overview.section.memory.title') }}
                </h3>
              </template>

              <div class="space-y-2">
                <UProgress
                  :model-value="
                    dashboardStats?.memory
                      ? Math.round(
                          (dashboardStats.memory.used /
                            dashboardStats.memory.total) *
                            100,
                        )
                      : 0
                  "
                  :color="
                    systemStatus === 'healthy'
                      ? 'success'
                      : systemStatus === 'warning'
                        ? 'warning'
                        : systemStatus === 'critical'
                          ? 'error'
                          : 'neutral'
                  "
                  class="w-full"
                />
                <div class="flex justify-between text-sm">
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{
                      dashboardStats?.memory
                        ? `${Math.round((dashboardStats.memory.used / 1024 / 1024 / 1024) * 100) / 100}GB / ${Math.round((dashboardStats.memory.total / 1024 / 1024 / 1024) * 100) / 100}GB`
                        : 'memory info not available'
                    }}
                  </div>
                  <span>
                    {{
                      dashboardStats?.memory
                        ? Math.round(
                            (dashboardStats.memory.used /
                              dashboardStats.memory.total) *
                              100,
                          )
                        : 0
                    }}%
                  </span>
                </div>
              </div>
            </UCard>

            <!-- 队列详情 -->
            <UCard>
              <template #header>
                <h3 class="font-semibold pb-1.5">
                  {{ $t('dashboard.overview.section.queue.title') }}
                </h3>
              </template>

              <div class="space-y-1">
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.activeWorkers') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.activeWorkers || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.totalWorkers') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.totalWorkers || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.totalProcessed') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.totalProcessed || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.totalFailed') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.totalErrors || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.avgSuccessRate') }}
                  </span>
                  <UBadge
                    :color="
                      (dashboardStats?.workerPool?.averageSuccessRate || 0) > 90
                        ? 'success'
                        : (dashboardStats?.workerPool?.averageSuccessRate ||
                              0) > 70
                          ? 'warning'
                          : 'error'
                    "
                    variant="soft"
                  >
                    {{
                      Math.round(
                        dashboardStats?.workerPool?.averageSuccessRate || 0,
                      )
                    }}%
                  </UBadge>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
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

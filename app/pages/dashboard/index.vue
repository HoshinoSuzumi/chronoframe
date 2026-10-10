<script lang="ts" setup>
import '@/assets/css/heatmap.css'
import type { CalendarItem } from '~/components/ui/CalendarHeatmap/Heatmap'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.dashboard'),
})

const dayjs = useDayjs()
const appTitle = useSettingRef('app:title')
const appSlogan = useSettingRef('app:slogan')
const { photos } = usePhotos()

const { data: dashboardStats, refresh: refreshStats } =
  await useFetch('/api/system/stats')

const isLoading = ref(false)

// 年份选择器相关状态
const selectedYear = ref<number | 'recent'>('recent')

const refreshData = async () => {
  isLoading.value = true
  try {
    await refreshStats()
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

const hasQueueActivity = computed(() => {
  const pool = dashboardStats.value?.workerPool
  return (pool?.totalProcessed || 0) > 0 || (pool?.totalErrors || 0) > 0
})

const queueSuccessRate = computed(() =>
  Math.min(
    100,
    Math.max(0, dashboardStats.value?.workerPool?.averageSuccessRate || 0),
  ),
)

const queueSuccessColor = computed(() => {
  const pool = dashboardStats.value?.workerPool
  if (!pool || !hasQueueActivity.value) return 'neutral'
  if (pool.averageSuccessRate > 90) return 'success'
  if (pool.averageSuccessRate > 70) return 'warning'
  return 'error'
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
    title: `Show: ${appTitle.value || 'ChronoFrame'}`,
    body: `## Description / Motto\n\n${appSlogan.value || ''}\n\n## URL\n\n[${window.location.origin}](${window.location.origin})`,
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
            <DashboardSectionHeader
              :title="$t('dashboard.overview.section.runtimeInfo.title')"
              icon="tabler:server"
            />
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
                {{ $t('dashboard.overview.shareSite.label') }}
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
                  {{ $t('dashboard.overview.shareSite.button') }}
                </UButton>
              </p>
            </div>
          </div>
        </UCard>

        <!-- 详细统计区域 -->
        <div class="grid grid-cols-1 items-start lg:grid-cols-5 gap-4">
          <!-- 左侧 -->
          <div class="min-w-0 space-y-4 lg:col-span-3">
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
            <DashboardRecentActivity />
          </div>

          <!-- 右侧：系统资源监控 -->
          <div class="min-w-0 lg:col-span-2 w-full space-y-4">
            <!-- 内存使用 -->
            <UCard>
              <template #header>
                <DashboardSectionHeader
                  :title="$t('dashboard.overview.section.memory.title')"
                  icon="tabler:cpu"
                />
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
                        : $t('dashboard.overview.memoryUnavailable')
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
                <DashboardSectionHeader
                  :title="$t('dashboard.overview.section.queue.title')"
                  icon="tabler:list-check"
                />
              </template>

              <div
                class="grid grid-cols-[100px_minmax(0,1fr)] overflow-hidden rounded-lg border border-default"
              >
                <div
                  class="flex flex-col items-center justify-center gap-1 border-r border-default bg-elevated/50 px-2 py-3"
                >
                  <div class="relative h-12 w-20">
                    <svg
                      viewBox="0 0 100 60"
                      class="h-full w-full"
                      aria-hidden="true"
                    >
                      <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="7"
                        stroke-linecap="round"
                        class="text-border"
                      />
                      <path
                        v-if="hasQueueActivity && queueSuccessRate > 0"
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="7"
                        stroke-linecap="round"
                        pathLength="100"
                        :stroke-dasharray="queueSuccessRate + ' 100'"
                        :class="{
                          'text-success': queueSuccessColor === 'success',
                          'text-warning': queueSuccessColor === 'warning',
                          'text-error': queueSuccessColor === 'error',
                        }"
                      />
                    </svg>
                    <span
                      class="absolute inset-x-0 bottom-0 text-center text-base font-semibold leading-5 tabular-nums"
                      :class="{ 'text-muted': !hasQueueActivity }"
                      >{{
                        hasQueueActivity
                          ? Math.round(queueSuccessRate) + '%'
                          : '—'
                      }}</span
                    >
                  </div>
                  <span class="text-center text-xs leading-4 text-muted">{{
                    $t('dashboard.overview.section.queue.avgSuccessRate')
                  }}</span>
                </div>
                <div class="grid min-w-0 grid-cols-2 gap-px bg-border">
                  <div
                    class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 bg-default px-3 py-2.5"
                  >
                    <UIcon
                      name="tabler:activity"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 flex-1 text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.activeWorkers')
                    }}</span>
                    <span class="text-base font-semibold tabular-nums">{{
                      dashboardStats?.workerPool?.activeWorkers || 0
                    }}</span>
                  </div>
                  <div
                    class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 bg-default px-3 py-2.5"
                  >
                    <UIcon
                      name="tabler:cpu"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 flex-1 text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.totalWorkers')
                    }}</span>
                    <span class="text-base font-semibold tabular-nums">{{
                      dashboardStats?.workerPool?.totalWorkers || 0
                    }}</span>
                  </div>
                  <div
                    class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 bg-default px-3 py-2.5"
                  >
                    <UIcon
                      name="tabler:circle-check"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 flex-1 text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.totalProcessed')
                    }}</span>
                    <span class="text-base font-semibold tabular-nums">{{
                      dashboardStats?.workerPool?.totalProcessed || 0
                    }}</span>
                  </div>
                  <div
                    class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 bg-default px-3 py-2.5"
                  >
                    <UIcon
                      name="tabler:circle-x"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 flex-1 text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.totalFailed')
                    }}</span>
                    <span
                      class="text-base font-semibold tabular-nums"
                      :class="{
                        'text-error':
                          (dashboardStats?.workerPool?.totalErrors || 0) > 0,
                      }"
                      >{{ dashboardStats?.workerPool?.totalErrors || 0 }}</span
                    >
                  </div>
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

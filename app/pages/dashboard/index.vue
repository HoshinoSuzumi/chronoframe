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

useIntervalFn(refreshData, 5000)

const memoryUsage = computed(() => {
  const memory = dashboardStats.value?.memory
  if (!memory || memory.total <= 0) return null
  return Math.min(100, Math.max(0, (memory.used / memory.total) * 100))
})

const systemStatus = computed(() => {
  if (memoryUsage.value === null) return 'unknown'
  if (memoryUsage.value > 90) return 'critical'
  if (memoryUsage.value > 70) return 'warning'
  return 'healthy'
})

const queueDebugEnabled = useDebugValue<boolean>(
  'dashboard:queue:enabled',
  false,
)
const queueDebugScenario = useDebugValue(
  'dashboard:queue:scenario',
  'processing',
)
const queueDebugScenarios = {
  empty: {
    activeWorkers: 0,
    totalWorkers: 5,
    totalProcessed: 0,
    totalErrors: 0,
    isActive: true,
    pending: 0,
    failed: 0,
    oldestWaitSeconds: 0,
  },
  processing: {
    activeWorkers: 3,
    totalWorkers: 5,
    totalProcessed: 128,
    totalErrors: 2,
    isActive: true,
    pending: 24,
    failed: 0,
    oldestWaitSeconds: 40,
  },
  backlog: {
    activeWorkers: 0,
    totalWorkers: 5,
    totalProcessed: 80,
    totalErrors: 5,
    isActive: true,
    pending: 156,
    failed: 0,
    oldestWaitSeconds: 720,
  },
  stopped: {
    activeWorkers: 0,
    totalWorkers: 5,
    totalProcessed: 42,
    totalErrors: 3,
    isActive: false,
    pending: 18,
    failed: 0,
    oldestWaitSeconds: 120,
  },
  failures: {
    activeWorkers: 1,
    totalWorkers: 5,
    totalProcessed: 12,
    totalErrors: 8,
    isActive: true,
    pending: 4,
    failed: 8,
    oldestWaitSeconds: 30,
  },
  allFailed: {
    activeWorkers: 0,
    totalWorkers: 5,
    totalProcessed: 0,
    totalErrors: 6,
    isActive: true,
    pending: 0,
    failed: 6,
    oldestWaitSeconds: 0,
  },
}
const queueDebugOptions = computed(() =>
  Object.keys(queueDebugScenarios).map((value) => ({
    value,
    label: $t('dashboard.overview.section.queue.debug.scenarios.' + value),
  })),
)
useDebugSection(() => ({
  id: 'dashboard:queue',
  route: '/dashboard',
  title: $t('dashboard.overview.section.queue.title'),
  controls: [
    {
      key: 'dashboard:queue:enabled',
      label: $t('dashboard.overview.section.queue.debug.label'),
      type: 'switch',
      default: false,
    },
    {
      key: 'dashboard:queue:scenario',
      label: $t('debug.scenario'),
      type: 'select',
      default: 'processing',
      options: queueDebugOptions.value,
      disabled: !queueDebugEnabled.value,
    },
  ],
}))

const queueDisplayStats = computed(() => {
  if (!import.meta.dev || !queueDebugEnabled.value) return dashboardStats.value
  const mock =
    queueDebugScenarios[
      queueDebugScenario.value as keyof typeof queueDebugScenarios
    ]
  if (!mock) return dashboardStats.value
  const attempts = mock.totalProcessed + mock.totalErrors
  return {
    workerPool: {
      ...mock,
      averageSuccessRate: attempts ? (mock.totalProcessed / attempts) * 100 : 0,
    },
    queue: {
      pending: mock.pending,
      failed: mock.failed,
      oldestWaitSeconds: mock.oldestWaitSeconds,
    },
  }
})

const queueState = computed(() => {
  if (!queueDisplayStats.value) return 'unknown'
  const pool = queueDisplayStats.value.workerPool
  if (!pool?.isActive || pool.totalWorkers === 0) return 'stopped'
  if (pool.activeWorkers > 0) return 'processing'
  if ((queueDisplayStats.value.queue?.oldestWaitSeconds || 0) >= 300)
    return 'attention'
  return 'idle'
})

const queueNotice = computed(() => {
  const queue = queueDisplayStats.value?.queue
  if (!queue) return ''
  if (queue.pending > 0 && queueState.value === 'stopped')
    return $t('dashboard.overview.section.queue.stoppedNotice', {
      count: queue.pending,
    })
  if (queue.oldestWaitSeconds >= 300)
    return $t('dashboard.overview.section.queue.waitNotice', {
      minutes: Math.floor(queue.oldestWaitSeconds / 60),
    })
  if (queue.failed > 0)
    return $t('dashboard.overview.section.queue.failedNotice', {
      count: queue.failed,
    })
  return ''
})

const hasQueueActivity = computed(() => {
  const pool = queueDisplayStats.value?.workerPool
  return (pool?.totalProcessed || 0) > 0 || (pool?.totalErrors || 0) > 0
})

const queueSuccessRate = computed(() =>
  Math.min(
    100,
    Math.max(0, queueDisplayStats.value?.workerPool?.averageSuccessRate || 0),
  ),
)

const queueSuccessColor = computed(() => {
  const pool = queueDisplayStats.value?.workerPool
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
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardIndicator
            data-tour="dashboard-photos"
            :title="$t('dashboard.overview.indicator.totalPhotos')"
            icon="tabler:photo"
            variant="subtle"
            :value="dashboardStats?.photos?.total || 0"
            clickable
            @click="$router.push('/dashboard/photos')"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.thisMonth')"
            icon="tabler:photo-plus"
            variant="subtle"
            :value="dashboardStats?.photos?.thisMonth || 0"
          />
          <DashboardIndicator
            data-tour="dashboard-queue"
            :title="$t('dashboard.overview.indicator.queueStatus.title')"
            icon="tabler:loader"
            variant="subtle"
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
            variant="subtle"
            :value="formatBytes(dashboardStats?.storage?.totalSize || 0)"
          />
        </div>

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
            <!-- 系统状态 -->
            <UCard class="@container">
              <template #header>
                <DashboardSectionHeader
                  :title="$t('dashboard.overview.section.queue.title')"
                  icon="tabler:server"
                >
                  <span class="flex items-center gap-1.5 text-xs text-muted">
                    <span
                      class="size-1.5 rounded-full"
                      :class="{
                        'bg-success': queueState === 'processing',
                        'bg-warning': queueState === 'attention',
                        'bg-error': queueState === 'stopped',
                        'bg-neutral-400':
                          queueState === 'idle' || queueState === 'unknown',
                      }"
                    />
                    {{
                      $t(
                        'dashboard.overview.section.queue.states.' + queueState,
                      )
                    }}
                  </span>
                </DashboardSectionHeader>
              </template>

              <div
                class="grid grid-cols-1 @min-[440px]:grid-cols-[100px_minmax(0,1fr)] overflow-hidden rounded-lg border border-default"
              >
                <div
                  class="flex items-center justify-center gap-3 border-b border-default bg-elevated/50 px-3 py-3 @min-[440px]:flex-col @min-[440px]:gap-1 @min-[440px]:border-b-0 @min-[440px]:border-r"
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
                        class="text-(--ui-border-accented)"
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
                    class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 bg-default px-3 py-2.5 @min-[440px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <UIcon
                      name="tabler:activity"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 break-words text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.workers')
                    }}</span>
                    <span
                      class="col-span-2 min-w-0 break-all text-base font-semibold tabular-nums @min-[440px]:col-span-1 @min-[440px]:text-right"
                      >{{
                        (queueDisplayStats?.workerPool?.activeWorkers || 0) +
                        '/' +
                        (queueDisplayStats?.workerPool?.totalWorkers || 0)
                      }}</span
                    >
                  </div>
                  <div
                    class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 bg-default px-3 py-2.5 @min-[440px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <UIcon
                      name="tabler:hourglass"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 break-words text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.pending')
                    }}</span>
                    <span
                      class="col-span-2 min-w-0 break-all text-base font-semibold tabular-nums @min-[440px]:col-span-1 @min-[440px]:text-right"
                      >{{ queueDisplayStats?.queue?.pending || 0 }}</span
                    >
                  </div>
                  <div
                    class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 bg-default px-3 py-2.5 @min-[440px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <UIcon
                      name="tabler:circle-check"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 break-words text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.totalProcessed')
                    }}</span>
                    <span
                      class="col-span-2 min-w-0 break-all text-base font-semibold tabular-nums @min-[440px]:col-span-1 @min-[440px]:text-right"
                      >{{
                        queueDisplayStats?.workerPool?.totalProcessed || 0
                      }}</span
                    >
                  </div>
                  <div
                    class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 bg-default px-3 py-2.5 @min-[440px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <UIcon
                      name="tabler:circle-x"
                      class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 break-words text-xs text-muted">{{
                      $t('dashboard.overview.section.queue.totalFailed')
                    }}</span>
                    <span
                      class="col-span-2 min-w-0 break-all text-base font-semibold tabular-nums @min-[440px]:col-span-1 @min-[440px]:text-right"
                      :class="{
                        'text-error':
                          (queueDisplayStats?.workerPool?.totalErrors || 0) > 0,
                      }"
                      >{{
                        queueDisplayStats?.workerPool?.totalErrors || 0
                      }}</span
                    >
                  </div>
                </div>
              </div>
              <NuxtLink
                v-if="queueNotice"
                to="/dashboard/queue"
                class="mt-3 flex items-start gap-2 text-xs text-muted hover:text-default"
              >
                <UIcon
                  name="tabler:alert-circle"
                  class="size-4 shrink-0 text-warning"
                />
                <span>{{ queueNotice }}</span>
                <UIcon
                  name="tabler:arrow-right"
                  class="ml-auto size-4 shrink-0"
                />
              </NuxtLink>

              <div
                class="mt-4 space-y-2 rounded-lg border border-default bg-elevated/50 p-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="flex items-center gap-2 text-xs text-muted">
                    <UIcon
                      name="tabler:cpu"
                      class="size-4 shrink-0"
                    />
                    {{ $t('dashboard.overview.section.memory.title') }}
                  </span>
                  <span class="text-sm font-semibold tabular-nums">
                    {{
                      memoryUsage === null ? '—' : `${Math.round(memoryUsage)}%`
                    }}
                  </span>
                </div>
                <UProgress
                  :model-value="memoryUsage ?? 0"
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
                <p class="text-xs text-muted tabular-nums">
                  {{
                    memoryUsage === null
                      ? $t('dashboard.overview.memoryUnavailable')
                      : `${formatBytes(dashboardStats?.memory?.used || 0)} / ${formatBytes(dashboardStats?.memory?.total || 0)}`
                  }}
                </p>
              </div>

              <dl
                class="mt-4 divide-y divide-default rounded-lg border border-default px-3"
              >
                <div class="flex items-center justify-between gap-3 py-3">
                  <dt class="flex items-center gap-2 text-xs text-muted">
                    <UIcon
                      name="tabler:tag"
                      class="size-4 shrink-0"
                    />
                    {{ $t('dashboard.overview.section.runtimeInfo.version') }}
                  </dt>
                  <dd class="min-w-0 text-xs">
                    <NuxtLink
                      class="flex items-center gap-1 hover:text-primary"
                      target="_blank"
                      external
                      :to="`https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v${$config.public.VERSION}`"
                    >
                      v{{ $config.public.VERSION }}
                      <UIcon
                        name="tabler:external-link"
                        class="size-3.5 shrink-0 text-muted"
                      />
                    </NuxtLink>
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-3 py-3">
                  <dt class="flex items-center gap-2 text-xs text-muted">
                    <UIcon
                      name="tabler:clock"
                      class="size-4 shrink-0"
                    />
                    {{ $t('dashboard.overview.section.runtimeInfo.uptime') }}
                  </dt>
                  <dd class="text-right text-xs tabular-nums">
                    {{
                      dashboardStats?.uptime != null
                        ? $dayjs
                            .duration(dashboardStats.uptime, 'seconds')
                            .humanize()
                        : '—'
                    }}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-3 py-3">
                  <dt class="flex items-center gap-2 text-xs text-muted">
                    <UIcon
                      name="tabler:server"
                      class="size-4 shrink-0"
                    />
                    {{
                      $t('dashboard.overview.section.runtimeInfo.environment')
                    }}
                  </dt>
                  <dd class="text-right text-xs">
                    {{
                      $t(
                        `dashboard.overview.section.runtimeInfo.systems.${dashboardStats?.runningOn || 'unknown'}`,
                      )
                    }}
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-3 py-3">
                  <dt
                    class="flex shrink-0 items-center gap-2 text-xs leading-5 text-muted"
                  >
                    <UIcon
                      name="tabler:database"
                      class="size-4 shrink-0"
                    />
                    {{ $t('settings.storage.form.typeLabel') }}
                  </dt>
                  <dd class="min-w-0 break-words text-right text-xs">
                    {{
                      dashboardStats?.storage?.activeProvider
                        ? `${$t(`settings.storage.providers.${dashboardStats.storage.activeProvider.provider}`)}(${dashboardStats.storage.activeProvider.name})`
                        : '—'
                    }}
                  </dd>
                </div>
              </dl>
              <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
                <UButton
                  variant="subtle"
                  size="xs"
                  color="neutral"
                  trailing-icon="tabler:external-link"
                  data-tour="dashboard-share"
                  @click="onShareSite"
                >
                  {{ $t('dashboard.overview.shareSite.button') }}
                </UButton>
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

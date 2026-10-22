<script setup lang="ts">
const consoleApi = useConsoleApi()

import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { QueueWarningCode } from '@chronoframe/gallery/shared/utils/queue-warning'

const UButton = resolveComponent('UButton')

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('dashboard.queue.title'),
})

const toast = useToast()

// 状态管理
const isLoading = ref(false)
const deletingTaskIds = ref(new Set<number>())
const selectedTasks = ref<number[]>([])
const statusFilter = ref<string>('all')
const typeFilter = ref<string>('all')

// 数据获取
const { data: queueData, refresh: refreshQueue } = await useConsoleFetch(
  '/api/queue/task/list',
  {
    query: computed(() => ({
      ...(statusFilter.value !== 'all' && { status: statusFilter.value }),
      ...(typeFilter.value !== 'all' && { type: typeFilter.value }),
    })),
  },
)

// 队列统计数据
const queueStats = computed(() => {
  if (!queueData.value?.data)
    return { pending: 0, processing: 0, completed: 0, failed: 0 }

  const stats = { pending: 0, processing: 0, completed: 0, failed: 0 }
  queueData.value.data.forEach((task) => {
    if (task.status === 'pending') stats.pending++
    else if (task.status === 'in-stages') stats.processing++
    else if (task.status === 'completed') stats.completed++
    else if (task.status === 'failed') stats.failed++
  })
  return stats
})

// 刷新数据
const refreshData = async () => {
  isLoading.value = true
  try {
    await refreshQueue()
    selectedTasks.value = []
  } finally {
    isLoading.value = false
  }
}

// 清理非活跃任务
const clearNonActiveTasks = async () => {
  try {
    isLoading.value = true
    const result = await consoleApi('/api/queue/task/clear', {
      method: 'DELETE',
      query: {
        includeCompleted: 'true',
        includeFailed: 'true',
      },
    })

    toast.add({
      title: $t('dashboard.queue.messages.clearSuccess'),
      description: $t('dashboard.queue.messages.clearSuccessDescription', {
        count: result.deletedCount,
      }),
      color: 'success',
    })

    await refreshData()
  } catch (error: any) {
    console.error('Clear tasks failed:', error)
    toast.add({
      title: $t('dashboard.queue.messages.operationFailed'),
      description: error?.message || $t('dashboard.queue.messages.clearFailed'),
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

// 重试单个任务
const retryTask = async (taskId: number) => {
  try {
    await consoleApi('/api/queue/task/retry', {
      method: 'POST',
      body: { taskId },
    })

    toast.add({
      title: $t('dashboard.queue.messages.retrySuccess'),
      color: 'success',
    })

    await refreshData()
  } catch (error: any) {
    console.error('Retry task failed:', error)
    toast.add({
      title: $t('dashboard.queue.messages.operationFailed'),
      description: error?.message || $t('dashboard.queue.messages.retryFailed'),
      color: 'error',
    })
  }
}

// 批量重试失败任务
const retryAllFailedTasks = async () => {
  try {
    isLoading.value = true
    const result = await consoleApi('/api/queue/task/retry-batch', {
      method: 'POST',
      body: { retryAll: true },
    })

    toast.add({
      title: $t('dashboard.queue.messages.batchRetrySuccess'),
      description: $t('dashboard.queue.messages.batchRetrySuccessDescription', {
        count: result.retriedCount,
      }),
      color: 'success',
    })

    await refreshData()
  } catch (error: any) {
    console.error('Batch retry failed:', error)
    toast.add({
      title: $t('dashboard.queue.messages.operationFailed'),
      description:
        error?.message || $t('dashboard.queue.messages.batchRetryFailed'),
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

// 删除单个已完成或失败任务
const deleteTask = async (taskId: number) => {
  if (deletingTaskIds.value.has(taskId)) return
  deletingTaskIds.value.add(taskId)

  try {
    await consoleApi(`/api/queue/task/${taskId}`, {
      method: 'DELETE',
    })

    toast.add({
      title: $t('dashboard.queue.messages.deleteSuccess'),
      color: 'success',
    })

    await refreshData()
  } catch (error: any) {
    console.error('Delete task failed:', error)
    toast.add({
      title: $t('dashboard.queue.messages.operationFailed'),
      description:
        error?.message || $t('dashboard.queue.messages.deleteFailed'),
      color: 'error',
    })
  } finally {
    deletingTaskIds.value.delete(taskId)
  }
}

// 获取状态颜色
const getStatusColor = (
  status: 'pending' | 'in-stages' | 'completed' | 'failed',
) => {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'in-stages':
      return 'info'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    default:
      return 'neutral'
  }
}

// 状态选项
const statusOptions = computed(() => [
  { label: $t('dashboard.queue.filters.all'), value: 'all' },
  { label: $t('dashboard.queue.status.pending'), value: 'pending' },
  { label: $t('dashboard.queue.status.in-stages'), value: 'in-stages' },
  { label: $t('dashboard.queue.status.completed'), value: 'completed' },
  { label: $t('dashboard.queue.status.failed'), value: 'failed' },
])

// 类型选项
const typeOptions = computed(() => [
  { label: $t('dashboard.queue.filters.all'), value: 'all' },
  {
    label: $t('dashboard.queue.types.location-migration'),
    value: 'location-migration',
  },
  { label: $t('dashboard.queue.types.photo'), value: 'photo' },
  {
    label: $t('dashboard.queue.types.live-photo-video'),
    value: 'live-photo-video',
  },
  {
    label: $t('dashboard.queue.types.photo-reverse-geocoding'),
    value: 'photo-reverse-geocoding',
  },
  {
    label: $t('dashboard.queue.types.photo-erase-location'),
    value: 'photo-erase-location',
  },
])

// 展开行状态
const expanded = ref<Record<string, boolean>>({})

// 表格列定义
const columns = computed<TableColumn<any>[]>(() => [
  {
    id: 'expand',
    cell: ({ row }) =>
      h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        icon: 'tabler:chevron-down',
        square: true,
        'aria-label': $t('dashboard.queue.table.expandAria'),
        ui: {
          leadingIcon: [
            'transition-transform',
            row.getIsExpanded() ? 'duration-200 rotate-180' : '',
          ],
        },
        onClick: () => row.toggleExpanded(),
      }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'id',
    header: $t('dashboard.queue.table.id'),
  },
  {
    id: 'type',
    accessorFn: (row) => row.payload.type,
    header: $t('dashboard.queue.table.type'),
  },
  {
    accessorKey: 'status',
    header: $t('dashboard.queue.table.status'),
  },
  {
    accessorKey: 'attempts',
    header: $t('dashboard.queue.table.attempts'),
  },
  {
    accessorKey: 'priority',
    header: $t('dashboard.queue.table.priority'),
  },
  {
    accessorKey: 'statusStage',
    header: $t('dashboard.queue.table.stage'),
  },
  {
    accessorKey: 'createdAt',
    header: $t('dashboard.queue.table.createdAt'),
  },
  {
    id: 'actions',
    header: $t('dashboard.queue.table.actions'),
  },
])

// 自动刷新
useIntervalFn(refreshData, 10000) // 每10秒刷新一次
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('dashboard.queue.title')">
        <template #right>
          <UButton
            icon="tabler:refresh"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('dashboard.queue.actions.refresh')"
            :title="$t('dashboard.queue.actions.refresh')"
            :loading="isLoading"
            :disabled="isLoading"
            @click="refreshData"
          />
          <UDropdownMenu
            :content="{ align: 'end' }"
            :items="[
              [
                {
                  label: $t('dashboard.queue.actions.retryAll'),
                  icon: 'tabler:refresh',
                  disabled: isLoading,
                  onSelect: () => retryAllFailedTasks(),
                },
              ],
              [
                {
                  label: $t('dashboard.queue.actions.clearNonActive'),
                  icon: 'tabler:trash',
                  color: 'error',
                  disabled: isLoading,
                  onSelect: () => clearNonActiveTasks(),
                },
              ],
            ]"
          >
            <UButton
              icon="tabler:dots-vertical"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="$t('dashboard.queue.actions.moreActions')"
              :title="$t('dashboard.queue.actions.moreActions')"
              :disabled="isLoading"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <!-- 状态指示器 -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardIndicator
            :title="$t('dashboard.queue.indicator.pending')"
            icon="tabler:clock"
            variant="subtle"
            :value="queueStats.pending"
          />
          <DashboardIndicator
            :title="$t('dashboard.queue.indicator.processing')"
            icon="tabler:loader"
            variant="subtle"
            :value="queueStats.processing"
          />
          <DashboardIndicator
            :title="$t('dashboard.queue.indicator.completed')"
            icon="tabler:check"
            variant="subtle"
            :value="queueStats.completed"
          />
          <DashboardIndicator
            :title="$t('dashboard.queue.indicator.failed')"
            icon="tabler:alert-triangle"
            variant="subtle"
            :value="queueStats.failed"
          />
        </div>

        <!-- 筛选器和表格 -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between pb-2">
              <h2 class="text-lg font-semibold">
                {{ $t('dashboard.queue.taskListTitle') }}
              </h2>
              <div class="flex items-center gap-2">
                <USelectMenu
                  v-model="statusFilter"
                  :items="statusOptions"
                  value-key="value"
                  size="sm"
                  variant="soft"
                  class="w-32"
                  :search-input="false"
                />
                <USelectMenu
                  v-model="typeFilter"
                  :items="typeOptions"
                  value-key="value"
                  size="sm"
                  variant="soft"
                  class="w-32"
                  :search-input="false"
                />
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <!-- 任务表格 -->
            <UTable
              v-model:expanded="expanded"
              :data="queueData?.data || []"
              :columns="columns"
              :loading="isLoading"
              :empty-state="{
                icon: 'tabler:inbox',
                label: $t('dashboard.queue.messages.noTasks'),
              }"
              class="w-full"
            >
              <!-- 任务类型 -->
              <template #type-cell="{ row }">
                <UBadge
                  :label="
                    $t(`dashboard.queue.types.${row.original.payload.type}`)
                  "
                  variant="soft"
                  :color="
                    row.original.payload.type === 'photo' ? 'info' : 'secondary'
                  "
                  size="sm"
                />
              </template>

              <!-- 状态 -->
              <template #status-cell="{ row }">
                <div class="flex flex-wrap items-center gap-1">
                  <UBadge
                    :label="$t(`dashboard.queue.status.${row.original.status}`)"
                    variant="soft"
                    :color="getStatusColor(row.original.status)"
                    size="sm"
                  />
                  <UBadge
                    v-if="
                      row.original.status === 'completed' &&
                      row.original.warningCode === QueueWarningCode.AlbumMissing
                    "
                    :label="$t('common.albumAssignment.warning')"
                    :aria-label="$t('common.albumAssignment.missing')"
                    :title="$t('common.albumAssignment.missing')"
                    icon="tabler:alert-triangle"
                    color="warning"
                    variant="soft"
                    size="sm"
                  />
                </div>
              </template>

              <!-- 尝试次数 -->
              <template #attempts-cell="{ row }">
                <span class="text-sm">
                  {{ row.original.attempts }}/{{ row.original.maxAttempts }}
                </span>
              </template>

              <!-- 处理阶段 -->
              <template #statusStage-cell="{ row }">
                <span
                  v-if="row.original.statusStage"
                  class="text-xs text-gray-500"
                >
                  {{ $t(`dashboard.queue.stages.${row.original.statusStage}`) }}
                </span>
                <span
                  v-else
                  class="text-xs text-gray-400"
                  >-</span
                >
              </template>

              <!-- 创建时间 -->
              <template #createdAt-cell="{ row }">
                <span class="text-sm">{{
                  $dayjs(row.original.createdAt).format('MM-DD HH:mm:ss')
                }}</span>
              </template>

              <!-- 操作按钮 -->
              <template #actions-cell="{ row }">
                <div class="flex items-center gap-1">
                  <UButton
                    v-if="row.original.status === 'failed'"
                    icon="tabler:refresh"
                    size="xs"
                    variant="soft"
                    color="warning"
                    @click="retryTask(row.original.id)"
                  >
                    {{ $t('dashboard.queue.buttons.retry') }}
                  </UButton>
                  <UButton
                    v-if="
                      row.original.status === 'completed' ||
                      row.original.status === 'failed'
                    "
                    icon="tabler:trash"
                    size="xs"
                    variant="soft"
                    color="error"
                    :loading="deletingTaskIds.has(row.original.id)"
                    :disabled="deletingTaskIds.has(row.original.id)"
                    @click="deleteTask(row.original.id)"
                  >
                    {{ $t('dashboard.queue.buttons.delete') }}
                  </UButton>
                  <span
                    v-if="
                      row.original.status === 'pending' ||
                      row.original.status === 'in-stages'
                    "
                    class="text-xs text-gray-400"
                  >
                    -
                  </span>
                </div>
              </template>

              <!-- 展开行内容 -->
              <template #expanded="{ row }">
                <div class="px-2">
                  <div class="space-y-3">
                    <!-- 任务ID和类型 -->
                    <div class="flex gap-4">
                      <div>
                        <p class="text-xs text-neutral-500">
                          {{ $t('dashboard.queue.table.detail.photoId') }}
                        </p>
                        <p class="text-sm capitalize">
                          {{ row.original.payload.photoId || '-' }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs text-neutral-500">
                          {{ $t('dashboard.queue.table.id') }}
                        </p>
                        <p class="font-mono text-sm">{{ row.original.id }}</p>
                      </div>
                      <div>
                        <p class="text-xs text-neutral-500">
                          {{ $t('dashboard.queue.table.type') }}
                        </p>
                        <p class="text-sm capitalize">
                          {{ row.original.payload.type }}
                        </p>
                      </div>
                    </div>

                    <UAlert
                      v-if="
                        row.original.status === 'completed' &&
                        row.original.warningCode ===
                          QueueWarningCode.AlbumMissing
                      "
                      class="mt-3"
                      color="warning"
                      variant="soft"
                      icon="tabler:alert-triangle"
                      :description="$t('common.albumAssignment.missing')"
                    />

                    <!-- 错误信息（仅在失败状态显示） -->
                    <div
                      v-if="
                        row.original.status === 'failed' &&
                        row.original.errorMessage
                      "
                      class="mt-3"
                    >
                      <p class="text-xs text-neutral-500 mb-1">
                        {{ $t('dashboard.queue.table.errorMessage') }}
                      </p>
                      <div
                        class="p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-100 dark:border-red-900/30"
                      >
                        <p
                          class="text-sm text-red-700 dark:text-red-300 wrap-break-word font-mono"
                        >
                          {{ row.original.errorMessage }}
                        </p>
                      </div>
                    </div>

                    <!-- Payload 信息 -->
                    <div
                      v-if="row.original.payload"
                      class="mt-3"
                    >
                      <p class="text-xs text-gray-500 mb-1">
                        {{ $t('dashboard.queue.table.detail.payload') }}
                      </p>
                      <pre
                        class="text-xs bg-neutral-100/50 dark:bg-neutral-800/50 p-2 rounded overflow-x-auto text-neutral-700 dark:text-neutral-300"
                        >{{
                          JSON.stringify(row.original.payload, null, 2)
                        }}</pre>
                    </div>
                  </div>
                </div>
              </template>
            </UTable>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* 确保表格在小屏幕上正常显示 */
:deep(.table-wrapper) {
  overflow-x: auto;
}
</style>

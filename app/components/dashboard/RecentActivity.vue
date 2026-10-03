<script lang="ts" setup>
type ActivityStatus = 'pending' | 'in-stages' | 'completed' | 'failed'

type ActivityItem = {
  id: number
  type: string
  status: ActivityStatus
  statusStage: string | null
  errorMessage: string | null
  createdAt: string | Date
  completedAt: string | Date | null
  fileName: string | null
  photo: {
    id: string
    title: string | null
    thumbnailUrl: string | null
    thumbnailHash: string | null
    originalUrl: string | null
  } | null
}

const dayjs = useDayjs()

const {
  data: activityData,
  pending,
  refresh,
} = await useFetch('/api/queue/recent')

const refreshInterval = setInterval(() => {
  refresh()
}, 5000)

onBeforeUnmount(() => {
  clearInterval(refreshInterval)
})

const items = computed<ActivityItem[]>(
  () => (activityData.value?.tasks as ActivityItem[] | undefined) || [],
)

const getStatusColor = (status: ActivityStatus) => {
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

const getItemTitle = (item: ActivityItem) => {
  return (
    item.photo?.title ||
    item.fileName ||
    $t(`dashboard.queue.types.${item.type}`)
  )
}

const getItemMeta = (item: ActivityItem) => {
  const parts: string[] = []
  const titleIsTaskType = !item.photo?.title && !item.fileName

  if (!titleIsTaskType) {
    parts.push($t(`dashboard.queue.types.${item.type}`))
  }

  if (item.status === 'in-stages' && item.statusStage) {
    parts.push($t(`dashboard.queue.stages.${item.statusStage}`))
  }

  const timestamp = item.completedAt || item.createdAt
  if (timestamp) {
    parts.push(dayjs(timestamp).fromNow())
  }

  return parts.join(' · ')
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3 pb-1.5">
        <h2 class="text-lg font-semibold">
          {{ $t('dashboard.overview.section.recentActivity.title') }}
        </h2>
        <UButton
          to="/dashboard/queue"
          size="xs"
          variant="ghost"
          color="neutral"
          trailing-icon="tabler:arrow-right"
        >
          {{ $t('dashboard.overview.section.recentActivity.viewQueue') }}
        </UButton>
      </div>
    </template>

    <div
      v-if="pending && items.length === 0"
      class="flex items-center justify-center py-10"
    >
      <Icon
        name="svg-spinners:180-ring-with-bg"
        class="size-8 opacity-50"
        mode="svg"
      />
    </div>

    <div
      v-else-if="items.length === 0"
      class="flex flex-col items-center justify-center gap-2 py-10 text-center"
    >
      <UIcon
        name="tabler:inbox"
        class="size-8 text-neutral-400"
      />
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ $t('dashboard.overview.section.recentActivity.empty') }}
      </p>
    </div>

    <ul
      v-else
      class="divide-y divide-neutral-100 dark:divide-neutral-800"
    >
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
      >
        <NuxtLink
          :to="item.photo ? '/dashboard/photos' : '/dashboard/queue'"
          class="shrink-0"
        >
          <ThumbImage
            v-if="item.photo?.thumbnailUrl || item.photo?.originalUrl"
            :src="item.photo.thumbnailUrl || item.photo.originalUrl || ''"
            :alt="getItemTitle(item)"
            :thumbhash="item.photo.thumbnailHash || ''"
            class="size-12 rounded-md shadow-sm bg-neutral-100 dark:bg-neutral-800"
            :lazy="false"
          />
          <div
            v-else
            class="size-12 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
          >
            <UIcon
              name="tabler:list-check"
              class="size-5 text-neutral-400"
            />
          </div>
        </NuxtLink>

        <div class="min-w-0 flex-1">
          <NuxtLink
            to="/dashboard/queue"
            class="block truncate text-sm font-medium hover:text-primary transition-colors"
          >
            {{ getItemTitle(item) }}
          </NuxtLink>
          <p
            class="truncate text-xs text-neutral-500 dark:text-neutral-400 mt-0.5"
          >
            {{ getItemMeta(item) }}
          </p>
          <p
            v-if="item.status === 'failed' && item.errorMessage"
            class="truncate text-xs text-error mt-0.5"
          >
            {{ item.errorMessage }}
          </p>
        </div>

        <UBadge
          :label="$t(`dashboard.queue.status.${item.status}`)"
          variant="soft"
          :color="getStatusColor(item.status)"
          size="sm"
          class="shrink-0"
        />
      </li>
    </ul>
  </UCard>
</template>

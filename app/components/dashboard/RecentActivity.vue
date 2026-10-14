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

useIntervalFn(refresh, 5000)

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
  <UCard :ui="{ body: 'px-4 py-4 sm:px-6 sm:py-4' }">
    <template #header>
      <DashboardSectionHeader
        :title="$t('dashboard.overview.section.recentActivity.title')"
        icon="tabler:activity"
      >
        <UButton
          to="/dashboard/queue"
          size="xs"
          variant="ghost"
          color="neutral"
          trailing-icon="tabler:arrow-right"
        >
          {{ $t('dashboard.overview.section.recentActivity.viewQueue') }}
        </UButton>
      </DashboardSectionHeader>
    </template>

    <div
      v-if="pending && items.length === 0"
      class="flex items-center justify-center py-6"
    >
      <Icon
        name="svg-spinners:180-ring-with-bg"
        class="size-6 text-dimmed"
        mode="svg"
      />
    </div>

    <div
      v-else-if="items.length === 0"
      class="flex flex-col items-center justify-center gap-2 py-6 text-center"
    >
      <UIcon
        name="tabler:inbox"
        class="size-6 text-dimmed"
      />
      <p class="text-xs text-muted">
        {{ $t('dashboard.overview.section.recentActivity.empty') }}
      </p>
    </div>

    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
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
            class="size-9 rounded-md bg-elevated"
            :lazy="false"
          />
          <div
            v-else
            class="size-9 rounded-md bg-elevated flex items-center justify-center"
          >
            <UIcon
              name="tabler:list-check"
              class="size-4 text-dimmed"
            />
          </div>
        </NuxtLink>

        <div class="min-w-0 flex-1">
          <NuxtLink
            to="/dashboard/queue"
            class="block truncate text-sm leading-5 hover:text-primary transition-colors"
          >
            {{ getItemTitle(item) }}
          </NuxtLink>
          <p class="truncate text-xs leading-4 text-muted mt-0.5">
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
          size="xs"
          class="shrink-0 font-normal"
        />
      </li>
    </ul>
  </UCard>
</template>

<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.dashboard'),
})

interface SystemHealth {
  uptime: number
  memory: {
    used: number
    total: number
  }
  processing: {
    active: boolean
    queued: number
  }
  environment?: string
}

const { data: photos, refresh: refreshPhotos } = await useFetch('/api/photos', {
  server: false,
})

const { data: healthStatus, refresh: refreshHealth } =
  await useFetch<SystemHealth>('/api/health/system', {
    server: false,
  })

const isLoading = ref(false)

const refreshData = async () => {
  isLoading.value = true
  try {
    await Promise.all([refreshPhotos(), refreshHealth()])
  } finally {
    isLoading.value = false
  }
}

// 定期刷新状态
const refreshInterval = setInterval(refreshData, 30000)

onBeforeUnmount(() => {
  clearInterval(refreshInterval)
})
</script>

<template>
  <div class="flex flex-col gap-6 h-full p-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">仪表板概览</h1>
      <UButton
        icon="i-tabler-refresh"
        variant="outline"
        :loading="isLoading"
        @click="refreshData"
      >
        刷新
      </UButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- 总照片数量 -->
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              总照片数量
            </p>
            <p class="text-2xl font-bold">{{ photos?.length || 0 }}</p>
          </div>
          <UIcon
            name="i-tabler-photo"
            class="w-8 h-8 text-info"
          />
        </div>
      </UCard>

      <!-- 系统内存使用 -->
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              内存使用率
              <span 
                v-if="healthStatus?.environment" 
                class="text-xs ml-1 px-1 py-0.5 bg-primary/10 text-primary rounded"
                :title="`运行环境: ${healthStatus.environment}`"
              >
                {{ healthStatus.environment }}
              </span>
            </p>
            <p class="text-2xl font-bold">
              {{
                healthStatus?.memory
                  ? Math.round(
                      (healthStatus.memory.used / healthStatus.memory.total) *
                        100,
                    )
                  : 0
              }}%
            </p>
            <p class="text-xs text-neutral-400 mt-1">
              {{
                healthStatus?.memory
                  ? `${Math.round(healthStatus.memory.used / 1024 / 1024 / 1024 * 100) / 100}GB / ${Math.round(healthStatus.memory.total / 1024 / 1024 / 1024 * 100) / 100}GB`
                  : '系统内存'
              }}
            </p>
          </div>
          <UIcon
            name="i-tabler-cpu"
            class="w-8 h-8 text-success"
          />
        </div>
      </UCard>

      <!-- 系统运行时间 -->
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              运行时间
            </p>
            <p class="text-2xl font-bold">
              {{
                healthStatus?.uptime
                  ? Math.round(healthStatus.uptime / 3600)
                  : 0
              }}h
            </p>
          </div>
          <UIcon
            name="i-tabler-clock"
            class="w-8 h-8 text-warning-500"
          />
        </div>
      </UCard>

      <!-- 系统状态 -->
      <UCard>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              系统状态
            </p>
            <p class="text-2xl font-bold">
              <UBadge
                :color="
                  healthStatus?.processing?.active !== false
                    ? 'success'
                    : 'warning'
                "
                variant="solid"
              >
                {{
                  healthStatus?.processing?.active !== false ? '正常' : '待机'
                }}
              </UBadge>
            </p>
          </div>
          <UIcon
            name="i-tabler-heart"
            class="w-8 h-8 text-error"
          />
        </div>
      </UCard>
    </div>

    <!-- 系统信息 -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">系统信息</h2>
      </template>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">应用版本</p>
          <NuxtLink
            class="text-lg font-bold"
            target="_blank"
            external
            :to="`https://github.com/HoshinoSuzumi/chronoframe/releases/tag/v${$config.public.VERSION}`"
          >
            v{{ $config.public.VERSION }}
          </NuxtLink>
        </div>
        <div>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">最后更新</p>
          <p class="text-lg font-bold">
            {{ new Date().toLocaleDateString('zh-CN') }}
          </p>
        </div>
      </div>
    </UCard>

    <!-- 最近照片 -->
    <UCard v-if="photos?.length">
      <template #header>
        <h2 class="text-lg font-semibold">最近照片</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="photo in photos.slice(0, 12)"
          :key="photo.id"
          class="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg"
        >
          <div
            class="w-12 h-12 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center relative"
          >
            <!-- <img
              :src="photo.thumbnailUrl || ''"
              alt="Photo thumbnail"
              class="w-full h-full rounded object-cover"
            /> -->
            <ThumbImage
              :src="photo.thumbnailUrl || ''"
              :alt="photo.title || 'Photo thumbnail'"
              :thumbhash="photo.thumbnailHash || ''"
              class="w-full h-full rounded object-cover"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">{{ photo.title || photo.id }}</p>
            <p class="text-sm text-neutral-500 inline-flex gap-2">
              <span>
                {{
                  photo.dateTaken
                    ? $dayjs(photo.dateTaken).format('YYYY-MM-DD')
                    : '未知日期'
                }}
              </span>
              <span>{{ formatBytes(photo.fileSize || 0) }}</span>
            </p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<style scoped></style>

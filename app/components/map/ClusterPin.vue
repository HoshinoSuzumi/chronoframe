<script lang="ts" setup>
import { motion } from 'motion-v'
import ThumbImage from '../ThumbImage.vue'
import { twMerge } from 'tailwind-merge'
import type { ClusterPoint } from '~~/shared/types/map'

const props = withDefaults(
  defineProps<{
    clusterPoint: ClusterPoint
    clusterCount?: number
    markerId?: string
  }>(),
  {
    clusterCount: 6,
    markerId: undefined,
  },
)

const emit = defineEmits<{
  click: [clusterPoint: ClusterPoint]
  close: []
}>()

const dayjs = useDayjs()

const onClick = () => {
  emit('click', props.clusterPoint)
}

const clusteredPhotos = computed(
  () => props.clusterPoint.properties.clusteredPhotos || [],
)

const pointCount = computed(
  () => props.clusterPoint.properties.point_count || 1,
)

const representativePhoto = computed(
  () => props.clusterPoint.properties.marker!,
)

const sizeDelta = computed(() => {
  const count = pointCount.value
  return Math.min(64, Math.max(40, 32 + Math.log(count) * 8))
})
</script>

<template>
  <MapboxDefaultMarker
    :key="`marker-cluster-${representativePhoto.id}`"
    :marker-id="`marker-cluster-${markerId || representativePhoto.id}`"
    :lnglat="props.clusterPoint.geometry.coordinates"
    :options="{}"
  >
    <template #marker>
      <HoverCardRoot
        :open-delay="300"
        :close-delay="100"
        @close="$event.preventDefault()"
      >
        <HoverCardTrigger as-child>
          <motion.div
            class="relative group cursor-pointer"
            :initial="{ opacity: 0, scale: 0 }"
            :animate="{ opacity: 1, scale: 1 }"
            :while-hover="{ scale: 1.1 }"
            :while-press="{ scale: 0.95 }"
            :transition="{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }"
            @click="onClick"
          >
            <!-- Background image -->
            <div class="absolute inset-0 overflow-hidden rounded-full">
              <ThumbImage
                :src="representativePhoto.thumbnailUrl!"
                :alt="
                  representativePhoto.title || `聚类 ${representativePhoto.id}`
                "
                :thumbhash="representativePhoto.thumbnailHash"
                :threshold="0.1"
                root-margin="100px"
                class="h-full w-full object-cover opacity-50"
              />
              <div
                class="absolute inset-0 bg-gradient-to-br from-blue/40 to-purple/60 dark:from-blue/60 dark:to-purple/80"
              />
            </div>

            <!-- Cluster marker -->
            <div
              :class="
                twMerge(
                  'relative flex flex-col justify-center items-center rounded-full border shadow-lg hover:shadow-xl',
                  'border-white/50 bg-white/80 hover:bg-white/90 dark:border-white/30 dark:bg-black/60 dark:hover:bg-black/80',
                )
              "
              :style="{
                width: `${sizeDelta}px`,
                height: `${sizeDelta}px`,
              }"
            >
              <div
                class="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-white/5"
              />

              <!-- Cluster count -->
              <span
                class="text-neutral-800 dark:text-white text-sm font-bold drop-shadow leading-none"
              >
                {{ pointCount }}
              </span>

              <div
                class="absolute inset-0 rounded-full shadow-inner shadow-black/5"
              />
            </div>
          </motion.div>
        </HoverCardTrigger>
        <HoverCardPortal>
          <AnimatePresence>
            <HoverCardContent
              as-child
              side="top"
              align="center"
              :side-offset="8"
            >
              <motion.div
                class="bg-white/50 dark:bg-black/50 backdrop-blur-md border border-neutral-100 dark:border-neutral-700 rounded-lg shadow-lg w-xs max-w-xs overflow-hidden relative"
                :initial="{ opacity: 0, scale: 0.95, y: 4 }"
                :animate="{ opacity: 1, scale: 1, y: 0 }"
                :exit="{ opacity: 0, scale: 0.95, y: 4 }"
                :transition="{ duration: 0.2 }"
              >
                <!-- Cluster preview -->
                <div class="relative overflow-hidden p-3 space-y-3">
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-neutral-900 dark:text-white">
                      {{
                        $t('map.cluster.nearbyPhotos', [clusteredPhotos.length])
                      }}
                    </h3>
                    <div class="text-neutral-500 dark:text-muted text-[10px]">
                      {{ $t('map.cluster.details') }}
                    </div>
                  </div>
                  <!-- Show grid of photos for cluster -->
                  <div class="grid grid-cols-3 gap-2 h-full">
                    <motion.div
                      v-for="(photo, index) in clusteredPhotos.slice(
                        0,
                        clusterCount,
                      )"
                      :key="photo.id"
                      :initial="{ opacity: 0, scale: 0.5 }"
                      :animate="{ opacity: 1, scale: 1 }"
                      :transition="{
                        delay: index * 0.05,
                        type: 'spring',
                        duration: 0.4,
                        bounce: 0,
                      }"
                      class="relative overflow-hidden rounded group"
                    >
                      <NuxtLink
                        class="block w-full h-full"
                        :to="`/${photo.id}`"
                        target="_blank"
                        rel="noopener"
                      >
                        <ThumbImage
                          :src="photo.thumbnailUrl!"
                          :alt="photo.title || `照片 ${photo.id}`"
                          :thumbhash="photo.thumbnailHash"
                          :threshold="0.1"
                          root-margin="200px"
                          class="w-full aspect-square object-cover"
                        />
                      </NuxtLink>
                      <!-- Hover overlay -->
                      <div
                        class="absolute inset-0 bg-white/30 dark:bg-black/20 duration-300 flex justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-none"
                      >
                        <div
                          class="rounded-full bg-white/80 dark:bg-black/50 p-2 backdrop-blur-sm flex justify-center items-center"
                        >
                          <Icon name="tabler:external-link" class="text-neutral-700 dark:text-white" />
                        </div>
                      </div>
                      <!-- Show +N overlay for the last image if there are more -->
                      <div
                        v-if="
                          index === clusterCount - 1 &&
                          clusteredPhotos.length > clusterCount
                        "
                        class="absolute inset-0 bg-white/80 dark:bg-black/60 flex items-center justify-center cursor-pointer pointer-events-none"
                      >
                        <span class="text-neutral-800 dark:text-white text-lg font-bold">
                          +{{ clusteredPhotos.length - clusterCount }}
                        </span>
                      </div>
                    </motion.div>
                  </div>

                  <div class="relative space-y-1">
                    <!-- cities -->
                    <div
                      v-if="
                        clusteredPhotos.length &&
                        clusteredPhotos.some((p) => p.city)
                      "
                      class="flex items-center gap-1 text-xs text-neutral-600 dark:text-muted font-medium mt-2"
                    >
                      <Icon
                        name="tabler:map-pin"
                        class="size-4"
                      />
                      <span class="truncate">
                        {{
                          clusteredPhotos
                            .map((p) => p.city)
                            .filter((v, i, a) => v && a.indexOf(v) === i)
                            .join(', ')
                        }}
                      </span>
                    </div>
                    <!-- taken date range -->
                    <div
                      v-if="
                        clusteredPhotos.length &&
                        clusteredPhotos.some((p) => p.dateTaken)
                      "
                      class="flex items-center gap-1 text-xs text-neutral-600 dark:text-muted font-medium mt-2"
                    >
                      <Icon
                        name="tabler:calendar-week"
                        class="size-4"
                      />
                      <span class="truncate">
                        {{
                          (() => {
                            const dates = clusteredPhotos
                              .map((p) => p.dateTaken)
                              .filter(Boolean)
                              .sort()
                            if (dates.length === 0) return ''
                            if (dates.length === 1)
                              return dayjs(dates[0]).format('l')
                            return `${dayjs(dates[0]).format('l')} - ${dayjs(dates[dates.length - 1]).format('l')}`
                          })()
                        }}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </HoverCardContent>
          </AnimatePresence>
        </HoverCardPortal>
      </HoverCardRoot>
    </template>
  </MapboxDefaultMarker>
</template>

<style scoped></style>

<script lang="ts" setup>
import { motion } from 'motion-v'
import ThumbImage from '../ThumbImage.vue'
import { twMerge } from 'tailwind-merge'
import type { ClusterPoint } from '~~/shared/types/map'

const props = withDefaults(
  defineProps<{
    clusterPoint: ClusterPoint
    isSelected?: boolean
    markerId?: string
  }>(),
  {
    isSelected: false,
    markerId: undefined,
  },
)

const emit = defineEmits<{
  click: [clusterPoint: ClusterPoint]
  close: []
}>()

const dayjs = useDayjs()
const marker = computed(() => props.clusterPoint.properties.marker!)

const onClick = () => {
  emit('click', props.clusterPoint)
}
</script>

<template>
  <MapboxDefaultMarker
    ref="markerRef"
    :key="`marker-single-${marker.id}`"
    :marker-id="`marker-single-${markerId || marker.id}`"
    :lnglat="props.clusterPoint.geometry.coordinates"
    :options="{}"
  >
    <template #marker>
      <HoverCardRoot
        :open="isSelected || undefined"
        :open-delay="isSelected ? 0 : 600"
        :close-delay="isSelected ? Number.MAX_SAFE_INTEGER : 100"
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
            <div
              v-if="isSelected"
              class="bg-primary/20 dark:bg-primary/30 absolute -inset-1 animate-pulse rounded-full"
            />

            <div class="absolute inset-0 overflow-hidden rounded-full">
              <ThumbImage
                :src="marker.thumbnailUrl!"
                :alt="marker.title || `照片 ${marker.id}`"
                :thumbhash="marker.thumbnailHash"
                :threshold="0.1"
                root-margin="100px"
                class="h-full w-full object-cover opacity-50"
              />
              <div
                class="absolute inset-0 bg-gradient-to-br from-green/40 to-emerald/60 dark:from-green/60 dark:to-emerald/80"
              />
            </div>

            <!-- Single photo marker -->
            <div
              :class="
                twMerge(
                  'relative size-10 flex justify-center items-center rounded-full border shadow-lg hover:shadow-xl',
                  isSelected
                    ? 'border-primary/60 bg-primary/80 shadow-primary/30 dark:border-primary/40 dark:bg-primary/90 dark:shadow-primary/50'
                    : 'border-white/50 bg-white/80 hover:bg-white/90 dark:border-white/30 dark:bg-black/80 dark:hover:bg-black/90',
                )
              "
            >
              <div
                class="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-white/5"
              />
              <Icon
                name="tabler:photo"
                class="size-5 text-neutral-700 dark:text-white drop-shadow"
              />
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
              @pointer-down-outside="
                isSelected ? $event.preventDefault() : undefined
              "
              @escape-key-down="
                isSelected ? $event.preventDefault() : undefined
              "
              @focus-outside="isSelected ? $event.preventDefault() : undefined"
              @interact-outside="
                isSelected ? $event.preventDefault() : undefined
              "
            >
              <motion.div
                class="bg-white/50 dark:bg-black/50 backdrop-blur-md border border-neutral-100 dark:border-neutral-700 rounded-lg shadow-lg w-xs max-w-xs overflow-hidden relative"
                :initial="{ opacity: 0, scale: 0.95, y: 4 }"
                :animate="{ opacity: 1, scale: 1, y: 0 }"
                :exit="{ opacity: 0, scale: 0.95, y: 4 }"
                :transition="{ duration: 0.2 }"
              >
                <MapGlassButton
                  v-if="isSelected"
                  class="absolute top-2 right-2 z-10 size-8"
                  @click="$emit('close')"
                >
                  <Icon
                    name="tabler:x"
                    class="size-5"
                  />
                </MapGlassButton>

                <!-- Single photo preview -->
                <div class="relative h-36 overflow-hidden">
                  <ThumbImage
                    :src="marker.thumbnailUrl!"
                    :alt="marker.title || `照片 ${marker.id}`"
                    :thumbhash="marker.thumbnailHash"
                    :threshold="0.1"
                    root-margin="200px"
                    class="w-full h-full object-cover"
                  />
                </div>
                <div class="relative px-3 py-2 space-y-1">
                  <!-- Header -->
                  <NuxtLink
                    :to="`/${marker.id}`"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-2 text-neutral-900 dark:text-white group/link"
                  >
                    <h3 class="flex-1 text-lg font-semibold truncate">
                      {{ marker.title || `照片 ${marker.id}` }}
                    </h3>
                    <Icon
                      name="tabler:external-link"
                      class="size-4 text-neutral-500 dark:text-muted opacity-0 group-hover/link:opacity-100 transition-opacity"
                    />
                  </NuxtLink>

                  <!-- Metadata -->
                  <div class="space-y-1">
                    <div
                      v-if="marker.city || marker.exif?.DateTimeOriginal"
                      class="flex items-center gap-1 text-xs text-neutral-600 dark:text-muted font-medium mb-2"
                    >
                      <div v-if="marker.city">
                        <span class="truncate">
                          {{ marker.city }}
                        </span>
                      </div>
                      <span>·</span>
                      <div v-if="marker.exif?.DateTimeOriginal">
                        <span class="truncate">
                          {{ dayjs(marker.exif.DateTimeOriginal).format('ll') }}
                        </span>
                      </div>
                    </div>
                    <!-- Camera -->
                    <div
                      v-if="marker.exif?.Make || marker.exif?.Model"
                      class="flex items-center gap-1 text-xs text-neutral-600 dark:text-muted"
                    >
                      <Icon
                        name="tabler:camera"
                        class="size-4"
                      />
                      <span class="truncate">
                        {{
                          [marker.exif?.Make, marker.exif?.Model]
                            .filter(Boolean)
                            .join(' ')
                        }}
                      </span>
                    </div>
                    <!-- Latlng -->
                    <div
                      v-if="
                        marker.exif?.GPSLatitude || marker.exif?.GPSLongitude
                      "
                      class="flex items-center gap-1 text-xs text-neutral-600 dark:text-muted"
                    >
                      <Icon
                        name="tabler:map-pin"
                        class="size-4"
                      />
                      <span class="truncate font-mono">
                        {{
                          marker.exif?.GPSLatitude
                            ? `${Math.abs(Number(marker.exif?.GPSLatitude)).toFixed(4)}°${marker.exif?.GPSLatitudeRef}`
                            : '未知'
                        }},
                        {{
                          marker.exif?.GPSLongitude
                            ? `${Math.abs(Number(marker.exif?.GPSLongitude)).toFixed(4)}°${marker.exif?.GPSLongitudeRef}`
                            : '未知'
                        }}
                      </span>
                    </div>
                    <!-- Altitude -->
                    <div
                      v-if="marker.exif?.GPSAltitude"
                      class="flex items-center gap-1 text-xs text-neutral-600 dark:text-muted"
                    >
                      <Icon
                        name="tabler:mountain"
                        class="size-4"
                      />
                      <span class="truncate font-mono">
                        {{
                          `${marker.exif.GPSAltitudeRef === 'Below Sea Level' ? '-' : ''}${Math.abs(Number(marker.exif.GPSAltitude)).toFixed(1)}m`
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

<script lang="ts" setup>
import { motion } from 'motion-v'
import ThumbImage from '../ui/ThumbImage.vue'
import { twMerge } from 'tailwind-merge'
import type { ClusterPoint } from '~~/shared/types/map'

const props = withDefaults(
  defineProps<{
    clusterPoint: ClusterPoint
    isSelected?: boolean
    markerId?: string
    analysisMode?: 'none' | 'focalLength' | 'shutterSpeed' | 'altitude'
  }>(),
  {
    isSelected: false,
    markerId: undefined,
    analysisMode: 'none',
  },
)

const emit = defineEmits<{
  click: [clusterPoint: ClusterPoint]
  close: []
}>()

const dayjs = useDayjs()
const marker = computed(() => props.clusterPoint.properties.marker!)
const hoverOpen = ref(false)

const parseExifNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const fractionMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/)
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1])
    const denominator = Number(fractionMatch[2])
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null
    }
    return numerator / denominator
  }

  const numericMatch = trimmed.match(/-?\d+(?:\.\d+)?/)
  if (!numericMatch) {
    return null
  }

  const parsed = Number(numericMatch[0])
  return Number.isFinite(parsed) ? parsed : null
}

const focalLengthValue = computed(() => {
  return parseExifNumber(
    marker.value.exif?.FocalLengthIn35mmFormat ?? marker.value.exif?.FocalLength,
  )
})

const shutterSecondsValue = computed(() => {
  return parseExifNumber(marker.value.exif?.ExposureTime)
})

const altitudeValue = computed(() => {
  const altitude = parseExifNumber(marker.value.exif?.GPSAltitude)
  if (altitude === null) {
    return null
  }

  const isBelowSeaLevel = marker.value.exif?.GPSAltitudeRef === 'Below Sea Level'
  return isBelowSeaLevel ? -Math.abs(altitude) : altitude
})

type AnalysisBucket = 'low' | 'mid' | 'high' | null

const analysisBucket = computed<AnalysisBucket>(() => {
  if (props.analysisMode === 'none') {
    return null
  }

  if (props.analysisMode === 'focalLength') {
    const value = focalLengthValue.value
    if (value === null) {
      return null
    }
    if (value < 35) return 'low'
    if (value <= 85) return 'mid'
    return 'high'
  }

  if (props.analysisMode === 'shutterSpeed') {
    const value = shutterSecondsValue.value
    if (value === null) {
      return null
    }
    if (value <= 1 / 250) return 'low'
    if (value <= 1 / 30) return 'mid'
    return 'high'
  }

  const value = altitudeValue.value
  if (value === null) {
    return null
  }
  if (value < 200) return 'low'
  if (value <= 1500) return 'mid'
  return 'high'
})

const analysisVisual = computed(() => {
  if (props.analysisMode === 'none' || !analysisBucket.value) {
    return {
      overlayClass:
        'bg-linear-to-br from-green/40 to-emerald/60 dark:from-green/60 dark:to-emerald/80',
      pinClass:
        'border-white/50 bg-white/80 hover:bg-white/90 dark:border-white/30 dark:bg-black/80 dark:hover:bg-black/90',
      ringClass: '',
      badgeClass: '',
      badgeLabel: '',
    }
  }

  if (props.analysisMode === 'focalLength') {
    if (analysisBucket.value === 'low') {
      return {
        overlayClass:
          'bg-linear-to-br from-cyan-300/45 to-sky-500/60 dark:from-cyan-300/55 dark:to-sky-500/75',
        pinClass:
          'border-cyan-300/70 bg-cyan-50/85 hover:bg-cyan-100/85 dark:border-cyan-300/45 dark:bg-cyan-900/45 dark:hover:bg-cyan-900/60',
        ringClass: 'ring-cyan-400/45 dark:ring-cyan-300/45',
        badgeClass: 'bg-cyan-500/90 text-white',
        badgeLabel: 'W',
      }
    }
    if (analysisBucket.value === 'mid') {
      return {
        overlayClass:
          'bg-linear-to-br from-amber-300/45 to-orange-500/60 dark:from-amber-300/55 dark:to-orange-500/75',
        pinClass:
          'border-amber-300/70 bg-amber-50/85 hover:bg-amber-100/85 dark:border-amber-300/45 dark:bg-amber-900/45 dark:hover:bg-amber-900/60',
        ringClass: 'ring-amber-400/45 dark:ring-amber-300/45',
        badgeClass: 'bg-amber-500/90 text-white',
        badgeLabel: 'N',
      }
    }
    return {
      overlayClass:
        'bg-linear-to-br from-rose-300/45 to-pink-500/60 dark:from-rose-300/55 dark:to-pink-500/75',
      pinClass:
        'border-rose-300/70 bg-rose-50/85 hover:bg-rose-100/85 dark:border-rose-300/45 dark:bg-rose-900/45 dark:hover:bg-rose-900/60',
      ringClass: 'ring-rose-400/45 dark:ring-rose-300/45',
      badgeClass: 'bg-rose-500/90 text-white',
      badgeLabel: 'T',
    }
  }

  if (props.analysisMode === 'shutterSpeed') {
    if (analysisBucket.value === 'low') {
      return {
        overlayClass:
          'bg-linear-to-br from-emerald-300/45 to-green-500/60 dark:from-emerald-300/55 dark:to-green-500/75',
        pinClass:
          'border-emerald-300/70 bg-emerald-50/85 hover:bg-emerald-100/85 dark:border-emerald-300/45 dark:bg-emerald-900/45 dark:hover:bg-emerald-900/60',
        ringClass: 'ring-emerald-400/45 dark:ring-emerald-300/45',
        badgeClass: 'bg-emerald-500/90 text-white',
        badgeLabel: 'F',
      }
    }
    if (analysisBucket.value === 'mid') {
      return {
        overlayClass:
          'bg-linear-to-br from-amber-300/45 to-yellow-500/60 dark:from-amber-300/55 dark:to-yellow-500/75',
        pinClass:
          'border-amber-300/70 bg-amber-50/85 hover:bg-amber-100/85 dark:border-amber-300/45 dark:bg-amber-900/45 dark:hover:bg-amber-900/60',
        ringClass: 'ring-amber-400/45 dark:ring-amber-300/45',
        badgeClass: 'bg-amber-500/90 text-white',
        badgeLabel: 'M',
      }
    }
    return {
      overlayClass:
        'bg-linear-to-br from-indigo-300/45 to-violet-500/60 dark:from-indigo-300/55 dark:to-violet-500/75',
      pinClass:
        'border-indigo-300/70 bg-indigo-50/85 hover:bg-indigo-100/85 dark:border-indigo-300/45 dark:bg-indigo-900/45 dark:hover:bg-indigo-900/60',
      ringClass: 'ring-indigo-400/45 dark:ring-indigo-300/45',
      badgeClass: 'bg-indigo-500/90 text-white',
      badgeLabel: 'S',
    }
  }

  if (analysisBucket.value === 'low') {
    return {
      overlayClass:
        'bg-linear-to-br from-lime-300/45 to-green-500/60 dark:from-lime-300/55 dark:to-green-500/75',
      pinClass:
        'border-lime-300/70 bg-lime-50/85 hover:bg-lime-100/85 dark:border-lime-300/45 dark:bg-lime-900/45 dark:hover:bg-lime-900/60',
      ringClass: 'ring-lime-400/45 dark:ring-lime-300/45',
      badgeClass: 'bg-lime-500/90 text-white',
      badgeLabel: 'L',
    }
  }
  if (analysisBucket.value === 'mid') {
    return {
      overlayClass:
        'bg-linear-to-br from-orange-300/45 to-amber-500/60 dark:from-orange-300/55 dark:to-amber-500/75',
      pinClass:
        'border-orange-300/70 bg-orange-50/85 hover:bg-orange-100/85 dark:border-orange-300/45 dark:bg-orange-900/45 dark:hover:bg-orange-900/60',
      ringClass: 'ring-orange-400/45 dark:ring-orange-300/45',
      badgeClass: 'bg-orange-500/90 text-white',
      badgeLabel: 'M',
    }
  }
  return {
    overlayClass:
      'bg-linear-to-br from-fuchsia-300/45 to-pink-500/60 dark:from-fuchsia-300/55 dark:to-pink-500/75',
    pinClass:
      'border-fuchsia-300/70 bg-fuchsia-50/85 hover:bg-fuchsia-100/85 dark:border-fuchsia-300/45 dark:bg-fuchsia-900/45 dark:hover:bg-fuchsia-900/60',
    ringClass: 'ring-fuchsia-400/45 dark:ring-fuchsia-300/45',
    badgeClass: 'bg-fuchsia-500/90 text-white',
    badgeLabel: 'H',
  }
})

const hoverCardOpen = computed({
  get: () => (props.isSelected ? true : hoverOpen.value),
  set: (value: boolean) => {
    // Keep selected marker card pinned open until parent clears selection.
    if (props.isSelected) {
      if (value) {
        hoverOpen.value = true
      }
      return
    }
    hoverOpen.value = value
  },
})

watch(
  () => props.isSelected,
  (isSelected, wasSelected) => {
    if (isSelected) {
      hoverOpen.value = true
      return
    }

    // Clear stale local open state when leaving selected mode.
    if (wasSelected) {
      hoverOpen.value = false
    }
  },
)

const onClick = () => {
  emit('click', props.clusterPoint)
}
</script>

<template>
  <MapProviderMarker
    ref="markerRef"
    :key="`marker-single-${marker.id}`"
    :marker-id="`marker-single-${markerId || marker.id}`"
    :lnglat="props.clusterPoint.geometry.coordinates"
  >
    <template #marker>
      <HoverCardRoot
        v-model:open="hoverCardOpen"
        :open-delay="isSelected ? 0 : 600"
        :close-delay="isSelected ? Number.MAX_SAFE_INTEGER : 100"
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
            <div
              v-if="isSelected"
              class="absolute -inset-2 rounded-full border border-primary/40 dark:border-primary/50 animate-ping"
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
                :class="twMerge('absolute inset-0', analysisVisual.overlayClass)"
              />
            </div>

            <!-- Single photo marker -->
            <div
              :class="
                twMerge(
                  'relative size-10 flex justify-center items-center rounded-full border shadow-lg hover:shadow-xl',
                  isSelected
                    ? 'border-primary/60 bg-primary/80 shadow-primary/30 dark:border-primary/40 dark:bg-primary/90 dark:shadow-primary/50'
                    : analysisVisual.pinClass,
                )
              "
            >
              <div
                class="absolute inset-0 rounded-full bg-linear-to-br from-white/10 to-white/5"
              />
              <Icon
                name="tabler:photo"
                class="size-5 text-neutral-700 dark:text-white drop-shadow"
              />
              <span
                v-if="props.analysisMode !== 'none' && analysisBucket"
                :class="
                  twMerge(
                    'absolute -top-1 -right-1 size-4 rounded-full text-[9px] font-bold leading-none inline-flex items-center justify-center border border-white/70 dark:border-white/20 shadow-sm',
                    analysisVisual.badgeClass,
                  )
                "
              >
                {{ analysisVisual.badgeLabel }}
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
              update-position-strategy="always"
              sticky="always"
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
                <GlassButton
                  v-if="isSelected"
                  class="absolute top-2 right-2 z-10"
                  size="sm"
                  icon="tabler:x"
                  @click="$emit('close')"
                />

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
                      <span v-if="marker.city">·</span>
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
  </MapProviderMarker>
</template>

<style scoped></style>

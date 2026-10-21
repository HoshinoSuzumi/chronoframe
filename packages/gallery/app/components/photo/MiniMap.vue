<script lang="ts" setup>
import { motion } from 'motion-v'
import {
  isMapboxMap,
  type MapInstance,
} from '@chronoframe/gallery/shared/types/map'

const props = defineProps<{
  photo: Photo
  latitude: number
  longitude: number
}>()

const MAPID = 'minimap-info-panel'

const config = useRuntimeConfig()

const loaded = ref(false)
const isAnimating = ref(false)
const mapInstance = ref<MapInstance | null>(null)
let animationTimer: ReturnType<typeof setTimeout> | null = null

const onMapLoad = (map: MapInstance) => {
  mapInstance.value = map
  map.setCenter([props.longitude, props.latitude])
  setTimeout(() => {
    loaded.value = true
  }, 100)
}

const moveMapTo = (newLat: number, newLng: number) => {
  // 动画持续时间
  const DURATION = 1000
  if (mapInstance.value && loaded.value) {
    // 清除之前的计时器
    if (animationTimer) {
      clearTimeout(animationTimer)
      animationTimer = null
    }

    isAnimating.value = true
    mapInstance.value.flyTo({
      duration: DURATION,
      center: [newLng, newLat],
      zoom: 12,
      essential: true,
    })

    // 设置新的计时器，动画结束后显示指示点
    animationTimer = setTimeout(() => {
      isAnimating.value = false
      animationTimer = null
    }, DURATION)
  }
}

watch([() => props.latitude, () => props.longitude], ([newLat, newLng]) => {
  moveMapTo(newLat, newLng)
  const map = mapInstance.value
  // Only available with Mapbox
  if (map && isMapboxMap(map as any, config.public.map.provider)) {
    // 根据拍摄时间决定四种 lightPreset: dawn / day / dusk / night
    const photoDate = new Date(props.photo.dateTaken || 0)
    const hours = photoDate.getHours()
    if (hours >= 5 && hours < 7) {
      ;(map as any).setConfigProperty('basemap', 'lightPreset', 'dawn')
    } else if (hours >= 7 && hours < 17) {
      ;(map as any).setConfigProperty('basemap', 'lightPreset', 'day')
    } else if (hours >= 17 && hours < 21) {
      ;(map as any).setConfigProperty('basemap', 'lightPreset', 'dusk')
    } else {
      ;(map as any).setConfigProperty('basemap', 'lightPreset', 'night')
    }
  }
})

onUnmounted(() => {
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = null
  }
})
</script>

<template>
  <div
    class="relative w-full h-44 overflow-hidden rounded-lg border border-white/10 dark:border-white/10"
  >
    <MapProvider
      class="w-full h-full relative overflow-hidden"
      :map-id="MAPID"
      :zoom="12"
      :interactive="false"
      :language="$i18n.locale"
      @load="onMapLoad"
    >
      <AnimatePresence>
        <motion.div
          v-if="!isAnimating"
          :initial="{ scale: 0, opacity: 0 }"
          :animate="{ scale: 1, opacity: 1 }"
          :exit="{ scale: 0.5, opacity: 0 }"
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div class="relative">
            <div
              class="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-primary/70"
            />
            <div
              class="relative h-2 w-2 rounded-full bg-primary ring-2 ring-white/80"
            />
          </div>
        </motion.div>
      </AnimatePresence>
      <div
        v-if="!loaded"
        class="absolute inset-0 bg-default/80 flex items-center justify-center backdrop-blur-sm"
      >
        <p class="text-xs font-medium text-white/60">
          {{ $t('minimap.loading') }}
        </p>
      </div>
    </MapProvider>
  </div>
</template>

<style>
.mapboxgl-ctrl-logo {
  display: none !important;
}

.mapboxgl-ctrl-attrib {
  display: none !important;
}
</style>

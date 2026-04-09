<script lang="ts" setup>
import { motion } from 'motion-v'
import { clusterMarkers, photosToMarkers } from '~/utils/clustering'

useHead({
  title: $t('title.globe'),
})

const route = useRoute()
const router = useRouter()

const { photos } = usePhotos()

const photosWithLocation = computed(() => {
  return photos.value.filter(
    (photo) =>
      photo.latitude !== null &&
      photo.longitude !== null &&
      photo.latitude !== undefined &&
      photo.longitude !== undefined,
  )
})

const currentClusterPointId = ref<string | null>(null)
const mapInstance = ref<any>(null)
const currentZoom = ref<number>(4)
const analysisMode = ref<'none' | 'focalLength' | 'shutterSpeed' | 'altitude'>(
  'none',
)
const parameterAnnotationOpen = ref(false)

const analysisModeOptions = [
  {
    value: 'none',
    label: '默认',
    icon: 'tabler:circle-off',
    description: '关闭标注',
  },
  {
    value: 'focalLength',
    label: '焦段',
    icon: 'tabler:zoom-scan',
    description: '广角 / 标准 / 长焦',
  },
  {
    value: 'shutterSpeed',
    label: '快门',
    icon: 'tabler:clock-hour-4',
    description: '高速 / 中速 / 低速',
  },
  {
    value: 'altitude',
    label: '海拔',
    icon: 'tabler:mountain',
    description: '低 / 中 / 高海拔',
  },
] as const

const analysisLegend = computed(() => {
  if (analysisMode.value === 'focalLength') {
    return {
      title: '焦段分布',
      items: [
        {
          label: '广角',
          range: '<35mm',
          color: 'bg-cyan-500',
        },
        {
          label: '标准',
          range: '35-85mm',
          color: 'bg-amber-500',
        },
        {
          label: '长焦',
          range: '>85mm',
          color: 'bg-rose-500',
        },
      ],
    }
  }

  if (analysisMode.value === 'shutterSpeed') {
    return {
      title: '快门分布',
      items: [
        {
          label: '高速',
          range: '≤1/250s',
          color: 'bg-emerald-500',
        },
        {
          label: '中速',
          range: '1/250-1/30s',
          color: 'bg-amber-500',
        },
        {
          label: '低速',
          range: '>1/30s',
          color: 'bg-indigo-500',
        },
      ],
    }
  }

  if (analysisMode.value === 'altitude') {
    return {
      title: '海拔分布',
      items: [
        {
          label: '低海拔',
          range: '<200m',
          color: 'bg-lime-500',
        },
        {
          label: '中海拔',
          range: '200-1500m',
          color: 'bg-orange-500',
        },
        {
          label: '高海拔',
          range: '>1500m',
          color: 'bg-fuchsia-500',
        },
      ],
    }
  }

  return null
})

// Convert photos to markers and apply clustering
const clusteredMarkers = computed(() => {
  const markers = photosToMarkers(photosWithLocation.value)
  return clusterMarkers(markers, currentZoom.value)
})

// Separate clusters and single markers
const clusterGroups = computed(() => {
  return clusteredMarkers.value.filter(
    (point) => point.properties.cluster === true,
  )
})

const singleMarkers = computed(() => {
  return clusteredMarkers.value.filter(
    (point) => point.properties.cluster !== true,
  )
})

watch(currentClusterPointId, (newId) => {
  if (newId) {
    router.replace({ query: { ...route.query, photoId: newId } })
  } else {
    const { photoId, ...rest } = route.query
    router.replace({ query: { ...rest } })
  }
})

const mapViewState = computed(() => {
  if (photosWithLocation.value.length === 0) {
    return {
      longitude: -122.4,
      latitude: 37.8,
      zoom: 2,
    }
  }

  const latitudes = photosWithLocation.value.map((photo) => photo.latitude!)
  const longitudes = photosWithLocation.value.map((photo) => photo.longitude!)

  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)

  const centerLat = (minLat + maxLat) / 2
  const centerLng = (minLng + maxLng) / 2

  const latDiff = maxLat - minLat
  const lngDiff = maxLng - minLng
  const maxDiff = Math.max(latDiff, lngDiff)

  let zoom = 8
  if (maxDiff < 0.005) zoom = 16
  else if (maxDiff < 0.02) zoom = 14
  else if (maxDiff < 0.05) zoom = 12
  else if (maxDiff < 0.2) zoom = 10
  else if (maxDiff < 1) zoom = 8
  else if (maxDiff < 5) zoom = 6
  else if (maxDiff < 20) zoom = 5
  else if (maxDiff < 50) zoom = 4
  else zoom = 2

  return {
    longitude: centerLng,
    latitude: centerLat,
    zoom,
  }
})

const onMarkerPinClick = (clusterPoint: any) => {
  // If it's a cluster, zoom to the cluster area
  if (clusterPoint.properties.cluster === true) {
    const clusteredPhotos = clusterPoint.properties.clusteredPhotos || []
    if (clusteredPhotos.length > 0 && mapInstance.value) {
      // Calculate bounds for all photos in the cluster
      const lats = clusteredPhotos.map((p: any) => p.latitude)
      const lngs = clusteredPhotos.map((p: any) => p.longitude)

      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)

      // Add some padding
      const padding = 0.001

      mapInstance.value.fitBounds(
        [
          [minLng - padding, minLat - padding],
          [maxLng + padding, maxLat + padding],
        ],
        {
          padding: 50,
          duration: 1000,
        },
      )
    }
    return
  }

  // Handle single photo selection
  if (clusterPoint.properties.marker?.id === currentClusterPointId.value) {
    currentClusterPointId.value = null
    return
  }
  currentClusterPointId.value = clusterPoint.properties.marker?.id || null
}

const onMarkerPinClose = () => {
  currentClusterPointId.value = null
}

const onMapLoaded = (map: any) => {
  mapInstance.value = map

  const { photoId } = route.query
  if (photoId && typeof photoId === 'string') {
    const photo = photosWithLocation.value.find((photo) => photo.id === photoId)
    if (photo && photo.latitude && photo.longitude) {
      setTimeout(() => {
        map.flyTo({
          center: [photo.longitude, photo.latitude],
          zoom: 17,
          essential: true,
          duration: 2000,
        })
        setTimeout(() => {
          nextTick(() => {
            currentClusterPointId.value = photoId
          })
        }, 2000)
      }, 600)
    }
  }

  currentZoom.value = map.getZoom()
}

const onMapZoom = useThrottleFn(() => {
  if (!mapInstance.value) return
  currentZoom.value = mapInstance.value.getZoom()
}, 100)

// Map control functions
const zoomIn = () => {
  if (!mapInstance.value) return
  mapInstance.value.zoomIn({ duration: 300 })
}

const zoomOut = () => {
  if (!mapInstance.value) return
  mapInstance.value.zoomOut({ duration: 300 })
}

const resetMap = () => {
  if (!mapInstance.value) return
  // Clear current selection
  currentClusterPointId.value = null

  // Reset to initial view state
  mapInstance.value.flyTo({
    center: [mapViewState.value.longitude, mapViewState.value.latitude],
    zoom: mapViewState.value.zoom,
    essential: true,
    duration: 1000,
  })
}

const generateRandomKey = () => {
  return Math.random().toString(36).substring(2, 15)
}

onBeforeRouteLeave(() => {
  if (mapInstance.value) {
    mapInstance.value.remove()
    mapInstance.value = null
  }
})
</script>

<template>
  <div class="w-full h-svh relative overflow-hidden">
    <GlassButton
      class="absolute top-4 left-4 z-10"
      icon="tabler:home"
      @click="$router.push('/')"
    />

    <div class="absolute top-4 right-4 z-10 flex flex-col items-end">
      <div class="relative">
        <UTooltip
          text="拍摄参数标注"
          :delay-duration="0"
        >
          <GlassButton
            icon="tabler:adjustments"
            @click="parameterAnnotationOpen = !parameterAnnotationOpen"
          />
        </UTooltip>
        <span
          v-if="analysisMode !== 'none'"
          class="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
        />
      </div>

      <AnimatePresence>
        <motion.div
          v-if="parameterAnnotationOpen"
          :initial="{ opacity: 0, y: -8, scale: 0.96 }"
          :animate="{ opacity: 1, y: 0, scale: 1 }"
          :exit="{ opacity: 0, y: -8, scale: 0.96 }"
          :transition="{ duration: 0.2, ease: 'easeOut' }"
          class="mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-neutral-100 bg-white/30 text-neutral-700 shadow-md shadow-neutral-300/20 backdrop-blur-md dark:border-white/10 dark:bg-neutral-700/30 dark:text-white/80 dark:shadow-black/20"
        >
          <div
            class="px-3 py-2 border-b border-neutral-100/80 dark:border-white/10"
          >
            <div class="flex items-center gap-2 text-sm font-semibold">
              <Icon
                name="tabler:adjustments-horizontal"
                class="size-4 text-primary"
              />
              <span>拍摄参数标注</span>
            </div>
            <p class="mt-1 text-[11px] text-neutral-600 dark:text-white/60">
              按拍摄参数查看地理分布
            </p>
          </div>

          <div class="p-2.5 space-y-2">
            <button
              v-for="mode in analysisModeOptions"
              :key="mode.value"
              type="button"
              :class="[
                'w-full px-2.5 py-2 rounded-lg text-left transition-colors border flex items-center gap-2.5',
                analysisMode === mode.value
                  ? 'bg-primary/90 text-white border-primary/70 shadow-sm'
                  : 'bg-white/15 text-neutral-700 dark:text-white/80 border-neutral-200/70 dark:border-white/10 hover:bg-white/30 dark:hover:bg-black/20',
              ]"
              @click="analysisMode = mode.value"
            >
              <span
                :class="[
                  'size-7 rounded-md flex items-center justify-center shrink-0 border',
                  analysisMode === mode.value
                    ? 'bg-white/20 border-white/30'
                    : 'bg-white/30 dark:bg-black/20 border-neutral-200/60 dark:border-white/10',
                ]"
              >
                <Icon
                  :name="mode.icon"
                  class="size-4"
                />
              </span>
              <span class="min-w-0">
                <span class="block text-xs font-semibold leading-none">{{
                  mode.label
                }}</span>
                <span
                  class="block text-[10px] mt-1 text-neutral-500 dark:text-white/55"
                >
                  {{ mode.description }}
                </span>
              </span>
            </button>
          </div>

          <div
            v-if="analysisLegend"
            class="mx-2.5 mb-2.5 rounded-lg border border-neutral-200/70 dark:border-white/10 bg-white/25 dark:bg-black/20 p-2"
          >
            <div
              class="text-[10px] font-semibold text-neutral-600 dark:text-white/70 px-1 mb-1"
            >
              {{ analysisLegend.title }}
            </div>
            <div
              v-for="item in analysisLegend.items"
              :key="item.label"
              class="flex items-center justify-between gap-2 text-[10px] text-neutral-700 dark:text-white/80 px-1 py-1 rounded-md hover:bg-white/40 dark:hover:bg-black/20"
            >
              <span class="inline-flex items-center gap-1.5 min-w-0">
                <span
                  :class="[
                    'size-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/20',
                    item.color,
                  ]"
                />
                <span class="truncate">{{ item.label }}</span>
              </span>
              <span class="font-mono text-neutral-500 dark:text-white/55">{{
                item.range
              }}</span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>

    <div class="absolute bottom-4 left-4 z-10 flex flex-col">
      <!-- Zoom in -->
      <GlassButton
        class="rounded-b-none border-b-0"
        icon="tabler:plus"
        @click="zoomIn"
      />
      <!-- Zoom out -->
      <GlassButton
        class="rounded-none"
        icon="tabler:minus"
        @click="zoomOut"
      />
      <!-- Reset map -->
      <GlassButton
        class="rounded-t-none border-t-0"
        icon="tabler:scan-position"
        @click="resetMap"
      />
    </div>

    <motion.div
      :initial="{ opacity: 0, scale: 1.08 }"
      :animate="{ opacity: 1, scale: 1 }"
      :transition="{ duration: 0.6, delay: 0.1 }"
      class="w-full h-full"
    >
      <ClientOnly>
        <!-- mapbox://styles/hoshinosuzumi/cmev0eujf01dw01pje3g9cmlg -->
        <MapProvider
          class="w-full h-full"
          :map-id="generateRandomKey()"
          :zoom="mapViewState.zoom"
          :center="[mapViewState.longitude, mapViewState.latitude]"
          :attribution-control="false"
          :language="$i18n.locale"
          @load="onMapLoaded"
          @zoom="onMapZoom"
        >
          <!-- Cluster pins -->
          <template v-if="!!mapInstance">
            <MapClusterPin
              v-for="clusterPoint in clusterGroups"
              :key="`cluster-${clusterPoint.properties.marker?.id}`"
              :cluster-point="clusterPoint"
              :marker-id="generateRandomKey()"
              @click="onMarkerPinClick"
              @close="onMarkerPinClose"
            />
          </template>

          <!-- Single photo pins -->
          <template v-if="!!mapInstance">
            <MapPhotoPin
              v-for="clusterPoint in singleMarkers"
              :key="`single-${clusterPoint.properties.marker?.id}`"
              :cluster-point="clusterPoint"
              :is-selected="
                clusterPoint.properties.marker?.id === currentClusterPointId
              "
              :analysis-mode="analysisMode"
              :marker-id="generateRandomKey()"
              @click="onMarkerPinClick"
              @close="onMarkerPinClose"
            />
          </template>
        </MapProvider>

        <template #fallback>
          <div class="w-full h-full flex items-center justify-center">
            <Icon
              name="tabler:map-pin-off"
              class="size-10 text-gray-500 animate-pulse"
            />
          </div>
        </template>
      </ClientOnly>
    </motion.div>
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

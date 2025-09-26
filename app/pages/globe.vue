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
    <MapGlassButton
      class="absolute top-4 left-4 z-10"
      @click="$router.push('/')"
    >
      <Icon
        name="tabler:home"
        class="size-5"
      />
    </MapGlassButton>

    <div class="absolute bottom-4 left-4 z-10 flex flex-col">
      <!-- Zoom in -->
      <MapGlassButton
        class="rounded-b-none border-b-0"
        @click="zoomIn"
      >
        <Icon
          name="tabler:plus"
          class="size-5"
        />
      </MapGlassButton>
      <!-- Zoom out -->
      <MapGlassButton
        class="rounded-none"
        @click="zoomOut"
      >
        <Icon
          name="tabler:minus"
          class="size-5"
        />
      </MapGlassButton>
      <!-- Reset map -->
      <MapGlassButton
        class="rounded-t-none border-t-0"
        @click="resetMap"
      >
        <Icon
          name="tabler:scan-position"
          class="size-5"
        />
      </MapGlassButton>
    </div>

    <motion.div
      :initial="{ opacity: 0, scale: 1.08 }"
      :animate="{ opacity: 1, scale: 1 }"
      :transition="{ duration: 0.6, delay: 0.1 }"
      class="w-full h-full"
    >
      <ClientOnly>
        <!-- mapbox://styles/hoshinosuzumi/cmev0eujf01dw01pje3g9cmlg -->
        <MapboxMap
          class="w-full h-full"
          :map-id="generateRandomKey()"
          :options="{
            style: 'mapbox://styles/mapbox/standard',
            zoom: mapViewState.zoom,
            center: [mapViewState.longitude, mapViewState.latitude],
            config: {
              basemap: {
                lightPreset: $colorMode.value === 'dark' ? 'night' : 'day',
                colorThemes: 'faded',
              },
            },
            attributionControl: false,
            language: $i18n.locale,
          }"
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
            <MapSinglePhotoPin
              v-for="clusterPoint in singleMarkers"
              :key="`single-${clusterPoint.properties.marker?.id}`"
              :cluster-point="clusterPoint"
              :is-selected="
                clusterPoint.properties.marker?.id === currentClusterPointId
              "
              :marker-id="generateRandomKey()"
              @click="onMarkerPinClick"
              @close="onMarkerPinClose"
            />
          </template>
        </MapboxMap>

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

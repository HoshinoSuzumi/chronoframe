<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import type { MapInstance } from '~~/shared/types/map'

const props = withDefaults(
  defineProps<{
    modelValue?: { latitude: number; longitude: number } | null
    zoom?: number
    class?: string
  }>(),
  {
    modelValue: null,
    zoom: 4,
    class: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [{ latitude: number; longitude: number } | null]
  pick: [{ latitude: number; longitude: number }]
}>()

const mapInstance = ref<MapInstance | null>(null)
const markerCoordinates = ref<[number, number] | null>(null)
const { locale } = useI18n()

let clickHandler: ((event: any) => void) | null = null

const syncFromProps = (value: { latitude: number; longitude: number } | null) => {
  if (value) {
    markerCoordinates.value = [value.longitude, value.latitude]
    if (mapInstance.value) {
      const map: any = mapInstance.value
      map.flyTo?.({
        center: markerCoordinates.value,
        zoom: Math.max(props.zoom ?? 4, 4),
        essential: true,
      })
    }
  } else {
    markerCoordinates.value = null
  }
}

watch(
  () => props.modelValue,
  (value) => {
    syncFromProps(value ?? null)
  },
  { immediate: true },
)

const updateValue = (
  latitude: number,
  longitude: number,
  shouldEmitPick = true,
) => {
  markerCoordinates.value = [longitude, latitude]
  emit('update:modelValue', { latitude, longitude })
  if (shouldEmitPick) {
    emit('pick', { latitude, longitude })
  }
}

const handleMapClick = (event: any) => {
  const point =
    event?.lngLat ||
    event?.latlng ||
    (Array.isArray(event) ? { lng: event[0], lat: event[1] } : null)
  if (!point) {
    return
  }
  const latitude =
    typeof point.lat === 'number' ? point.lat : point.latitude ?? point[1]
  const longitude =
    typeof point.lng === 'number' ? point.lng : point.longitude ?? point[0]
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return
  }
  updateValue(latitude, longitude)
}

const onMapLoad = (map: MapInstance) => {
  mapInstance.value = map

  if (markerCoordinates.value) {
    const anyMap: any = map
    anyMap.setCenter?.(markerCoordinates.value)
    anyMap.setZoom?.(Math.max(props.zoom ?? 4, 4))
  }

  const anyMap: any = map
  if (typeof anyMap.on === 'function') {
    clickHandler = (event: any) => handleMapClick(event)
    anyMap.on('click', clickHandler)
  }
}

onBeforeUnmount(() => {
  if (mapInstance.value && clickHandler) {
    const anyMap: any = mapInstance.value
    if (typeof anyMap.off === 'function') {
      anyMap.off('click', clickHandler)
    }
  }
})
</script>

<template>
  <div :class="['relative w-full h-64 rounded-xl overflow-hidden', $props.class]">
    <MapProvider
      class="w-full h-full"
      :map-id="'photo-location-picker'"
      :center="markerCoordinates ?? undefined"
      :zoom="markerCoordinates ? Math.max($props.zoom ?? 4, 4) : $props.zoom ?? 2"
      :interactive="true"
      :language="locale"
      @load="onMapLoad"
    >
      <MapProviderMarker
        v-if="markerCoordinates"
        :lnglat="markerCoordinates"
      >
        <template #marker>
          <div class="relative">
            <div class="absolute inset-0 animate-ping rounded-full bg-primary/40" />
            <div class="relative size-4 rounded-full bg-primary border-2 border-white shadow" />
          </div>
        </template>
      </MapProviderMarker>
    </MapProvider>

    <div
      v-if="!markerCoordinates"
      class="absolute inset-0 pointer-events-none flex items-center justify-center text-sm text-neutral-600 dark:text-neutral-400"
    >
      <slot name="empty" />
    </div>
  </div>
</template>

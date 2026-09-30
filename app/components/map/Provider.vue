<script lang="ts" setup>
import type { AttributionControlOptions, StyleSpecification } from 'maplibre-gl'
import { twMerge } from 'tailwind-merge'
import type { MapboxMap, MapInstance, MaplibreMap } from '~~/shared/types/map'
import { isMapServiceConfigured } from '~~/shared/utils/map-service'

import ChronoFrameLightStyle from '~/assets/mapStyles/chronoframe_light.json'
import ChronoFrameDarkStyle from '~/assets/mapStyles/chronoframe_dark.json'

const props = withDefaults(
  defineProps<{
    class?: string
    mapId?: string
    center?: [number, number]
    zoom?: number
    interactive?: boolean
    attributionControl?: false | AttributionControlOptions
    language?: string
    setupNotice?: boolean
  }>(),
  {
    class: undefined,
    mapId: undefined,
    center: undefined,
    zoom: 2,
    interactive: true,
    attributionControl: false,
    language: undefined,
    setupNotice: false,
  },
)

const emit = defineEmits<{
  load: [map: MapInstance]
  zoom: []
}>()

const colorMode = useColorMode()

const mapConfig = computed(() => {
  const config = getSetting('map')
  return typeof config === 'object' && config ? config : {}
})

const provider = computed(() => mapConfig.value.provider || 'maplibre')
const isConfigured = computed(() =>
  isMapServiceConfigured(mapConfig.value as Record<string, unknown>),
)

const { show: showMapSetupNotice, hide: hideMapSetupNotice } =
  useMapSetupNotice()

const syncMapSetupNotice = () => {
  if (!props.setupNotice) return
  if (isConfigured.value) {
    hideMapSetupNotice()
    return
  }
  showMapSetupNotice()
}

onMounted(syncMapSetupNotice)
watch([isConfigured, () => props.setupNotice], () => {
  if (import.meta.client) syncMapSetupNotice()
})
onBeforeUnmount(() => {
  if (!props.setupNotice) return
  hideMapSetupNotice()
})

const mapStyle = computed(() => {
  if (provider.value === 'mapbox') {
    return mapConfig.value['mapbox.style'] || `mapbox://styles/mapbox/standard`
  } else {
    const styleConfig =
      colorMode.value === 'dark' ? ChronoFrameDarkStyle : ChronoFrameLightStyle
    return (
      mapConfig.value['maplibre.style'] ||
      ({
        ...styleConfig,
        sources: {
          openmaptiles: {
            ...styleConfig.sources?.openmaptiles,
            url: `https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=${mapConfig.value['maplibre.token']}`,
          },
        },
        glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${mapConfig.value['maplibre.token']}`,
      } as StyleSpecification)
    )
  }
})
</script>

<template>
  <div :class="twMerge('w-full h-full', $props.class)">
    <div
      v-if="!isConfigured"
      class="flex h-full w-full items-center justify-center bg-neutral-100 dark:bg-neutral-900"
    >
      <UIcon
        name="tabler:map-off"
        class="size-10 text-neutral-400"
      />
    </div>
    <ClientOnly v-else>
      <MglMap
        v-if="provider === 'maplibre'"
        class="w-full h-full"
        :map-key="mapId"
        :map-style="mapStyle as StyleSpecification"
        :center
        :zoom
        :interactive
        :attribution-control
        @map:load="emit('load', $event.map as MaplibreMap)"
        @map:zoom="emit('zoom')"
      >
        <slot />
      </MglMap>
      <MapboxMap
        v-else
        class="w-full h-full"
        :map-id="mapId || 'cframe-mapbox-map'"
        :options="{
          accessToken: mapConfig['mapbox.token'],
          style: mapStyle,
          center: center,
          zoom: zoom,
          interactive: interactive,
          attributionControl: attributionControl,
          language: language,
          config: {
            basemap: {
              lightPreset: $colorMode.value === 'dark' ? 'night' : 'day',
              colorThemes: 'faded',
            },
          },
        }"
        @load="emit('load', $event as MapboxMap)"
        @zoom="emit('zoom')"
      >
        <slot />
      </MapboxMap>
    </ClientOnly>
  </div>
</template>

<style scoped></style>

<script lang="ts" setup>
import type { AttributionControlOptions, StyleSpecification } from 'maplibre-gl'
import { twMerge } from 'tailwind-merge'
import type {
  MapboxMap,
  MapInstance,
  MaplibreMap,
} from '@chronoframe/gallery/shared/types/map'
import { useMapSetupNotice } from '#gallery/composables/useMapSetupNotice'
import { isMapServiceConfigured } from '@chronoframe/gallery/shared/utils/map-service'

import {
  DEFAULT_MAPBOX_STYLE,
  mapLightPreset,
} from '@chronoframe/gallery/shared/utils/map-appearance'

import ChronoFrameLightStyle from '#gallery/assets/mapStyles/chronoframe_light.json'
import ChronoFrameDarkStyle from '#gallery/assets/mapStyles/chronoframe_dark.json'

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
    dateTaken?: string | null
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
    dateTaken: undefined,
  },
)

const emit = defineEmits<{
  load: [map: MapInstance]
  zoom: []
}>()

const colorMode = useColorMode()
const lightPreset = computed(() =>
  mapLightPreset(props.dateTaken, colorMode.value),
)
const mapboxInstance = shallowRef<MapboxMap | null>(null)
function syncMapboxAppearance() {
  const map = mapboxInstance.value
  if (!map || !map.isStyleLoaded()) return
  // Custom styles without the Standard basemap do not expose its lighting controls.
  if (
    mapStyle.value === DEFAULT_MAPBOX_STYLE ||
    map.getStyle().imports?.some((fragment) => fragment.id === 'basemap')
  ) {
    map.setConfigProperty('basemap', 'lightPreset', lightPreset.value)
  }
}
function detachMapboxAppearance() {
  mapboxInstance.value?.off('style.load', syncMapboxAppearance)
  mapboxInstance.value = null
}
function onMapboxLoad(map: MapboxMap) {
  detachMapboxAppearance()
  mapboxInstance.value = map
  map.on('style.load', syncMapboxAppearance)
  syncMapboxAppearance()
  emit('load', map)
}
watch(lightPreset, syncMapboxAppearance)

const mapConfig = computed(() => {
  const config = getSetting('map')
  return typeof config === 'object' && config ? config : {}
})

const provider = computed(() => mapConfig.value.provider || 'maplibre')
watch(provider, (value) => {
  if (value !== 'mapbox') detachMapboxAppearance()
})
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
  detachMapboxAppearance()
  if (!props.setupNotice) return
  hideMapSetupNotice()
})

const mapStyle = computed(() => {
  if (provider.value === 'mapbox') {
    return mapConfig.value['mapbox.style'] || DEFAULT_MAPBOX_STYLE
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
          config:
            mapStyle === DEFAULT_MAPBOX_STYLE
              ? {
                  basemap: {
                    lightPreset: lightPreset,
                    colorThemes: 'faded',
                  },
                }
              : undefined,
        }"
        @load="onMapboxLoad($event as MapboxMap)"
        @zoom="emit('zoom')"
      >
        <slot />
      </MapboxMap>
    </ClientOnly>
  </div>
</template>

<style scoped></style>

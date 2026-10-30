import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {
  computed,
  reactive,
  shallowRef,
  watch,
  nextTick,
  effectScope,
} from 'vue'
import {
  DEFAULT_MAPBOX_STYLE,
  mapLightPreset,
} from '../packages/gallery/shared/utils/map-appearance.ts'
import { isMapServiceConfigured } from '../packages/gallery/shared/utils/map-service.ts'

test('shared capture-time presets keep the self-hosted time bands and theme fallbacks', () => {
  for (const [time, preset] of [
    ['04:59', 'night'],
    ['05:00', 'dawn'],
    ['06:59', 'dawn'],
    ['07:00', 'day'],
    ['16:59', 'day'],
    ['17:00', 'dusk'],
    ['20:59', 'dusk'],
    ['21:00', 'night'],
  ]) {
    assert.equal(mapLightPreset(`2026-10-31T${time}:00`, 'light'), preset)
  }
  assert.equal(mapLightPreset(null, 'dark'), 'night')
  assert.equal(mapLightPreset(undefined, 'light'), 'day')
  assert.equal(mapLightPreset('invalid', 'dark'), 'night')
})

test('the shared provider applies lighting on load, same-location photo changes, theme and style reloads', async () => {
  const props = reactive<{ dateTaken: string | null }>({
    dateTaken: '2026-10-31T06:00:00',
  })
  const theme = reactive({ value: 'light' })
  const config = reactive<Record<string, string>>({
    provider: 'mapbox',
    'mapbox.token': 'pk.public',
    'mapbox.style': '',
    'maplibre.token': 'maptiler_public',
    'maplibre.style': '',
  })
  const light = JSON.parse(
    readFileSync(
      'packages/gallery/app/assets/mapStyles/chronoframe_light.json',
      'utf8',
    ),
  )
  const dark = JSON.parse(
    readFileSync(
      'packages/gallery/app/assets/mapStyles/chronoframe_dark.json',
      'utf8',
    ),
  )
  let styleListener: (() => void) | undefined,
    detached = 0,
    ready = true
  const presets: string[] = []
  const map = {
    isStyleLoaded: () => ready,
    getStyle: () => ({ imports: [] }),
    setConfigProperty: (_fragment: string, _key: string, value: string) =>
      presets.push(value),
    on: (_event: string, fn: () => void) => {
      styleListener = fn
    },
    off: () => {
      detached++
      styleListener = undefined
    },
  }
  const scope = effectScope(),
    unmount: Array<() => void> = []
  const source = readFileSync(
    'packages/gallery/app/components/map/Provider.vue',
    'utf8',
  )
    .split('<script lang="ts" setup>')[1]!
    .split('</script>')[0]!
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  try {
    const component = scope.run(() =>
      vm.runInNewContext(
        `${code.replaceAll('import.meta.client', 'false')};({onMapboxLoad,mapStyle,lightPreset})`,
        {
          exports: {},
          computed,
          shallowRef,
          watch,
          defineProps: () => props,
          withDefaults: (p: unknown) => p,
          defineEmits: () => () => {},
          useColorMode: () => theme,
          getSetting: () => config,
          DEFAULT_MAPBOX_STYLE,
          mapLightPreset,
          isMapServiceConfigured,
          ChronoFrameLightStyle: light,
          ChronoFrameDarkStyle: dark,
          useMapSetupNotice: () => ({ show: () => {}, hide: () => {} }),
          onMounted: () => {},
          onBeforeUnmount: (fn: () => void) => unmount.push(fn),
        },
      ),
    ) as {
      onMapboxLoad: (map: unknown) => void
      mapStyle: {
        value:
          | string
          | {
              name?: string
              glyphs: string
              sources: { openmaptiles: { url: string } }
            }
      }
    }
    assert.equal(component.mapStyle.value, DEFAULT_MAPBOX_STYLE)
    component.onMapboxLoad(map)
    assert.equal(presets.at(-1), 'dawn')
    props.dateTaken = '2026-10-31T18:00:00'
    await nextTick()
    assert.equal(presets.at(-1), 'dusk')
    ready = false
    props.dateTaken = '2026-10-31T22:00:00'
    await nextTick()
    assert.equal(presets.at(-1), 'dusk')
    ready = true
    styleListener!()
    assert.equal(presets.at(-1), 'night')
    props.dateTaken = null
    await nextTick()
    theme.value = 'dark'
    await nextTick()
    assert.equal(presets.at(-1), 'night')
    theme.value = 'light'
    await nextTick()
    assert.equal(presets.at(-1), 'day')
    config['mapbox.style'] = 'mapbox://styles/example/custom'
    await nextTick()
    const count = presets.length
    styleListener!()
    assert.equal(
      presets.length,
      count,
      'custom styles without basemap imports must not receive Standard config',
    )
    config.provider = 'maplibre'
    await nextTick()
    assert.ok(detached > 0)
    const dayStyle = component.mapStyle.value as {
      name?: string
      glyphs: string
      sources: { openmaptiles: { url: string } }
    }
    assert.equal(dayStyle.name, light.name)
    assert.ok(dayStyle.glyphs.includes('key=maptiler_public'))
    assert.ok(dayStyle.sources.openmaptiles.url.includes('key=maptiler_public'))
    theme.value = 'dark'
    await nextTick()
    assert.equal(
      (component.mapStyle.value as { name?: string }).name,
      dark.name,
    )
    config['maplibre.style'] = 'https://example.com/custom-style.json'
    await nextTick()
    assert.equal(component.mapStyle.value, config['maplibre.style'])
  } finally {
    for (const fn of unmount) fn()
    scope.stop()
  }
})

test('shared mini maps follow photo coordinates during initial loading and clean up their timers', async () => {
  const props = reactive({
    latitude: 1,
    longitude: 2,
    photo: { dateTaken: '2026-10-31T06:00:00' },
  })
  const timers = new Map<number, () => void>(),
    centers: number[][] = [],
    flights: unknown[] = []
  let nextTimer = 0,
    unmount: () => void = () => {}
  const source = readFileSync(
    'packages/gallery/app/components/photo/MiniMap.vue',
    'utf8',
  )
    .split('<script lang="ts" setup>')[1]!
    .split('</script>')[0]!
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const scope = effectScope()
  try {
    const component = scope.run(() =>
      vm.runInNewContext(`${code};({onMapLoad})`, {
        exports: {},
        ref: shallowRef,
        shallowRef,
        watch,
        defineProps: () => props,
        setTimeout: (fn: () => void) => {
          timers.set(++nextTimer, fn)
          return nextTimer
        },
        clearTimeout: (id: number) => timers.delete(id),
        onUnmounted: (fn: () => void) => {
          unmount = fn
        },
      }),
    ) as { onMapLoad: (map: unknown) => void }
    component.onMapLoad({
      setCenter: (point: number[]) => centers.push(Array.from(point)),
      flyTo: (options: unknown) => flights.push(options),
    })
    props.latitude = 3
    props.longitude = 4
    await nextTick()
    assert.deepEqual(centers.at(-1), [4, 3])
    assert.equal(flights.length, 0)
    const ready = timers.get(1)!
    timers.delete(1)
    ready()
    props.latitude = 5
    await nextTick()
    assert.equal(flights.length, 1)
    unmount()
    assert.equal(timers.size, 0)
  } finally {
    scope.stop()
  }
})

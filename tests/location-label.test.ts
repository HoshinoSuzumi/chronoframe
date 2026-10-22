import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { useLocationLabel } from '../packages/gallery/app/composables/useLocationLabel.ts'
import type { NormalizedLocation } from '../packages/gallery/shared/types/location.ts'

test('location label overrides survive isolated rendering and retain reactive defaults', () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'useSettingsStore',
  )
  const settings: Record<string, string> = {
    'location:preferredLevel': 'city',
    'location:fallbackOrder': 'country',
  }
  let storeReads = 0
  Object.assign(globalThis, {
    useSettingsStore: () => ({
      getSetting: (key: string) => {
        storeReads++
        return settings[key]
      },
    }),
  })
  const geocoding: NormalizedLocation = {
    version: 1,
    provider: 'nominatim',
    language: 'en',
    components: {
      country: { name: 'Country', sourceField: 'country' },
      city: { name: 'City', sourceField: 'city' },
      district: { name: 'District', sourceField: 'district' },
    },
  }
  try {
    const props = ref({ preferredLevel: 'district', fallbackOrder: 'country' })
    const explicit = useLocationLabel(() => props.value)
    assert.equal(explicit({ geocoding }), 'District')
    props.value.preferredLevel = 'region'
    assert.equal(explicit({ geocoding }), 'Country')
    assert.equal(
      storeReads,
      0,
      'explicit OG props must not read missing render-context settings',
    )
    assert.equal(useLocationLabel()({ geocoding }), 'City')
    const partial = useLocationLabel({ preferredLevel: 'region' })
    assert.equal(partial({ geocoding }), 'Country')
    settings['location:fallbackOrder'] = 'district'
    assert.equal(partial({ geocoding }), 'District')
    assert.equal(explicit({ city: 'Legacy city' }), 'Legacy city')
  } finally {
    if (previous)
      Object.defineProperty(globalThis, 'useSettingsStore', previous)
    else Reflect.deleteProperty(globalThis, 'useSettingsStore')
  }
})

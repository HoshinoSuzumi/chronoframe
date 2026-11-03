import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, nextTick, ref } from 'vue'
import {
  PUBLIC_GALLERY_DEFAULTS,
  parseGalleryPresentation,
} from '@chronoframe/contracts/gallery-settings'
import {
  bindViewerReactionsAvailability,
  isReactionsEnabledSetting,
  useViewerReactionsEnabled,
} from '../packages/gallery/app/composables/useViewerReactionsEnabled.ts'

test('missing and true public reactions settings mean enabled', () => {
  assert.equal(PUBLIC_GALLERY_DEFAULTS.app.reactionsEnabled, true)
  assert.equal(isReactionsEnabledSetting(undefined), true)
  assert.equal(isReactionsEnabledSetting(null), true)
  assert.equal(isReactionsEnabledSetting(true), true)
  assert.equal(isReactionsEnabledSetting(false), false)
})

test('Site public settings project presentation reactions with a legacy true fallback', () => {
  const data = structuredClone(PUBLIC_GALLERY_DEFAULTS) as {
    app: Record<string, unknown>
  }
  assert.equal(data.app.reactionsEnabled, true)

  const legacy = parseGalleryPresentation({
    homeHeaderLayout: 'embedded',
    socialLinks: { links: [] },
  })
  data.app.reactionsEnabled = legacy.reactionsEnabled
  assert.equal(data.app.reactionsEnabled, true)

  const disabled = parseGalleryPresentation({
    homeHeaderLayout: 'fixed',
    socialLinks: { links: [] },
    reactionsEnabled: false,
  })
  data.app.reactionsEnabled = disabled.reactionsEnabled
  assert.equal(data.app.reactionsEnabled, false)
})

test('viewer reaction availability loads while enabled and suppresses work when disabled', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'useSettingRef')
  const setting = ref<unknown>(undefined)
  Object.assign(globalThis, {
    useSettingRef: () => setting,
  })

  const scope = effectScope()
  const loads: string[] = []
  const clears: number[] = []
  try {
    const reactionsEnabled = scope.run(() => useViewerReactionsEnabled())!
    assert.equal(reactionsEnabled.value, true)

    const photoId = ref<string | null | undefined>('photo-a')
    scope.run(() =>
      bindViewerReactionsAvailability({
        reactionsEnabled,
        photoId,
        load: (id) => {
          loads.push(id)
        },
        clearTransient: () => {
          clears.push(clears.length + 1)
        },
      }),
    )
    await nextTick()
    assert.deepEqual(loads, ['photo-a'])
    assert.deepEqual(clears, [])

    photoId.value = 'photo-b'
    await nextTick()
    assert.deepEqual(loads, ['photo-a', 'photo-b'])

    setting.value = false
    await nextTick()
    assert.equal(reactionsEnabled.value, false)
    assert.equal(clears.length, 1)
    assert.deepEqual(loads, ['photo-a', 'photo-b'])

    photoId.value = 'photo-c'
    await nextTick()
    assert.equal(clears.length, 2)
    assert.deepEqual(
      loads,
      ['photo-a', 'photo-b'],
      'disabled galleries must not request reaction data',
    )

    setting.value = true
    await nextTick()
    assert.equal(reactionsEnabled.value, true)
    assert.deepEqual(loads, ['photo-a', 'photo-b', 'photo-c'])
  } finally {
    scope.stop()
    if (previous) Object.defineProperty(globalThis, 'useSettingRef', previous)
    else Reflect.deleteProperty(globalThis, 'useSettingRef')
  }
})

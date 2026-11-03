import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PUBLIC_GALLERY_DEFAULTS,
  parseGalleryPresentation,
} from '../packages/contracts/src/gallery-settings.ts'

const base = { homeHeaderLayout: 'embedded', socialLinks: { links: [] } }
test('gallery themes accept the self-hosted choices and retain the existing SaaS default', () => {
  assert.equal(parseGalleryPresentation(base).theme, 'dark')
  for (const theme of ['light', 'dark', 'system']) {
    assert.equal(parseGalleryPresentation({ ...base, theme }).theme, theme)
  }
  for (const theme of [null, '', 'auto', [], {}, 1]) {
    assert.throws(() => parseGalleryPresentation({ ...base, theme }))
  }
})

test('gallery reactions default to enabled for legacy presentations', () => {
  assert.equal(PUBLIC_GALLERY_DEFAULTS.app.reactionsEnabled, true)
  assert.equal(parseGalleryPresentation(base).reactionsEnabled, true)
})

test('gallery reactions accept explicit boolean values', () => {
  assert.equal(
    parseGalleryPresentation({ ...base, reactionsEnabled: true })
      .reactionsEnabled,
    true,
  )
  assert.equal(
    parseGalleryPresentation({ ...base, reactionsEnabled: false })
      .reactionsEnabled,
    false,
  )
})

test('gallery reactions reject non-boolean values', () => {
  for (const reactionsEnabled of [null, 'true', 1, [], {}]) {
    assert.throws(() => parseGalleryPresentation({ ...base, reactionsEnabled }))
  }
})

test('existing legacy gallery presentations still parse', () => {
  assert.deepEqual(parseGalleryPresentation(base), {
    theme: 'dark',
    homeHeaderLayout: 'embedded',
    socialLinks: { links: [] },
    reactionsEnabled: true,
  })
})

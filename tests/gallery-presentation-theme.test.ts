import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGalleryPresentation } from '../packages/contracts/src/gallery-settings.ts'

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

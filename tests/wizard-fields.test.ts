import assert from 'node:assert/strict'
import test from 'node:test'
import { PUBLIC_GALLERY_DEFAULTS } from '@chronoframe/contracts/gallery-settings'
import { isWizardRenderableField } from '../apps/self-hosted/server/services/settings/wizard-fields.ts'

test('wizard excludes JSON settings such as socialLinks', () => {
  assert.equal(
    isWizardRenderableField({
      type: 'json',
      value: PUBLIC_GALLERY_DEFAULTS.app.socialLinks,
      defaultValue: PUBLIC_GALLERY_DEFAULTS.app.socialLinks,
    }),
    false,
  )
})

test('wizard excludes object and array values from text inputs', () => {
  assert.equal(
    isWizardRenderableField({
      type: 'string',
      value: { links: [] },
      defaultValue: '',
    }),
    false,
  )
  assert.equal(
    isWizardRenderableField({
      type: 'string',
      value: ['https://example.com'],
      defaultValue: '',
    }),
    false,
  )
})

test('wizard keeps scalar settings', () => {
  const fields = [
    { type: 'string', value: 'photos', defaultValue: '' },
    { type: 'number', value: 42, defaultValue: 0 },
    { type: 'boolean', value: true, defaultValue: false },
    { type: 'string', value: null, defaultValue: '' },
  ] as const

  for (const field of fields) {
    assert.equal(
      isWizardRenderableField(field),
      true,
      `expected ${String(field.value)} to be renderable`,
    )
  }
})

test('wizard falls back to the default value when value is missing', () => {
  assert.equal(
    isWizardRenderableField({
      type: 'string',
      defaultValue: 'photos',
    }),
    true,
  )
  assert.equal(
    isWizardRenderableField({
      type: 'json',
      defaultValue: PUBLIC_GALLERY_DEFAULTS.app.socialLinks,
    }),
    false,
  )
})

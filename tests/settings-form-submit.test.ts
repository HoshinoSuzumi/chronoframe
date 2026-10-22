import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  FieldDescriptor,
  SettingValue,
} from '@chronoframe/gallery/shared/types/settings'
import { applySavedSettingsFields } from '../packages/console/app/composables/useSettingsForm.ts'

const field = (key: string, value: SettingValue): FieldDescriptor => ({
  key,
  type: 'string',
  value,
  defaultValue: value,
  ui: { type: 'input' },
})

test('saving social links retains unsaved app and appearance edits', () => {
  const fields = [
    field('title', 'Original name'),
    field('appearance.theme', 'system'),
    field('socialLinks', { links: [] }),
  ]
  const state: Record<string, unknown> = {
    title: 'Unsaved name',
    'appearance.theme': 'dark',
    socialLinks: { links: [] },
  }
  const saved = { socialLinks: { links: ['https://instagram.com/example'] } }

  applySavedSettingsFields(fields, state, saved, {
    socialLinks: JSON.stringify(state.socialLinks),
  })

  assert.equal(state.title, 'Unsaved name')
  assert.equal(state['appearance.theme'], 'dark')
  assert.deepEqual(state.socialLinks, saved.socialLinks)
  assert.equal(fields[0]?.value, 'Original name')
  assert.equal(fields[1]?.value, 'system')
  assert.deepEqual(fields[2]?.value, saved.socialLinks)
})

test('saving app fields retains the appearance draft and updates only app baselines', () => {
  const fields = [
    field('title', 'Original name'),
    field('appearance.theme', 'system'),
  ]
  const state: Record<string, unknown> = {
    title: 'Saved name',
    'appearance.theme': 'dark',
  }

  applySavedSettingsFields(
    fields,
    state,
    { title: 'Saved name' },
    {
      title: JSON.stringify(state.title),
    },
  )

  assert.equal(state['appearance.theme'], 'dark')
  assert.equal(fields[0]?.value, 'Saved name')
  assert.equal(fields[1]?.value, 'system')
})

test('a draft edited during a save stays dirty against the saved value', () => {
  const fields = [field('title', 'Original name')]
  const state: Record<string, unknown> = { title: 'Newer draft' }

  applySavedSettingsFields(
    fields,
    state,
    { title: 'Submitted name' },
    {
      title: JSON.stringify('Submitted name'),
    },
  )

  assert.equal(state.title, 'Newer draft')
  assert.equal(fields[0]?.value, 'Submitted name')
})

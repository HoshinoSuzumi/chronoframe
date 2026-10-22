import assert from 'node:assert/strict'
import test from 'node:test'
import { getAvatarInputType } from '../packages/gallery/app/utils/avatar.ts'

test('saved uploaded avatar paths do not require an absolute URL', () => {
  assert.equal(
    getAvatarInputType('/avatar/avatar-0123456789abcdef.webp'),
    'text',
  )
})

test('external avatars and other paths still use URL input validation', () => {
  assert.equal(getAvatarInputType('https://example.com/avatar.jpg'), 'url')
  assert.equal(getAvatarInputType('/another/image.webp'), 'url')
  assert.equal(getAvatarInputType('/avatar/other.webp'), 'url')
  assert.equal(getAvatarInputType(''), 'url')
})

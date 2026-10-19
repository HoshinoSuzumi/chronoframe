import assert from 'node:assert/strict'
import test from 'node:test'
import { getAvatarInputType } from '../app/utils/avatar.ts'

test('saved uploaded avatar paths do not require an absolute URL', () => {
  assert.equal(
    getAvatarInputType('/avatar/avatar-0123456789abcdef.webp'),
    'text',
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { socialAccountProfile } from '../packages/platform/src/social-account-profile.ts'

test('Provider labels use the remote username or display name, never the local nickname or email', () => {
  assert.deepEqual(
    socialAccountProfile('github', {
      id: 123,
      login: 'HoshinoSuzumi',
      name: 'Different display name',
    }),
    { subject: '123', username: 'HoshinoSuzumi' },
  )
  assert.deepEqual(
    socialAccountProfile('discord', {
      id: '456',
      username: 'remote_handle',
      global_name: 'Other name',
    }),
    { subject: '456', username: 'remote_handle' },
  )
  assert.deepEqual(
    socialAccountProfile('google', {
      sub: '789',
      name: 'Google Name',
      email: 'private@example.test',
    }),
    { subject: '789', username: 'Google Name' },
  )
  assert.deepEqual(
    socialAccountProfile('google', {
      sub: '789',
      email: 'private@example.test',
    }),
    { subject: '789', username: null },
  )
  for (const profile of [
    { id: '123', login: 'bad\nname' },
    { id: '123', login: 'x'.repeat(257) },
  ])
    assert.equal(socialAccountProfile('github', profile)?.username, null)
  assert.equal(socialAccountProfile('github', { login: 'No subject' }), null)
  assert.equal(socialAccountProfile('unknown', { id: 123, name: 'No' }), null)
})

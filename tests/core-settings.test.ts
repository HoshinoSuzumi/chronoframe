import assert from 'node:assert/strict'
import test from 'node:test'
import { createStorageResolver, validateSettingWrite } from '@chronoframe/core'

test('settings rules reject invalid values before persistence and preserve privileged writes', () => {
  const input = {
    namespace: 'app',
    key: 'title',
    value: 'Gallery',
    readonly: true,
    enumValues: null,
    sudo: false,
  }
  assert.throws(() => validateSettingWrite(input), /readonly/)
  validateSettingWrite({ ...input, sudo: true })
  assert.throws(
    () =>
      validateSettingWrite({
        ...input,
        readonly: false,
        enumValues: ['Other'],
      }),
    /Allowed values/,
  )
  assert.throws(
    () =>
      validateSettingWrite({
        ...input,
        readonly: false,
        namespace: 'system',
        key: 'queue.workerCount',
        value: 0,
      }),
    /between 1 and 8/,
  )
  assert.throws(
    () =>
      validateSettingWrite({
        ...input,
        readonly: false,
        namespace: 'location',
        key: 'fallbackOrder',
        value: 'city,unknown',
      }),
    /fallback/,
  )
  validateSettingWrite({
    ...input,
    readonly: false,
    namespace: 'location',
    key: 'fallbackOrder',
    value: 'city, country',
  })
})

test('storage selection reads the current connection rather than caching a provider instance', async () => {
  let selected: number | null = null
  const resolver = createStorageResolver({
    getSelectedId: async () => selected,
    find: async (id) => (id === 1 ? { id, provider: 'local' } : null),
  })
  assert.equal(await resolver.resolve(), null)
  selected = 1
  assert.deepEqual(await resolver.resolve(), { id: 1, provider: 'local' })
  selected = 2
  assert.equal(await resolver.resolve(), null)
})

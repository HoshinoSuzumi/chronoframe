import assert from 'node:assert/strict'
import test from 'node:test'
import { quotaGate } from '../apps/cloud/app/utils/quota-gate.ts'

test('Quota preflight blocks unknown or read-only contexts before opening a form', () => {
  assert.equal(quotaGate(null, 'sites').reason, 'checking')
  assert.equal(
    quotaGate({ workspace: { role: 'member' } }, 'sites').reason,
    'permission',
  )
})
test('Quota preflight uses complete workspace usage and treats the exact limit as exhausted', () => {
  const data = {
    workspace: { role: 'admin' },
    plan: {
      limits: {
        sites: 1,
        customDomains: 2,
        photos: 10,
        storageBytes: 100,
        monthlyBytes: 200,
        fileBytes: 20,
      },
      byosLimits: { byos: 0, photos: 3, monthlyBytes: 50 },
    },
    usage: {
      sites: 1,
      customDomains: 1,
      photos: 3,
      storageBytes: 100,
      monthlyBytes: 20,
    },
  }
  assert.equal(quotaGate(data, 'sites').allowed, false)
  assert.equal(quotaGate(data, 'customDomains').allowed, true)
  assert.equal(quotaGate(data, 'storageBytes').allowed, false)
  assert.equal(quotaGate(data, 'photos').allowed, true)
  assert.equal(quotaGate(data, 'photos', 'byos').allowed, false)
  assert.equal(quotaGate(data, 'byos').allowed, false)
  assert.equal(quotaGate(data, 'monthlyBytes', 'byos').allowed, true)
  data.usage.customDomains = 2
  assert.equal(quotaGate(data, 'customDomains').reason, 'upgrade')
})
test('Quota preflight denies missing and zero limits without inventing unlimited allowance', () => {
  const data = {
    workspace: { role: 'admin' },
    plan: { limits: {}, byosLimits: { byos: 1 } },
    usage: {},
  }
  assert.equal(quotaGate(data, 'sites').allowed, false)
  assert.equal(quotaGate(data, 'fileBytes').allowed, false)
  assert.equal(quotaGate(data, 'byos').allowed, true)
})

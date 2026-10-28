import assert from 'node:assert/strict'
import test from 'node:test'
import {
  quotaGate,
  uploadQuotaGate,
} from '../apps/cloud/app/utils/quota-gate.ts'

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

test('Upload preflight finds an eligible alternative without trapping users on a full pooled target', () => {
  const data = {
    workspace: { role: 'admin' },
    plan: {
      limits: { photos: 10, storageBytes: 10, monthlyBytes: 50, fileBytes: 20 },
      byosLimits: { byos: 1, photos: 10, monthlyBytes: 50, fileBytes: 20 },
    },
    usage: { photos: 1, storageBytes: 10, monthlyBytes: 1 },
  }
  const connections: {
    id: string
    pool_id?: string
    uploads_enabled?: number
  }[] = [{ id: 'pool', pool_id: 'platform' }, { id: 'custom' }]
  assert.equal(
    uploadQuotaGate(data, connections, 'pool').connectionId,
    'custom',
  )
  assert.equal(uploadQuotaGate(data, connections, 'pool').allowed, true)
  assert.equal(uploadQuotaGate(data, [connections[0]!], 'pool').allowed, false)
  assert.equal(uploadQuotaGate(data, [connections[1]!], 'custom').allowed, true)
  data.usage.storageBytes = 0
  assert.equal(uploadQuotaGate(data, connections, 'pool').connectionId, 'pool')
  connections[1]!.uploads_enabled = 0
  data.usage.storageBytes = 10
  assert.equal(uploadQuotaGate(data, connections, 'pool').allowed, false)
  data.plan.byosLimits.byos = 0
  delete connections[1]!.uploads_enabled
  assert.equal(uploadQuotaGate(data, connections, 'pool').allowed, false)
})

test('Upload preflight denies stale or disabled explicit targets while retaining unconfigured storage guidance', () => {
  const data = {
    workspace: { role: 'admin' },
    plan: {
      limits: {
        photos: 10,
        storageBytes: 100,
        monthlyBytes: 100,
        fileBytes: 10,
      },
    },
    usage: {},
  }
  assert.equal(uploadQuotaGate(data, [], 'removed-target').allowed, false)
  assert.equal(
    uploadQuotaGate(data, [{ id: 'disabled', uploads_enabled: 0 }], 'disabled')
      .reason,
    'storage',
  )
  assert.equal(
    uploadQuotaGate(data, [{ id: 'disabled', uploads_enabled: 0 }]).reason,
    'storage',
  )
  assert.equal(uploadQuotaGate(data, []).allowed, true)
})

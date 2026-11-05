import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('single setting GET requires an admin session before reading values', () => {
  const source = readFileSync(
    'apps/self-hosted/server/api/system/settings/[namespace]/[key].ts',
    'utf8',
  )
  const getBranch = source.indexOf("event.method === 'GET'")
  const adminCheck = source.indexOf('await requireAdminSession(event)', getBranch)
  const read = source.indexOf('settingsManager.get(', getBranch)

  assert.ok(getBranch >= 0)
  assert.ok(adminCheck > getBranch, 'GET branch must require admin')
  assert.ok(adminCheck < read, 'admin check must precede settings read')
})

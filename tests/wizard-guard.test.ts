import assert from 'node:assert/strict'
import test from 'node:test'
import { createWizardGuard } from '../server/services/wizard-guard.ts'

test('wizard only runs with explicit first-launch state', async () => {
  for (const state of [false, undefined, null, 'true', 1]) {
    const guard = createWizardGuard(async () => state)
    await assert.rejects(
      guard(() => assert.fail('must not execute')),
      { statusCode: 403 },
    )
  }
  const guard = createWizardGuard(async () => true)
  assert.equal(await guard(() => 'ok'), 'ok')
})

test('queued requests cannot overwrite credentials after completion', async () => {
  let firstLaunch = true
  const guard = createWizardGuard(async () => firstLaunch)
  const complete = guard(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    firstLaunch = false
  })
  const overwrite = guard(() => assert.fail('must not execute'))
  await Promise.all([complete, assert.rejects(overwrite, { statusCode: 403 })])
})

test('failed requests release the gate', async () => {
  const guard = createWizardGuard(async () => true)
  await assert.rejects(
    guard(() => {
      throw new Error('invalid input')
    }),
  )
  assert.equal(await guard(() => 'ok'), 'ok')
})

test('limits requests across endpoints, including failed requests', async () => {
  const guard = createWizardGuard(async () => false)
  for (let i = 0; i < 60; i++) {
    await assert.rejects(
      guard(() => assert.fail()),
      { statusCode: 403 },
    )
  }
  await assert.rejects(
    guard(() => assert.fail()),
    { statusCode: 429 },
  )
})

test('rate limit recovers after its one-minute window', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 120_000 })
  const guard = createWizardGuard(async () => true)
  for (let i = 0; i < 60; i++) await guard(() => 'ok')
  await assert.rejects(
    guard(() => 'blocked'),
    { statusCode: 429 },
  )
  t.mock.timers.tick(60_000)
  assert.equal(await guard(() => 'ok'), 'ok')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planPurchasePath,
  purchaseReturnPath,
} from '../apps/cloud/app/utils/plan-purchase.ts'

test('Purchase links preserve plan and billing interval without starting a checkout', () => {
  assert.equal(
    planPurchasePath('creator', 1),
    '/account/plan?plan=creator&interval=1#plan-creator',
  )
  assert.equal(
    planPurchasePath('studio', '3'),
    '/account/plan?plan=studio&interval=3#plan-studio',
  )
  assert.equal(
    purchaseReturnPath('/account/plan?plan=studio&interval=3'),
    planPurchasePath('studio', 3),
  )
  assert.equal(
    purchaseReturnPath('/account/plan?interval=3&plan=studio#other'),
    planPurchasePath('studio', 3),
  )
})

test('Authentication returns accept only canonical plan-selection destinations', () => {
  for (const value of [
    undefined,
    null,
    [],
    ['x'],
    'https://evil.test/account/plan?plan=studio&interval=3',
    '//evil.test/account/plan?plan=studio&interval=3',
    '/workspace',
    '/account/plan/../?plan=studio&interval=3',
    '/account/plan?plan=studio&interval=3&next=https://evil.test',
    '/account/plan?plan=studio&plan=creator&interval=3',
    '/account/plan?plan=studio&interval=3&interval=1',
    '/account/plan?plan=%2F%2Fevil.test&interval=3',
    '/account/plan?plan=studio&interval=12',
  ]) {
    assert.equal(purchaseReturnPath(value), null, String(value))
  }
  for (const period of [
    undefined,
    null,
    [],
    ['3'],
    { toString: () => '3' },
    0,
    12,
    'quarterly',
  ])
    assert.equal(planPurchasePath('studio', period), null)
  for (const plan of ['', 'a/b', 'a b', 'x'.repeat(129), ['studio'], null])
    assert.equal(planPurchasePath(plan, 1), null)
})

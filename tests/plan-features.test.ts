import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FREE_LIMITS,
  validatePolicy,
  evaluatePolicy,
} from '../packages/platform/src/entitlements.ts'
import { paymentProductSnapshot } from '../packages/platform/src/payment-product-sync.ts'
const features = [
  { label: 'Upcoming collaboration', type: 'supported' },
  { label: 'Team exports', type: 'unsupported' },
  { label: 'Availability', type: 'dash' },
  { label: 'Team members', type: 'number', value: 5 },
  { label: 'Support', type: 'text', value: 'Email & chat' },
]
const policy = () => ({
  limits: { ...FREE_LIMITS },
  rules: [],
  features: structuredClone(features),
})
test('display features round trip without changing resource allowances; reject malformed values', () => {
  const validated = validatePolicy(policy())
  assert.deepEqual(validated.features, features)
  assert.deepEqual(
    evaluatePolicy(validated, {
      storageMode: 'platform',
      workspaceAgeDays: 1,
      emailVerified: true,
    }),
    FREE_LIMITS,
  )
  for (const bad of [
    { label: '', type: 'text', value: 'x' },
    { label: 'x', type: 'html', value: '<b>x</b>' },
    { label: 'x', type: 'number', value: '5' },
    { label: 'x', type: 'number', value: Infinity },
    { label: 'x', type: 'text', value: 'x'.repeat(201) },
    { label: 'x', type: 'supported', value: true },
  ]) {
    assert.throws(() => validatePolicy({ ...policy(), features: [bad] }))
  }
  assert.throws(() =>
    validatePolicy({ ...policy(), features: Array(33).fill(features[0]) }),
  )
  assert.throws(() =>
    validatePolicy({ ...policy(), features: [features[0], features[0]] }),
  )
  assert.doesNotThrow(() => validatePolicy({ limits: FREE_LIMITS, rules: [] }))
})
test('Dodo descriptions use escaped Markdown paragraphs and whole list items within the API limit', () => {
  const plan = {
    id: 'pro',
    name: 'Pro',
    description: 'Photo **hosting** <script>',
    monthly_price: 1200,
    quarterly_price: 3000,
    currency: 'USD',
    policy_json: JSON.stringify(policy()),
  }
  const description = paymentProductSnapshot(plan, 3).product.description
  assert.match(
    description,
    /Photo \\\*\\\*hosting\\\*\\\* &lt;script&gt;\n\n- \*\*Custom S3 storage:\*\* Not included/,
  )
  assert.match(description, /- \*\*Upcoming collaboration:\*\* Included/)
  assert.match(description, /- \*\*Support:\*\* Email &amp; chat/)
  const long = paymentProductSnapshot(
    {
      ...plan,
      description: '&'.repeat(500),
      policy_json: JSON.stringify({
        ...policy(),
        features: Array.from({ length: 32 }, (_, i) => ({
          label: 'Feature ' + i,
          type: 'text',
          value: 'x'.repeat(200),
        })),
      }),
    },
    1,
  ).product.description
  assert.ok(long.length <= 1000)
  assert.ok(long.endsWith('See the platform for full plan details.'))
  assert.ok(
    long
      .split('\n')
      .filter((l) => l.startsWith('- **Feature'))
      .every((l) => l.endsWith('x'.repeat(200))),
  )
})

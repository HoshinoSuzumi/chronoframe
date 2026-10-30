import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'

// Execute the component's actual action functions with controlled API/refresh dependencies.
const source = readFileSync(
  'apps/cloud/app/components/CloudPricing.vue',
  'utf8',
)
  .split('<script setup lang="ts">')[1]!
  .split('</script>')[0]!
const parsed = ts.createSourceFile(
  'CloudPricing.ts',
  source,
  ts.ScriptTarget.Latest,
)
function action(name: string, globals: Record<string, any>) {
  const declaration = parsed.statements.find(
    (s) => ts.isFunctionDeclaration(s) && s.name?.text === name,
  )!
  assert.ok(declaration, name)
  const code = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports: Record<string, any> = {}
  vm.runInNewContext(code + `\nexports.run = ${name}`, { exports, ...globals })
  return exports.run as () => Promise<void>
}
for (const shape of ['nested', 'flat', 'other'])
  test(`resume reports confirmation pending accurately for ${shape} API errors`, async () => {
    const code =
      shape === 'other' ? 'payment_unavailable' : 'payment_confirmation_pending'
    const paymentError = ref(''),
      resuming = ref(false)
    let refreshes = 0
    const run = action('resume', {
      payment: ref({ pending: { id: 'checkout', canRefresh: true } }),
      billing: { selected: ref(1) },
      payments: {
        busy: ref(false),
        refresh: async (options: any) => {
          assert.equal(options.reconcile, false)
          refreshes++
        },
      },
      paymentError,
      resuming,
      mounted: true,
      t: (key: string) => key,
      $fetch: async () => {
        throw { data: shape === 'flat' ? { code } : { data: { code } } }
      },
    })
    await run()
    assert.equal(
      paymentError.value,
      shape === 'other'
        ? 'cloud.payments.failed'
        : 'cloud.payments.confirmationReview',
    )
    assert.equal(resuming.value, false)
    assert.equal(refreshes, 1)
  })
for (const retry of [false, true])
  test(`confirmed cancellation stays successful when both refreshes reject, retry=${retry}`, async () => {
    const plan = { id: 'creator' },
      target = {
        id: 'old-checkout',
        workspaceId: 1,
        planId: plan.id,
        interval: 3,
      }
    const paymentError = ref(''),
      cancelCheckoutOpen = ref(true),
      cancelCheckoutBusy = ref(false),
      interval = ref(1)
    const paymentData = ref({ pending: target })
    const cleared: string[] = [],
      restarted: any[] = []
    let cancellations = 0,
      refreshes = 0
    const run = action('cancelCheckout', {
      cancellationTarget: ref(target),
      cancelCheckoutBusy,
      paymentError,
      cancelCheckoutOpen,
      cancelCheckoutRetry: ref(retry),
      mounted: true,
      interval,
      data: ref({ plans: [plan] }),
      payment: ref({ pending: target }),
      billing: {
        selected: ref(1),
        refresh: async () => {
          refreshes++
          throw Error('billing refresh failed')
        },
      },
      payments: {
        data: paymentData,
        refresh: async () => {
          refreshes++
          throw Error('payments refresh failed')
        },
      },
      $fetch: async (_: string, options: any) => {
        assert.equal(options.body.action, 'cancel-checkout')
        cancellations++
        return { state: 'expired' }
      },
      clearCheckoutReturn: async (id: string) => {
        cleared.push(id)
      },
      checkout: (selected: any) => {
        restarted.push(selected)
      },
      t: (key: string) => key,
    })
    await run()
    assert.equal(cancellations, 1)
    assert.equal(refreshes, 2)
    assert.equal(paymentError.value, '')
    assert.equal(paymentData.value.pending, null)
    assert.equal(cancelCheckoutOpen.value, false)
    assert.equal(cancelCheckoutBusy.value, false)
    assert.deepEqual(cleared, [target.id])
    assert.deepEqual(restarted, retry ? [plan] : [])
    assert.equal(interval.value, retry ? 3 : 1)
  })
test('failed cancellation retains its error and never starts a new checkout even when refreshes reject', async () => {
  const target = { id: 'old-checkout', workspaceId: 1 },
    paymentError = ref(''),
    busy = ref(false),
    open = ref(true)
  const run = action('cancelCheckout', {
    cancellationTarget: ref(target),
    cancelCheckoutBusy: busy,
    cancelCheckoutOpen: open,
    paymentError,
    cancelCheckoutRetry: ref(true),
    mounted: true,
    billing: {
      selected: ref(1),
      refresh: async () => {
        throw Error('billing refresh failed')
      },
    },
    payments: {
      refresh: async () => {
        throw Error('payments refresh failed')
      },
    },
    payment: ref({ pending: target }),
    $fetch: async () => {
      throw { data: { data: { code: 'payment_cancellation_unavailable' } } }
    },
    t: (key: string) => key,
    checkout: () => {
      assert.fail('must not retry without confirmed cancellation')
    },
  })
  await run()
  assert.equal(paymentError.value, 'cloud.payments.checkoutCannotCancel')
  assert.equal(busy.value, false)
  assert.equal(open.value, true)
})

for (const changed of ['checkout', 'workspace'])
  test(`confirmed cancellation preserves a different current ${changed}`, async () => {
    const target = {
      id: 'old-checkout',
      workspaceId: 1,
      planId: 'creator',
      interval: 3,
    }
    const pending = { id: changed === 'checkout' ? 'new-checkout' : target.id }
    const paymentData = ref({ pending }),
      selected = ref(changed === 'workspace' ? 2 : 1)
    const run = action('cancelCheckout', {
      cancellationTarget: ref(target),
      cancelCheckoutBusy: ref(false),
      cancelCheckoutOpen: ref(true),
      paymentError: ref(''),
      cancelCheckoutRetry: ref(false),
      mounted: true,
      billing: {
        selected,
        refresh: async () => {
          throw Error('refresh failed')
        },
      },
      payments: {
        data: paymentData,
        refresh: async () => {
          throw Error('refresh failed')
        },
      },
      $fetch: async () => ({ state: 'expired' }),
      clearCheckoutReturn: async () => {},
      t: (key: string) => key,
    })
    await run()
    assert.deepEqual(paymentData.value.pending, pending)
  })

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { ref, toValue, watch, nextTick, effectScope } from 'vue'

function fixture(
  fetch: (...args: any[]) => Promise<any>,
  refresh = async () => {},
  sources: { workspaceId?: () => number; enabled?: () => boolean } = {},
) {
  const exports: Record<string, any> = {}
  const timers: (() => void)[] = []
  const mounted: (() => void)[] = []
  const unmounted: (() => void)[] = []
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        'apps/cloud/app/composables/useDodoCheckoutReturn.ts',
        'utf8',
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      },
    ).outputText,
    {
      exports,
      ref,
      toValue,
      watch,
      useRoute: () => ({
        query: {
          checkout: 'local-checkout',
          payment_id: 'untrusted-payment',
          status: 'active',
        },
      }),
      onMounted: (fn: () => void) => mounted.push(fn),
      onBeforeUnmount: (fn: () => void) => unmounted.push(fn),
      $fetch: fetch,
      setTimeout: (fn: () => void) => {
        timers.push(fn)
        return timers.length
      },
      clearTimeout: () => {},
    },
  )
  const scope = effectScope()
  const returned = scope.run(() => {
    const returned = exports.useDodoCheckoutReturn(
      sources.workspaceId ?? 1,
      sources.enabled ?? true,
      refresh,
    )
    mounted.forEach((fn) => fn())
    return returned
  })!
  return {
    returned,
    timers,
    dispose: () => {
      unmounted.forEach((fn) => fn())
      scope.stop()
    },
  }
}
const flush = async () => {
  for (let n = 0; n < 8; n++) await nextTick()
}

test('checkout return waits for entitlement refresh before closing its processing state and ignores browser payment IDs', async () => {
  let resolveRefresh!: () => void
  const refreshed = new Promise<void>((resolve) => {
    resolveRefresh = resolve
  })
  const f = fixture(
    async (path, options) => {
      assert.equal(path, '/api/billing/payments')
      assert.equal(
        JSON.stringify(options.body),
        JSON.stringify({
          action: 'refresh',
          workspaceId: 1,
          checkoutId: 'local-checkout',
        }),
      )
      return { state: 'completed' }
    },
    () => refreshed,
  )
  try {
    await flush()
    assert.equal(f.returned.state.value, 'checking')
    resolveRefresh()
    await flush()
    assert.equal(f.returned.state.value, 'completed')
    assert.equal(f.timers.length, 0)
  } finally {
    f.dispose()
  }
})

test('422 exits processing without polling forever and allows an explicit retry', async () => {
  let fail = true
  const f = fixture(async () => {
    if (fail)
      throw { statusCode: 422, data: { code: 'payment_period_invalid' } }
    return { state: 'completed' }
  })
  try {
    await flush()
    assert.equal(f.returned.state.value, 'failed')
    assert.equal(f.timers.length, 0)
    fail = false
    await f.returned.retry()
    assert.equal(f.returned.state.value, 'completed')
  } finally {
    f.dispose()
  }
})

test('delayed confirmation has bounded polling and ignores late results after leaving the page', async () => {
  const f = fixture(async () => ({ state: 'open' }))
  try {
    await flush()
    for (let n = 0; n < 7; n++) {
      f.timers.shift()!()
      await flush()
    }
    assert.equal(f.returned.state.value, 'pending')
    assert.equal(f.timers.length, 0)
  } finally {
    f.dispose()
  }
  let resolve!: (value: any) => void
  const late = fixture(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  late.dispose()
  resolve({ state: 'completed' })
  await flush()
  assert.equal(late.returned.state.value, 'checking')
})

test('an authoritative inactive subscription exits processing after cancellation', async () => {
  const f = fixture(async () => ({ state: 'inactive' }))
  try {
    await flush()
    assert.equal(f.returned.state.value, 'inactive')
    assert.equal(f.timers.length, 0)
  } finally {
    f.dispose()
  }
})

test('replacing refreshed billing objects cannot restart an already completed checkout', async () => {
  const billing = ref({ selected: 1 })
  const payments = ref({ enabled: true })
  let confirmations = 0
  const f = fixture(
    async () => {
      confirmations++
      // Bound the old regression: a second request remains pending instead of looping forever.
      if (confirmations > 1) return new Promise(() => {})
      return { state: 'completed' }
    },
    async () => {
      billing.value = { selected: 1 }
      payments.value = { enabled: true }
    },
    {
      workspaceId: () => billing.value.selected,
      enabled: () => payments.value.enabled,
    },
  )
  try {
    await flush()
    assert.equal(confirmations, 1)
    assert.equal(f.returned.state.value, 'completed')
    billing.value = { selected: 1 }
    payments.value = { enabled: true }
    await flush()
    assert.equal(confirmations, 1)
    assert.equal(f.returned.state.value, 'completed')
    assert.equal(f.timers.length, 0)
  } finally {
    f.dispose()
  }
})

test('actual workspace and payment availability changes still restart the return check', async () => {
  const workspace = ref(1)
  const enabled = ref(true)
  const checked: number[] = []
  const f = fixture(
    async (_path, options) => {
      checked.push(options.body.workspaceId)
      return { state: 'completed' }
    },
    async () => {},
    { workspaceId: () => workspace.value, enabled: () => enabled.value },
  )
  try {
    await flush()
    workspace.value = 2
    await flush()
    assert.deepEqual(checked, [1, 2])
    enabled.value = false
    await flush()
    assert.equal(f.returned.state.value, 'idle')
    enabled.value = true
    await flush()
    assert.deepEqual(checked, [1, 2, 2])
    assert.equal(f.returned.state.value, 'completed')
  } finally {
    f.dispose()
  }
})

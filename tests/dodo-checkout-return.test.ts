import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { ref, toValue, watch, nextTick, effectScope } from 'vue'

function fixture(
  fetch: (...args: any[]) => Promise<any>,
  refresh = async () => {},
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
    const returned = exports.useDodoCheckoutReturn(1, true, refresh)
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

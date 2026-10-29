import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { isAlbumPagePath } from '../packages/gallery/shared/utils/albumPath.ts'
import {
  ref,
  reactive,
  computed,
  readonly,
  watch,
  effectScope,
  toValue,
  nextTick,
} from 'vue'

function load(
  file: string,
  globals: Record<string, unknown>,
  imports: Record<string, unknown> = {},
) {
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(code, {
    exports,
    ref,
    reactive,
    computed,
    readonly,
    watch,
    useI18n: () => ({
      t: (key: string) =>
        key
          .split('.')
          .reduce(
            (value, part) => value[part],
            JSON.parse(readFileSync('apps/cloud/i18n/locales/en.json', 'utf8')),
          ),
    }),
    ...globals,
    require: (name: string) => {
      assert.ok(name in imports, name)
      return imports[name]
    },
  })
  return exports
}

test('Live Photo validation rejects the combined size before reserving any upload, but accepts the exact boundary', async () => {
  const requests: { path: string; body?: any }[] = []
  const storage = new Map<string, string>()
  const module = load(
    'apps/cloud/app/composables/useCloudSiteMedia.ts',
    {
      useEntryContext: () => ({ value: { scope: 'site:1:user:1', siteId: 1 } }),
      onMounted: () => {},
      onBeforeUnmount: () => {},
      AbortController,
      crypto,
      setTimeout,
      setInterval,
      clearInterval,
      localStorage: {
        getItem: (k: string) => storage.get(k),
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      },
      $fetch: async (path: string, options?: { body?: unknown }) => {
        requests.push({ path, body: options?.body })
        if (path.endsWith('/plan')) return { state: 'completed' }
        if (path.endsWith('/storage')) return { connections: [] }
        if (path.endsWith('/photos')) return { photos: [], jobs: [] }
        if (path.endsWith('/albums')) return { albums: [] }
        if (path.endsWith('/usage'))
          return { usage: { photos: 0, pending: 0, bytes: 0 } }
        return {}
      },
    },
    {
      '@chronoframe/contracts/storage-diagnostics': {
        STORAGE_CONNECTION_MESSAGES: {},
      },
    },
  )
  const media = module.useCloudMediaWorkspace({ siteId: 1, role: 'admin' })
  media.connectionId.value = 'storage'
  media.allowance.value = {
    limits: { fileBytes: 100 * 1024 * 1024 },
    byosLimits: { fileBytes: 100 * 1024 * 1024, byos: 1 },
    plan: { id: 'test', name: 'Test' },
    storageBytes: 0,
  }
  const mib = 1024 * 1024
  for (const files of [
    [
      { name: 'IMG.HEIC', size: 60 * mib },
      { name: 'img.MOV', size: 50 * mib },
    ],
    [{ name: 'single.jpg', size: 100 * mib + 1 }],
    [{ name: 'only.MOV', size: mib }],
  ]) {
    const input = { files, value: 'chosen' }
    await media.upload({ target: input })
    assert.equal(media.failed.value, true)
    assert.match(media.message.value, /plan/)
    assert.equal(input.value, '')
    assert.equal(requests.length, 0)
  }
  await media.upload({
    target: {
      files: [
        { name: 'IMG.HEIC', size: 60 * mib },
        { name: 'img.MOV', size: 40 * mib },
      ],
      value: 'chosen',
    },
  })
  assert.equal(media.failed.value, false)
  const reservation = requests.find((r) => r.path.endsWith('/uploads'))!
  assert.equal(reservation.body.bytes, 60 * mib)
  assert.equal(reservation.body.liveVideo.bytes, 40 * mib)
  assert.match(media.message.value, /Upload verified/)
})

test('subscription retains edits through network/503 failures and invalidates only authoritative denials', async () => {
  for (const failure of [
    new Error('offline'),
    { statusCode: 503 },
    { status: 500 },
    { statusCode: 401 },
    { status: 403 },
    { statusCode: 404 },
  ]) {
    const scope = effectScope(),
      context = ref<any>({
        scope: 'site:1:admin',
        siteId: 1,
        audience: 'portal',
        capabilities: { subscriptions: true },
      }),
      streams: any[] = [],
      navigation: string[] = []
    let mount = () => {},
      unmount = () => {}
    class Stream {
      closed = false
      onerror?: () => void
      constructor() {
        streams.push(this)
      }
      close() {
        this.closed = true
      }
      addEventListener() {}
    }
    const module = load(
      'apps/cloud/app/composables/useCloudSiteSubscription.ts',
      {
        useEntryContext: () => context,
        useRequestFetch: () => async () => {
          throw failure
        },
        EventSource: Stream,
        onMounted: (fn: () => void) => {
          mount = fn
        },
        onBeforeUnmount: (fn: () => void) => {
          unmount = fn
        },
        navigateTo: (path: string) => {
          navigation.push(path)
        },
      },
    )
    scope.run(() => module.useCloudSiteSubscription())
    mount()
    streams[0].onerror()
    await new Promise((resolve) => setImmediate(resolve))
    const denied = [401, 403, 404].includes(
      (failure as any).statusCode ?? (failure as any).status,
    )
    assert.equal(context.value === null, denied)
    assert.deepEqual(navigation, denied ? ['/sites'] : [])
    unmount()
    scope.stop()
  }
})

test('shuffle options react to the scoped selection without mutating another entry or SSR request', () => {
  let entry = { scope: 'site:one' }
  const states = new Map<string, any>()
  const module = load('packages/gallery/app/composables/usePhotoSort.ts', {
    usePhotos: () => ({ photos: ref([{ id: 'one', title: 'One' }]) }),
    useEntryContext: () => ({ value: entry }),
    useState: (key: string, init: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(init()))
      return states.get(key)
    },
  })
  const first = module.usePhotoSort()
  assert.equal(
    first.availableSorts.value.some((v: any) => v.key === 'shuffle'),
    false,
  )
  first.shufflePhotos()
  assert.equal(first.currentSortOption.value.key, 'shuffle')
  assert.equal(
    first.availableSorts.value.some((v: any) => v.key === 'shuffle'),
    true,
  )
  entry = { scope: 'site:two' }
  const second = module.usePhotoSort()
  assert.equal(
    second.availableSorts.value.some((v: any) => v.key === 'shuffle'),
    false,
  )
  first.setSortOption('title-asc')
  assert.equal(
    first.availableSorts.value.some((v: any) => v.key === 'shuffle'),
    false,
  )
  assert.equal(second.currentSortOption.value.key, 'dateTaken-desc')
})

test('public navigation accepts case-preserving photo IDs while rejecting invalid and oversized paths', async () => {
  let context: any = { value: null }
  const module = load(
    'apps/site/app/middleware/site.global.ts',
    {
      defineNuxtRouteMiddleware: (fn: unknown) => fn,
      useEntryContext: () => context,
      useRequestFetch: () => async () => ({ scope: 'public:one' }),
      navigateTo: () => {},
      abortNavigation: (error: unknown) => error,
      createError: (error: unknown) => error,
    },
    {
      '@chronoframe/gallery/shared/utils/albumPath': { isAlbumPagePath },
    },
  )
  for (const path of [
    '/IMG_1234',
    '/Mixed-Case_1',
    '/photos',
    '/albums/1',
    '/albums/my-gallery',
    '/albums/' + 'a'.repeat(80),
  ])
    assert.equal(await module.default({ path }), undefined, path)
  for (const path of [
    '/bad!',
    '/' + 'A'.repeat(129),
    '/nested/path',
    '/albums/Mixed-Case',
    '/albums/bad--slug',
    '/albums/' + 'a'.repeat(81),
    '/dashboard',
  ])
    assert.equal((await module.default({ path })).statusCode, 404, path)
})

test('Overview data stays unknown before the first response and retains counts during background refresh failures', async () => {
  let release: (() => void) | undefined
  let gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let fail = false
  const module = load(
    'apps/cloud/app/composables/useCloudSiteMedia.ts',
    {
      useEntryContext: () => ({ value: { scope: 'site:1:user:1', siteId: 1 } }),
      onMounted: () => {},
      onBeforeUnmount: () => {},
      AbortController,
      crypto,
      setTimeout,
      setInterval,
      clearInterval,
      $fetch: async (path: string) => {
        await gate
        if (fail) throw new Error('Temporary network failure')
        if (path.endsWith('/photos'))
          return {
            photos: [{ id: 'one' }, { id: 'two' }],
            jobs: [{ state: 'queued' }],
          }
        if (path.endsWith('/albums')) return { albums: [{ id: 1 }] }
        if (path.endsWith('/storage')) return { connections: [] }
        return { usage: { photos: 2, pending: 1, bytes: 1024 } }
      },
    },
    {
      '@chronoframe/contracts/storage-diagnostics': {
        STORAGE_CONNECTION_MESSAGES: {},
      },
    },
  )
  const media = module.useCloudMediaWorkspace({ siteId: 1, role: 'admin' })
  assert.equal(media.ready.value, false)
  assert.equal(media.loading.value, true)
  const initial = media.reload()
  release!()
  await initial
  assert.equal(media.ready.value, true)
  assert.equal(media.photos.value.length, 2)
  assert.equal(media.albums.value.length, 1)
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
  fail = true
  const refresh = media.reload()
  assert.equal(media.loading.value, true)
  assert.equal(media.ready.value, true)
  assert.equal(media.photos.value.length, 2)
  assert.equal(media.jobs.value.length, 1)
  release!()
  await refresh
  assert.equal(media.loading.value, false)
  assert.equal(media.ready.value, true)
  assert.equal(media.photos.value.length, 2)
  assert.equal(media.albums.value.length, 1)
})

test('Dodo scheduler isolates provider failures and local retention without exposing raw errors', async () => {
  let scheduled: any
  const calls: string[] = [],
    logs: string[] = []
  const plugin = load(
    'apps/cloud/server/plugins/payments.ts',
    {
      defineNitroPlugin: (value: any) => value,
      console: { error: (code: string) => logs.push(code) },
    },
    {
      '../../../../packages/platform/src/dodo-payments': {
        syncDodoProducts: async () => {
          calls.push('dodo-sync')
          throw new Error('sensitive fixture')
        },
        reconcileDodoPayments: async () => {
          calls.push('dodo-reconcile')
          throw new Error('sensitive fixture')
        },
      },
      '../../../../packages/platform/src/payment-product-sync': {
        syncPaymentProducts: async () => {
          calls.push('sync')
          throw new Error('sensitive fixture')
        },
      },
      '../../../../packages/platform/src/payment-events': {
        expirePaymentEventPayloads: async () => {
          calls.push('expiry')
          throw new Error('sensitive fixture')
        },
      },
      '../../../../packages/platform/src/payments': {
        reconcilePayments: async () => {
          calls.push('reconcile')
        },
      },
    },
  )
  plugin.default({
    hooks: {
      hook: (_name: string, callback: any) => {
        scheduled = callback
      },
    },
  })
  await scheduled({ env: { DB: {}, NUXT_PLATFORM_STORAGE_SECRET: 'fixture' } })
  assert.deepEqual(calls, ['dodo-sync', 'dodo-reconcile', 'expiry'])
  assert.deepEqual(logs, [
    'dodo_product_sync_failed',
    'dodo_reconciliation_failed',
    'payment_payload_expiry_failed',
  ])
  await scheduled({ env: {} })
  assert.deepEqual(calls, ['dodo-sync', 'dodo-reconcile', 'expiry'])
})

test('Primary billing workspace consistently prefers ownership then administrative membership', async () => {
  let selected = 0
  const list = [
    { id: 1, name: 'Read only', role: 'member', owned: 0 },
    { id: 2, name: 'Managed', role: 'admin', owned: 0 },
  ]
  const module = load('apps/cloud/app/composables/useWorkspaceBilling.ts', {
    usePortalIdentity: () => ref({ id: 3 }),
    useRequestFetch: () => async (url: string, options: any) => {
      if (url.endsWith('/workspaces')) return { workspaces: list }
      selected = options.query.workspaceId
      return { workspace: { role: list.find((w) => w.id === selected)?.role } }
    },
    useAsyncData: (_key: string, run: any) => {
      const data = ref<any>(),
        ready = run().then((value: any) => {
          data.value = value
        })
      return Object.assign(ready, {
        data,
        error: ref(null),
        status: ref('success'),
      })
    },
    onMounted: () => {},
  })
  let state = module.useWorkspaceBilling(true)
  await state.ready
  assert.equal(selected, 2)
  assert.equal(state.selected.value, 2)
  list[0].owned = 1
  state = module.useWorkspaceBilling()
  await state.ready
  assert.equal(selected, 1)
})

test('billing refresh aborts stalled workspace, plan and payment reads', async () => {
  const require = createRequire(import.meta.url)
  const { $fetch } = createRequire(require.resolve('nuxt/package.json'))(
    'ofetch',
  )
  let stalledPath = ''
  let closed: Promise<void> = Promise.resolve()
  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] === stalledPath) {
      closed = new Promise<void>((resolve) => response.once('close', resolve))
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({ workspaces: [{ id: 1, role: 'admin', owned: 1 }] }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const fetcher = (url: string, options: any) => {
    // Exercise the real fetch timeout/abort path on a shorter test clock.
    assert.equal(options?.timeout, 15000)
    return $fetch(url, {
      ...options,
      baseURL: `http://127.0.0.1:${address.port}`,
      timeout: 100,
      retry: 0,
    })
  }
  const scope = effectScope()
  try {
    const billingModule = load(
      'apps/cloud/app/composables/useWorkspaceBilling.ts',
      {
        usePortalIdentity: () => ref({ id: 1 }),
        useRequestFetch: () => fetcher,
        useAsyncData: (_key: string, run: any) => ({
          data: ref(null),
          error: ref(null),
          status: ref('idle'),
          refresh: run,
        }),
        onMounted: () => {},
      },
    )
    const billing = scope.run(() => billingModule.useWorkspaceBilling())!
    for (const path of ['/api/billing/workspaces', '/api/billing/plan']) {
      stalledPath = path
      await assert.rejects(billing.refresh(), /timeout/i)
      await closed // The underlying HTTP request was canceled, not merely raced.
    }
    const paymentsModule = load(
      'apps/cloud/app/composables/useCloudPayments.ts',
      {
        toValue: (value: any) =>
          typeof value === 'function' ? value() : value,
        $fetch: fetcher,
        onMounted: () => {},
        onBeforeUnmount: () => {},
        useIntervalFn: () => {},
      },
    )
    const payments = scope.run(() => paymentsModule.useCloudPayments(1))!
    stalledPath = '/api/billing/payments'
    await payments.refresh()
    await closed
    assert.ok(payments.error.value)
    assert.equal(payments.data.value, undefined)
  } finally {
    scope.stop()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

test('payments polling preserves in-flight timeout errors and retries without superseding workspace refreshes', async () => {
  const requests: {
    resolve: (value: any) => void
    reject: (error: Error) => void
  }[] = []
  let poll!: () => void
  const workspaceId = ref(1)
  const module = load('apps/cloud/app/composables/useCloudPayments.ts', {
    toValue,
    document: { visibilityState: 'visible' },
    $fetch: () =>
      new Promise((resolve, reject) => requests.push({ resolve, reject })),
    onMounted: () => {},
    onBeforeUnmount: () => {},
    useIntervalFn: (callback: () => void) => {
      poll = callback
    },
  })
  const flush = async () => {
    for (let n = 0; n < 8; n++) await nextTick()
  }
  const scope = effectScope()
  try {
    const payments = scope.run(() => module.useCloudPayments(workspaceId))!
    const first = payments.refresh()
    poll() // The timer fires just before the existing request times out.
    assert.equal(requests.length, 1)
    requests[0]!.reject(new Error('Request timeout'))
    await first
    assert.ok(payments.error.value)
    poll() // The following tick retries the failed request.
    assert.equal(requests.length, 2)
    requests[1]!.resolve({ workspaceId: 1 })
    await flush()
    assert.equal(payments.error.value, '')
    assert.equal(payments.data.value.workspaceId, 1)
    const stale = payments.refresh()
    workspaceId.value = 2
    await flush()
    assert.equal(requests.length, 4)
    requests[2]!.resolve({ workspaceId: 1 })
    await stale
    // Finishing the superseded request must not clear the new request's pending flag.
    poll()
    assert.equal(requests.length, 4)
    assert.equal(payments.data.value, null)
    requests[3]!.resolve({ workspaceId: 2 })
    await flush()
    assert.equal(payments.data.value.workspaceId, 2)
    poll()
    assert.equal(requests.length, 5)
    requests[4]!.resolve({ workspaceId: 2 })
    await flush()
  } finally {
    scope.stop()
  }
})

test('payments loaded without return parameters reconcile the owned checkout and refresh the plan', async () => {
  const calls: { method: string; body?: any }[] = []
  let planRefreshes = 0
  let reads = 0
  const module = load('apps/cloud/app/composables/useCloudPayments.ts', {
    toValue,
    $fetch: async (_path: string, options: any) => {
      calls.push({ method: options.method ?? 'GET', body: options.body })
      if (options.method === 'POST') return { state: 'inactive' }
      return {
        canManage: true,
        pending:
          reads++ === 0
            ? {
                id: 'stored-checkout',
                canRefresh: 1,
                state: 'open',
                url: 'https://test.checkout.dodopayments.com/session/stale',
              }
            : null,
      }
    },
    onMounted: () => {},
    onBeforeUnmount: () => {},
    useIntervalFn: () => {},
  })
  const scope = effectScope()
  try {
    const payments = scope.run(() =>
      module.useCloudPayments(1, async () => {
        planRefreshes++
      }),
    )!
    await payments.refresh()
    assert.deepEqual(
      calls.map((c) => c.method),
      ['GET', 'POST', 'GET'],
    )
    assert.equal(
      JSON.stringify(calls[1]!.body),
      JSON.stringify({
        action: 'refresh',
        workspaceId: 1,
        checkoutId: 'stored-checkout',
      }),
    )
    assert.equal(payments.data.value.pending, null)
    assert.equal(planRefreshes, 1)
    assert.equal(payments.busy.value, false)
  } finally {
    scope.stop()
  }
})

test('checkout verification diagnostics are re-read after 422 and non-owners do not reconcile another checkout', async () => {
  for (const canRefresh of [0, 1]) {
    let reads = 0
    let writes = 0
    const module = load('apps/cloud/app/composables/useCloudPayments.ts', {
      toValue,
      $fetch: async (_path: string, options: any) => {
        if (options.method === 'POST') {
          writes++
          throw { statusCode: 422 }
        }
        reads++
        return {
          canManage: true,
          pending: {
            id: 'stored-checkout',
            canRefresh,
            state: reads > 1 ? 'uncertain' : 'open',
            url: reads > 1 ? null : 'provider-url',
            error: reads > 1 ? 'payment_amount_mismatch' : null,
          },
        }
      },
      onMounted: () => {},
      onBeforeUnmount: () => {},
      useIntervalFn: () => {},
    })
    const scope = effectScope()
    try {
      const payments = scope.run(() => module.useCloudPayments(1))!
      await payments.refresh()
      assert.equal(writes, canRefresh)
      assert.equal(
        payments.data.value.pending.url,
        canRefresh ? null : 'provider-url',
      )
      if (canRefresh)
        assert.equal(
          payments.data.value.pending.error,
          'payment_amount_mismatch',
        )
    } finally {
      scope.stop()
    }
  }
})

test('passive payment refreshes read state without duplicating provider confirmation', async () => {
  let poll!: () => void
  let mount!: () => void
  const methods: string[] = []
  const workspaceId = ref(1)
  const module = load('apps/cloud/app/composables/useCloudPayments.ts', {
    toValue,
    document: { visibilityState: 'visible' },
    $fetch: async (_path: string, options: any) => {
      methods.push(options.method ?? 'GET')
      return { canManage: true, pending: { id: 'checkout', canRefresh: 1 } }
    },
    onMounted: (callback: () => void) => {
      mount = callback
    },
    onBeforeUnmount: () => {},
    useIntervalFn: (callback: () => void) => {
      poll = callback
    },
  })
  const flush = async () => {
    for (let n = 0; n < 12; n++) await nextTick()
  }
  const scope = effectScope()
  try {
    const payments = scope.run(() => module.useCloudPayments(workspaceId))!
    mount()
    await flush()
    assert.deepEqual(methods.splice(0), ['GET', 'POST', 'GET'])
    poll()
    await flush()
    assert.deepEqual(methods.splice(0), ['GET'])
    await payments.refresh({ reconcile: false })
    assert.deepEqual(methods.splice(0), ['GET'])
    workspaceId.value = 2
    await flush()
    assert.deepEqual(methods.splice(0), ['GET', 'POST', 'GET'])
    await payments.refresh()
    assert.deepEqual(methods, ['GET', 'POST', 'GET'])
  } finally {
    scope.stop()
  }
})

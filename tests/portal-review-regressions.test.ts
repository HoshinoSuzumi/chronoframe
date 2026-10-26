import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { isAlbumPagePath } from '../packages/gallery/shared/utils/albumPath.ts'
import { ref, reactive, computed, readonly, watch, effectScope } from 'vue'

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
    assert.match(media.message.value, /100 MiB/)
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

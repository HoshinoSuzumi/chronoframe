import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {
  entryRequestPath,
  CLOUD_CAPABILITIES,
} from '../packages/contracts/src/entry.ts'
import type { EntrySiteContext } from '../packages/contracts/src/entry.ts'

for (const name of ['console', 'gallery'])
  test(`${name} transport preserves SSR request fetch and scopes async data across Sites and users`, async () => {
    const title = name[0]!.toUpperCase() + name.slice(1)
    const calls: { request: string; options: Record<string, unknown> }[] = []
    const context: { value: EntrySiteContext | null } = { value: null }
    const value = (input: any): any =>
      typeof input === 'function'
        ? input()
        : input && typeof input === 'object' && 'value' in input
          ? input.value
          : input
    const scopedFetch = async (request: unknown, options: any) => {
      calls.push({
        request: value(request),
        options: {
          ...options,
          ...(options.key ? { key: value(options.key) } : {}),
        },
      })
      return { authenticated: true }
    }
    const globals = {
      useRuntimeConfig: () => ({ public: { [name]: { apiBase: '' } } }),
      useRequestFetch: () => scopedFetch,
      useFetch: scopedFetch,
      useEntryContext: () => context,
      computed: (get: () => unknown) => ({
        get value() {
          return get()
        },
      }),
      toValue: value,
    }
    const load = (path: string, imports: Record<string, unknown>) => {
      const exports: Record<string, any> = {}
      const code = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText
      vm.runInNewContext(code, {
        ...globals,
        exports,
        require: (key: string) => {
          assert.ok(key in imports, key)
          return imports[key]
        },
      })
      return exports
    }
    const shared = load('packages/gallery/app/composables/useEntryApi.ts', {
      './useEntryContext': { useEntryContext: () => context, entryRequestPath },
    })
    const api = load(`packages/${name}/app/composables/use${title}Api.ts`, {
      [name === 'console'
        ? '#gallery/composables/useEntryApi'
        : './useEntryApi']: shared,
    })
    const fetcher = api[`use${title}Api`]()
    assert.equal(
      (await fetcher('/api/photos', { method: 'GET' })).authenticated,
      true,
    )
    assert.equal(calls.at(-1)!.request, '/api/photos')
    context.value = {
      siteId: 1,
      scope: 'site:1:portal:user1',
      audience: 'portal',
      name: 'one',
      published: true,
      capabilities: CLOUD_CAPABILITIES,
    }
    await api[`use${title}Fetch`]('/api/albums', { key: 'albums' })
    assert.equal(calls.at(-1)!.request, '/api/sites/1/albums')
    const firstKey = calls.at(-1)!.options.key
    context.value = {
      ...context.value,
      siteId: 2,
      scope: 'site:2:portal:user1',
    }
    await api[`use${title}Fetch`]('/api/albums', { key: 'albums' })
    assert.equal(calls.at(-1)!.request, '/api/sites/2/albums')
    assert.notEqual(calls.at(-1)!.options.key, firstKey)
    context.value = { ...context.value, scope: 'site:2:portal:user2' }
    await api[`use${title}Fetch`]('/api/albums', { key: 'albums' })
    assert.ok(String(calls.at(-1)!.options.key).includes('user2'))
    await assert.rejects(fetcher('/api/photos'), /Site context changed/)
    const currentFetcher = api[`use${title}Api`]()
    await currentFetcher('/api/photos', {
      baseURL: 'https://untrusted.example',
    })
    assert.equal(calls.at(-1)!.options.baseURL, '')
  })

test('public gallery unwraps resource envelopes without changing scoped SSR requests', async () => {
  const calls: string[] = []
  const context = { value: { audience: 'public', scope: 'site:1:public' } }
  const responses: Record<string, unknown> = {
    '/api/photos': { photos: [{ id: 'one' }] },
    '/api/albums': { albums: [{ id: 1 }] },
    '/api/albums/1': { album: { id: 1 } },
    '/api/photos/one/reactions': { reactions: { heart: 1 } },
  }
  const exports: Record<string, any> = {}
  const value = (v: any): any =>
    typeof v === 'function'
      ? v()
      : v && typeof v === 'object' && 'value' in v
        ? v.value
        : v
  const code = ts.transpileModule(
    readFileSync('packages/gallery/app/composables/useGalleryApi.ts', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  vm.runInNewContext(code, {
    exports,
    useEntryContext: () => context,
    useRuntimeConfig: () => ({ public: { gallery: { apiBase: '' } } }),
    computed: (get: () => unknown) => ({
      get value() {
        return get()
      },
    }),
    toValue: value,
    require: () => ({
      useEntryApi: () => async (path: string) => {
        calls.push(path)
        return responses[path]
      },
      useEntryFetch: async (path: unknown, options: any) => {
        const p = value(path)
        calls.push(p)
        return options.transform(responses[p])
      },
    }),
  })
  const api = exports.useGalleryApi()
  assert.equal(
    JSON.stringify(await api('/api/photos/visible')),
    '[{"id":"one"}]',
  )
  assert.equal(calls.at(-1), '/api/photos')
  assert.equal(JSON.stringify(await api('/api/albums')), '[{"id":1}]')
  assert.equal(JSON.stringify(await api('/api/albums/1')), '{"id":1}')
  assert.equal(
    JSON.stringify(await api('/api/photos/one/reactions')),
    '{"reactions":{"heart":1}}',
  )
  assert.equal(
    await exports.useGalleryFetch(() => '/api/photos/visible', {
      transform: (photos: unknown[]) => photos.length,
    }),
    1,
  )
})

test('mounted entry fetch keeps its Site path and cache key while the next route changes context', () => {
  const context: { value: any } = {
    value: { siteId: 1, scope: 'site:1:portal:user1', audience: 'portal' },
  }
  let captured: any
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(
    readFileSync('packages/gallery/app/composables/useEntryApi.ts', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  vm.runInNewContext(code, {
    exports,
    require: () => ({ useEntryContext: () => context, entryRequestPath }),
    toValue: (value: any) => value?.value ?? value,
    computed: (getter: () => unknown) => ({
      get value() {
        return getter()
      },
    }),
    useFetch: (path: any, options: any) => {
      captured = { path, options }
    },
  })
  exports.useEntryFetch('/api/albums', undefined, '')
  const outgoing = captured
  context.value = null
  assert.equal(outgoing.path.value, '/api/sites/1/albums')
  assert.equal(
    outgoing.options.key.value,
    'site:1:portal:user1:fetch:/api/sites/1/albums',
  )
  context.value = {
    siteId: 2,
    scope: 'site:2:portal:user2',
    audience: 'portal',
  }
  exports.useEntryFetch('/api/albums', undefined, '')
  assert.equal(captured.path.value, '/api/sites/2/albums')
  assert.notEqual(captured.options.key.value, outgoing.options.key.value)
  assert.equal(outgoing.path.value, '/api/sites/1/albums')
})

test('retired Site async data is cleared after page completion, preserving a reactivated scope', () => {
  const context: { value: any } = { value: { scope: 'site:1' } }
  let changed: (scope: string, previous: string) => void = () => {}
  let finish: () => void = () => {}
  const cleared: string[] = []
  const keys = ['site:1:fetch:photos', 'site:2:fetch:photos', 'auth-status']
  const code = ts.transpileModule(
    readFileSync(
      'packages/gallery/app/plugins/entry-context.ts',
      'utf8',
    ).replace('import.meta.client', 'false'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  vm.runInNewContext(code, {
    exports: {},
    require: () => ({ clearImageLoaderCache() {} }),
    defineNuxtPlugin: (setup: any) =>
      setup({
        hook: (name: string, callback: () => void) => {
          assert.equal(name, 'page:finish')
          finish = callback
        },
      }),
    useEntryContext: () => context,
    useSettingsStore: () => ({ $reset() {} }),
    useViewerState: () => ({ clearReturnRoute() {} }),
    watch: (_: any, callback: any) => {
      changed = callback
    },
    clearNuxtData: (predicate: (key: string) => boolean) => {
      cleared.push(...keys.filter(predicate))
    },
  })
  context.value = { scope: 'site:2' }
  changed('site:2', 'site:1')
  assert.deepEqual(cleared, [], 'outgoing component data remains available')
  finish()
  assert.deepEqual(cleared, ['site:1:fetch:photos'])
  cleared.length = 0
  context.value = { scope: 'site:1' }
  changed('site:1', 'site:2')
  context.value = { scope: 'site:2' }
  changed('site:2', 'site:1')
  finish()
  assert.deepEqual(
    cleared,
    ['site:1:fetch:photos'],
    'active scope and unrelated auth data survive',
  )
})

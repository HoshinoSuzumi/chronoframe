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
    await fetcher('/api/photos', { baseURL: 'https://untrusted.example' })
    assert.equal(calls.at(-1)!.options.baseURL, '')
  })

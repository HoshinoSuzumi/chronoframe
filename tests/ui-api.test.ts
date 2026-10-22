import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

for (const name of ['console', 'gallery'])
  test(`${name} API adapter delegates to request-scoped SSR fetch without requiring a factory`, async () => {
    const title = name[0]!.toUpperCase() + name.slice(1)
    const calls: unknown[] = []
    const exports: Record<string, any> = {}
    const scopedFetch = async (request: unknown, options: unknown) => {
      calls.push({ request, options })
      return { authenticated: true }
    }
    const code = ts.transpileModule(
      readFileSync(
        `packages/${name}/app/composables/use${title}Api.ts`,
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText
    vm.runInNewContext(code, {
      exports,
      useRuntimeConfig: () => ({
        public: { [name]: { apiBase: 'https://portal.example.com' } },
      }),
      useRequestFetch: () => scopedFetch,
      useFetch: scopedFetch,
    })
    assert.equal(
      (await exports[`use${title}Api`]()('/api/photos', { method: 'GET' }))
        .authenticated,
      true,
    )
    await exports[`use${title}Fetch`]('/api/albums')
    assert.equal(
      JSON.stringify(calls),
      JSON.stringify([
        {
          request: '/api/photos',
          options: { baseURL: 'https://portal.example.com', method: 'GET' },
        },
        {
          request: '/api/albums',
          options: { baseURL: 'https://portal.example.com' },
        },
      ]),
    )
  })

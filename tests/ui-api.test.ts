import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('console API adapter delegates to request-scoped SSR fetch without requiring a factory', async () => {
  const calls: unknown[] = []
  const exports: Record<string, any> = {}
  const scopedFetch = async (request: unknown, options: unknown) => {
    calls.push({ request, options })
    return { authenticated: true }
  }
  const code = ts.transpileModule(
    readFileSync('packages/console/app/composables/useConsoleApi.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText
  vm.runInNewContext(code, {
    exports,
    useRuntimeConfig: () => ({
      public: { console: { apiBase: 'https://portal.example.com' } },
    }),
    useRequestFetch: () => scopedFetch,
    useFetch: scopedFetch,
  })
  assert.equal(
    (await exports.useConsoleApi()('/api/photos', { method: 'GET' }))
      .authenticated,
    true,
  )
  await exports.useConsoleFetch('/api/albums')
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

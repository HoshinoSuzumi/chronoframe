import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('Site domain middleware leaves Nuxt error rendering independent of unavailable Worker bindings', async () => {
  const exports: Record<string, any> = {}
  let lookups = 0
  const missing = Object.assign(new Error('Site not found'), {
    statusCode: 404,
  })
  const code = ts.transpileModule(
    readFileSync('apps/site/server/middleware/00-domain-routing.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText
  vm.runInNewContext(code, {
    exports,
    defineEventHandler: (fn: unknown) => fn,
    useRuntimeConfig: () => ({ public: { siteBaseDomain: 'chronoframe.art' } }),
    require: (name: string) => {
      if (name.endsWith('/domain-policy'))
        return { domainEligibility: async () => ({ allowed: true }) }
      if (name === 'h3')
        return {
          getRequestURL: (e: any) => new URL(e.url),
          setResponseHeader: (e: any, key: string, value: string) => {
            e.headers[key] = value
          },
          createError: (e: any) => Object.assign(new Error(e.statusMessage), e),
        }
      if (name === '@chronoframe/contracts/domains')
        return { validSiteSlug: () => true }
      if (name.endsWith('/runtime'))
        return {
          platformRequestURL: (e: any) => new URL(e.url),
          platformDatabase: () => {
            throw new Error('Database must not be read during error rendering')
          },
        }
      if (name.endsWith('/context'))
        return {
          publicSiteContext: async () => {
            lookups++
            throw missing
          },
        }
      throw new Error(name)
    },
  })
  await assert.rejects(
    () =>
      exports.default({
        url: 'https://le0.chronoframe.art/',
        headers: {},
        method: 'GET',
      }),
    { statusCode: 404 },
  )
  const event = {
    url: 'http://localhost/__nuxt_error?error=true&statusCode=404',
    headers: {} as Record<string, string>,
    method: 'GET',
  }
  await exports.default(event)
  assert.equal(
    lookups,
    1,
    'the error render must not attempt another tenant lookup',
  )
  assert.equal(event.headers['Cache-Control'], 'no-store')
})

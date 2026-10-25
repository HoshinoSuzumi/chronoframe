import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { isAlbumPagePath } from '../packages/gallery/shared/utils/albumPath.ts'
import { ref, watch } from 'vue'

test('same-Site hydration preserves state; scope changes and rejected navigation clear it', async () => {
  const context = ref<{ scope: string } | null>({ scope: 'site:one:public' })
  let next: { scope: string } | Error = { scope: 'site:one:public' }
  const changes: unknown[] = []
  const stop = watch(
    () => context.value?.scope,
    (value) => changes.push(value),
    { flush: 'sync' },
  )
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(
    readFileSync('apps/site/app/middleware/site.global.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.equal(name, '@chronoframe/gallery/shared/utils/albumPath')
      return { isAlbumPagePath }
    },
    defineNuxtRouteMiddleware: (fn: unknown) => fn,
    useEntryContext: () => context,
    useRequestFetch: () => async () => {
      if (next instanceof Error) throw next
      return next
    },
    createError: (error: unknown) => error,
    abortNavigation: (error: unknown) => error,
  })
  try {
    await exports.default({ path: '/' })
    await exports.default({ path: '/' })
    assert.deepEqual(
      changes,
      [],
      'hydration/revalidation must not reset the same scope',
    )
    next = { scope: 'site:two:public' }
    await exports.default({ path: '/' })
    assert.deepEqual(changes, ['site:two:public'])
    next = new Error('Host mapping revoked')
    await exports.default({ path: '/' })
    assert.equal(context.value, null)
    context.value = { scope: 'site:one:public' }
    await exports.default({ path: '/dashboard' })
    assert.equal(context.value, null)
  } finally {
    stop()
  }
})

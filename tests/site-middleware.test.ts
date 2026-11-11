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
    await exports.default({ path: '/' }, { matched: [] })
    await exports.default({ path: '/' }, { matched: [] })
    assert.deepEqual(
      changes,
      [],
      'hydration/revalidation must not reset the same scope',
    )
    next = { scope: 'site:two:public' }
    await exports.default({ path: '/' }, { matched: [] })
    assert.deepEqual(changes, ['site:two:public'])
    next = new Error('Host mapping revoked')
    await exports.default({ path: '/' }, { matched: [] })
    assert.equal(context.value, null)
    context.value = { scope: 'site:one:public' }
    await exports.default({ path: '/dashboard' }, { matched: [] })
    assert.equal(context.value, null)
  } finally {
    stop()
  }
})

test('viewer transitions reuse Site context without waiting for another request', async () => {
  const context = ref<{ scope: string } | null>({ scope: 'site:one:public' })
  let requests = 0
  const exports: Record<string, any> = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync('apps/site/app/middleware/site.global.ts', 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports,
      require: () => ({ isAlbumPagePath }),
      defineNuxtRouteMiddleware: (fn: unknown) => fn,
      useEntryContext: () => context,
      useRequestFetch: () => async () => {
        requests++
        return { scope: 'site:one:public' }
      },
      createError: (error: unknown) => error,
      abortNavigation: (error: unknown) => error,
    },
  )
  const wall = { path: '/photos', name: 'photos', matched: [{}], query: {} }
  const photo = { path: '/photo-one', name: 'slug', matched: [{}], query: {} }
  const album = { path: '/albums/summer', matched: [{}], query: {} }
  const albumPhoto = { ...album, query: { photo: 'one' } }
  for (const [to, from] of [
    [photo, wall],
    [{ ...photo, path: '/photo-two' }, photo],
    [wall, photo],
    [albumPhoto, album],
    [album, albumPhoto],
  ]) {
    await exports.default(to, from)
    assert.equal(requests, 0)
  }
  // A first/direct visit, unrelated page, or missing context must still resolve
  // the trusted Host context. Public APIs continue to authorize every request.
  await exports.default(photo, { ...wall, matched: [] })
  await exports.default(album, wall)
  assert.equal(requests, 2)
  context.value = null
  await exports.default(photo, wall)
  assert.equal(requests, 3)
})

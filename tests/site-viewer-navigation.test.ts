import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, reactive, ref, watch, effectScope, nextTick } from 'vue'
function compile(source: string, context: Record<string, unknown>) {
  const exports: Record<string, unknown> = {}
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports, ...context },
  )
  return exports
}
test('Site viewer route keeps scroll on open/close and preserves normal navigation', () => {
  const router = compile(
    readFileSync('apps/site/app/router.options.ts', 'utf8'),
    {
      require: () => ({
        useNuxtApp: () => {
          throw Error('unexpected page wait')
        },
        useRouter: () => ({}),
      }),
    },
  ).default as {
    scrollBehavior(
      to: {
        name?: string
        path?: string
        hash?: string
        query?: { photo?: string }
      },
      from: {
        name?: string
        path?: string
        hash?: string
        query?: { photo?: string }
      },
      saved: unknown,
    ): unknown
  }
  assert.equal(
    router.scrollBehavior({ name: 'slug' }, { path: '/' }, null),
    false,
  )
  assert.equal(
    router.scrollBehavior({ path: '/' }, { name: 'slug' }, null),
    false,
  )
  assert.equal(
    router.scrollBehavior({ path: '/photos' }, { name: 'slug' }, null),
    false,
  )
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        router.scrollBehavior({ path: '/albums' }, { path: '/' }, null),
      ),
    ),
    { top: 0 },
  )
  assert.equal(
    router.scrollBehavior({ path: '/albums/summer' }, { name: 'slug' }, null),
    false,
  )
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        router.scrollBehavior(
          { path: '/photos', hash: '#summer' },
          { path: '/' },
          null,
        ),
      ),
    ),
    { el: '#summer' },
  )
  assert.equal(
    router.scrollBehavior(
      { path: '/albums/summer', query: { photo: 'one' } },
      { path: '/albums/summer' },
      null,
    ),
    false,
  )
  assert.equal(
    router.scrollBehavior(
      { path: '/albums/summer' },
      { path: '/albums/summer', query: { photo: 'one' } },
      null,
    ),
    false,
  )
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        router.scrollBehavior(
          { path: '/albums/winter' },
          { path: '/albums/summer', query: { photo: 'one' } },
          null,
        ),
      ),
    ),
    { top: 0 },
  )
  const saved = { left: 0, top: 900 }
  assert.equal(
    router.scrollBehavior({ path: '/' }, { name: 'slug' }, saved),
    saved,
  )
})
test('photo route owns exactly one reactive title across repeated viewer open/close', async () => {
  const route = reactive({ params: { slug: ['first'] } as { slug?: string[] } })
  const photos = ref([
    { id: 'first', title: 'First photo' },
    { id: 'second', title: 'Second photo' },
  ])
  const state = { isViewerOpen: ref(true), scopedPhotos: ref(null) }
  let head: (() => { title: string }) | undefined,
    entries = 0
  const scope = effectScope()
  try {
    scope.run(() =>
      compile(
        readFileSync('packages/gallery/app/pages/[...slug].vue', 'utf8')
          .split('<script lang="ts" setup>')[1]!
          .split('</script>')[0]!,
        {
          ref,
          computed,
          watch,
          definePageMeta: () => {},
          useRoute: () => route,
          useViewerState: () => ({
            closeViewer: () => {
              state.isViewerOpen.value = false
            },
            openViewer: () => {
              state.isViewerOpen.value = true
            },
            switchToIndex: () => {},
          }),
          storeToRefs: () => state,
          usePhotos: () => ({ photos }),
          useI18n: () => ({ t: () => 'Photo' }),
          useHead: (value: () => { title: string }) => {
            head = value
            entries++
          },
          onBeforeRouteLeave: () => {},
        },
      ),
    )
    assert.equal(head!().title, 'First photo')
    route.params = {}
    await nextTick()
    assert.equal(head!().title, '')
    route.params = { slug: ['second'] }
    await nextTick()
    assert.equal(head!().title, 'Second photo')
    route.params = {}
    await nextTick()
    assert.equal(head!().title, '')
    assert.equal(entries, 1)
  } finally {
    scope.stop()
  }
})

test('cross-page hashes wait for destination rendering and transitions, while same-page hashes are immediate', async () => {
  let loaded: (() => Promise<void>) | undefined
  let transitionEnd: (() => void) | undefined
  const app = {
    hooks: {
      hookOnce: (name: string, callback: () => Promise<void>) => {
        assert.equal(name, 'page:loading:end')
        loaded = callback
      },
    },
    '~transitionPromise': new Promise<void>((resolve) => {
      transitionEnd = resolve
    }),
  }
  const current = { value: { fullPath: '/albums/summer#photo' } }
  const router = compile(
    readFileSync('apps/site/app/router.options.ts', 'utf8'),
    {
      require: () => ({
        useNuxtApp: () => app,
        useRouter: () => ({ currentRoute: current }),
      }),
      requestAnimationFrame: (fn: () => void) => fn(),
    },
  ).default as {
    scrollBehavior(to: unknown, from: unknown, saved: unknown): unknown
  }
  const destination = {
    path: '/albums/summer',
    hash: '#photo',
    fullPath: current.value.fullPath,
  }
  const result = router.scrollBehavior(
    destination,
    { path: '/albums', matched: [{}] },
    null,
  ) as Promise<unknown>
  let scrolled = false
  result.then(() => {
    scrolled = true
  })
  await Promise.resolve()
  assert.equal(scrolled, false)
  assert.ok(loaded)
  const rendering = loaded()
  await Promise.resolve()
  assert.equal(scrolled, false)
  transitionEnd!()
  await rendering
  assert.deepEqual(JSON.parse(JSON.stringify(await result)), { el: '#photo' })
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        router.scrollBehavior(
          destination,
          { path: destination.path, matched: [{}] },
          null,
        ),
      ),
    ),
    { el: '#photo' },
  )
  const superseded = router.scrollBehavior(
    destination,
    { path: '/albums', matched: [{}] },
    null,
  ) as Promise<unknown>
  current.value.fullPath = '/photos'
  await loaded!()
  assert.equal(await superseded, false)
})

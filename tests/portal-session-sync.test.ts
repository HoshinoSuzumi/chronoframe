import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { ref } from 'vue'

/** Instantiate the real monitor with controlled status responses and browser lifecycle hooks. */
function monitor(fetcher: () => Promise<unknown>) {
  const identity = ref<{ id: number } | null>({ id: 1 }),
    context = ref<unknown>({ siteId: 1 }),
    catalog = ref<unknown>({ sites: [1] }),
    userId = ref<number | null>(1)
  let cleared = 0,
    reset = 0,
    requests = 0,
    disposed: () => void = () => {}
  const redirects: string[] = []
  const source = readFileSync(
    'apps/cloud/app/composables/usePortalSessionSync.ts',
    'utf8',
  ).replace(/^import[^\n]*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const factory = new Function(
    'exports',
    'useNuxtApp',
    'usePortalIdentity',
    'useEntryContext',
    'useState',
    'useSettingsStore',
    '$fetch',
    'clearNuxtData',
    'navigateTo',
    'onMounted',
    'onBeforeUnmount',
    'window',
    'document',
    code + ';return exports.usePortalSessionSync',
  )(
    {},
    () => ({ runWithContext: (f: () => unknown) => f() }),
    () => identity,
    () => context,
    (key: string) => (key === 'platform-user-id' ? userId : catalog),
    () => ({
      $reset: () => {
        reset++
      },
    }),
    async () => {
      requests++
      return fetcher()
    },
    () => {
      cleared++
    },
    async (path: string) => {
      redirects.push(path)
    },
    () => {},
    (f: () => void) => {
      disposed = f
    },
    { addEventListener: () => {}, removeEventListener: () => {} },
    {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  )
  return {
    check: factory().check,
    identity,
    context,
    catalog,
    userId,
    redirects,
    counts: () => ({ cleared, reset, requests }),
    dispose: () => disposed(),
  }
}

test('An authenticated session remains signed in even when sensitive operations require fresh authentication', async () => {
  const m = monitor(async () => ({
    authenticated: true,
    user: { id: 1 },
    fresh: false,
  }))
  await m.check()
  assert.equal(m.identity.value?.id, 1)
  assert.equal(m.counts().cleared, 0)
  assert.deepEqual(m.redirects, [])
})
test('Expired sessions and account switches clear prior account data at the authentication boundary', async () => {
  for (const session of [
    { authenticated: false, user: null },
    { authenticated: true, user: { id: 2 } },
  ]) {
    const m = monitor(async () => session)
    await m.check()
    assert.equal(m.identity.value, null)
    assert.equal(m.context.value, null)
    assert.equal(m.catalog.value, null)
    assert.equal(m.userId.value, null)
    assert.deepEqual(m.counts(), { cleared: 1, reset: 1, requests: 1 })
    assert.deepEqual(m.redirects, [
      session.authenticated ? '/workspace' : '/signin',
    ])
  }
})
test('Network failures, obsolete responses and disposed monitors cannot sign out the current account', async () => {
  const offline = monitor(async () => {
    throw Error('offline')
  })
  await offline.check()
  assert.equal(offline.identity.value?.id, 1)
  let resolve!: (value: unknown) => void
  const m = monitor(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    ),
    pending = m.check()
  m.identity.value = { id: 2 }
  resolve({ authenticated: false, user: null })
  await pending
  assert.equal(m.identity.value?.id, 2)
  assert.equal(m.counts().cleared, 0)
  m.dispose()
  await m.check()
  assert.equal(m.counts().requests, 1)
})

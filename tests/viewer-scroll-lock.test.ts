import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { effectScope, nextTick, ref, watch } from 'vue'

/** Mount the scroll lock with isolated viewport, CSS support and style fixtures. */
function setup({
  scrollbar = 15,
  gutter = '',
  computedGutter = 'auto',
  overflow = '',
  supported = true,
  paddingRight = '',
  computedPadding = '0px',
} = {}) {
  const root = {
    clientWidth: 1400 - scrollbar,
    style: { scrollbarGutter: gutter },
  }
  const body = { style: { overflow, paddingRight } }
  const exports: Record<string, any> = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        'packages/gallery/app/composables/useViewerScrollLock.ts',
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports,
      require: () => ({ watch }),
      document: { documentElement: root, body },
      window: { innerWidth: 1400 },
      CSS: { supports: () => supported },
      getComputedStyle: (element: unknown) =>
        element === body
          ? { paddingRight: computedPadding }
          : { scrollbarGutter: supported ? computedGutter : undefined },
    },
  )
  const open = ref(false)
  const scope = effectScope()
  scope.run(() => exports.useViewerScrollLock(open))
  return { root, body, open, scope }
}

test('viewer reserves the existing scrollbar width and restores styles on close and unmount', async () => {
  const { root, body, open, scope } = setup({ overflow: 'auto' })
  try {
    assert.equal(
      body.style.overflow,
      'auto',
      'a closed viewer must not alter the page',
    )
    open.value = true
    await nextTick()
    assert.equal(root.style.scrollbarGutter, 'stable')
    assert.equal(body.style.overflow, 'hidden')
    open.value = false
    await nextTick()
    assert.equal(root.style.scrollbarGutter, '')
    assert.equal(body.style.overflow, 'auto')
    open.value = true
    await nextTick()
  } finally {
    scope.stop()
  }
  assert.equal(root.style.scrollbarGutter, '')
  assert.equal(body.style.overflow, 'auto')
})

test('viewer preserves overlay scrollbars, short pages and existing gutter policies', async () => {
  for (const options of [
    { scrollbar: 0 },
    { scrollbar: 0, supported: false },
    { gutter: 'stable both-edges', computedGutter: 'stable both-edges' },
    { computedGutter: 'stable both-edges' },
  ]) {
    const { root, body, open, scope } = setup(options)
    try {
      open.value = true
      await nextTick()
      assert.equal(root.style.scrollbarGutter, options.gutter ?? '')
      assert.equal(body.style.overflow, 'hidden')
      assert.equal(body.style.paddingRight, '')
    } finally {
      scope.stop()
    }
    assert.equal(root.style.scrollbarGutter, options.gutter ?? '')
    assert.equal(body.style.overflow, '')
  }
})

test('viewer compensates unsupported gutters and restores existing padding on close and unmount', async () => {
  const { root, body, open, scope } = setup({
    supported: false,
    paddingRight: 'var(--page-padding)',
    computedPadding: '12px',
  })
  try {
    for (let cycle = 0; cycle < 2; cycle++) {
      open.value = true
      await nextTick()
      assert.equal(body.style.overflow, 'hidden')
      assert.equal(body.style.paddingRight, '27px')
      assert.equal(root.style.scrollbarGutter, '')
      open.value = false
      await nextTick()
      assert.equal(body.style.paddingRight, 'var(--page-padding)')
      assert.equal(body.style.overflow, '')
    }
    open.value = true
    await nextTick()
  } finally {
    scope.stop()
  }
  assert.equal(body.style.paddingRight, 'var(--page-padding)')
  assert.equal(body.style.overflow, '')
  assert.equal(root.style.scrollbarGutter, '')
})

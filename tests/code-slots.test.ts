import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'

type Host = {
  type: string
  props: Record<string, unknown>
  children: Host[]
  parent?: Host
}
function mountSlots() {
  const filename = 'packages/saas-ui/app/components/CfCodeSlots.vue'
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, {
    id: 'code-slots',
    inlineTemplate: true,
  }).content
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const exports: { default?: vue.Component } = {}
  vm.runInNewContext(code, {
    exports,
    ...vue,
    setTimeout,
    clearTimeout,
    require: (name: string) => {
      assert.equal(name, 'vue')
      return vue
    },
  })
  assert.ok(exports.default)
  const model = vue.ref(''),
    status = vue.ref<'idle' | 'error' | 'success'>('idle'),
    disabled = vue.ref(false)
  const completed: string[] = []
  const native = {
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
    focus() {},
    setSelectionRange(start: number, end: number) {
      this.selectionStart = start
      this.selectionEnd = end
    },
  }
  const renderer = vue.createRenderer<Host, Host>({
    createElement: (type) => ({ type, props: {}, children: [] }),
    createText: () => ({ type: '#text', props: {}, children: [] }),
    createComment: () => ({ type: '#comment', props: {}, children: [] }),
    setText() {},
    setElementText() {},
    parentNode: (node) => node.parent ?? null,
    nextSibling: () => null,
    insert(node, parent) {
      node.parent = parent
      parent.children.push(node)
    },
    remove(node) {
      if (node.parent)
        node.parent.children = node.parent.children.filter(
          (child) => child !== node,
        )
    },
    patchProp(node, key, _previous, value) {
      node.props[key] = value
    },
  })
  const root: Host = { type: 'root', props: {}, children: [] }
  const app = renderer.createApp({
    setup: () => () =>
      vue.h(exports.default!, {
        modelValue: model.value,
        status: status.value,
        disabled: disabled.value,
        ariaLabel: 'Verification code',
        required: true,
        'onUpdate:modelValue': (value: string) => {
          model.value = value
        },
        onComplete: (value: string) => completed.push(value),
        onEdit: () => {
          status.value = 'idle'
        },
      }),
  })
  app.component('UInput', {
    inheritAttrs: false,
    props: ['modelValue'],
    setup(props, { attrs, expose }) {
      expose({ inputRef: native })
      return () => vue.h('input', { ...attrs, value: props.modelValue })
    },
  })
  app.mount(root)
  function find(node: Host): Host | undefined {
    return node.type === 'input' ? node : node.children.map(find).find(Boolean)
  }
  const input = find(root)!
  async function enter(value: string) {
    native.value = value
    native.selectionStart = value.length
    ;(input.props.onInput as (event: { target: typeof native }) => void)({
      target: native,
    })
    await vue.nextTick()
  }
  async function paste(value: string) {
    ;(
      input.props.onPaste as (event: {
        preventDefault(): void
        clipboardData: { getData(): string }
      }) => void
    )({ preventDefault() {}, clipboardData: { getData: () => value } })
    await vue.nextTick()
  }
  return {
    app,
    model,
    status,
    disabled,
    completed,
    input,
    native,
    enter,
    paste,
  }
}

test('partial paste replaces the selected digits and leaves the caret after the insertion', async () => {
  const f = mountSlots()
  try {
    await f.enter('12345')
    f.native.setSelectionRange(1, 3)
    await f.paste('9')
    assert.equal(f.model.value, '1945')
    assert.equal(f.native.selectionStart, 2)
    assert.equal(f.native.selectionEnd, 2)
    assert.deepEqual(f.completed, [])
    await f.paste('678901')
    assert.equal(f.model.value, '678901')
    assert.equal(f.native.selectionStart, 6)
    assert.equal(f.native.selectionEnd, 6)
    assert.deepEqual(f.completed, ['678901'])
  } finally {
    f.app.unmount()
  }
})

test('CodeSlots preserves native validation, sanitizes input, supports formatted paste and emits completion once', async () => {
  const f = mountSlots()
  try {
    assert.equal(f.input.props.autocomplete, 'one-time-code')
    assert.equal(f.input.props.inputmode, 'numeric')
    assert.equal(f.input.props.pattern, '[0-9]{6}')
    await f.enter('1x2')
    assert.equal(f.model.value, '12')
    await f.paste('123 456')
    assert.equal(f.model.value, '123456')
    assert.deepEqual(f.completed, ['123456'])
    await f.enter('123456')
    assert.equal(f.completed.length, 1)
    await f.enter('12345')
    assert.equal(f.model.value, '12345')
  } finally {
    f.app.unmount()
  }
})

test('CodeSlots rejects edits while disabled or successful and cancels stale error clearing', async () => {
  const f = mountSlots()
  try {
    f.disabled.value = true
    await vue.nextTick()
    await f.enter('123456')
    assert.equal(f.model.value, '')
    f.disabled.value = false
    await vue.nextTick()
    await f.enter('123456')
    f.status.value = 'error'
    await vue.nextTick()
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.equal(f.model.value, '')
    await f.enter('123456')
    f.status.value = 'error'
    await vue.nextTick()
    await f.enter('12')
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.equal(f.model.value, '12')
    f.status.value = 'success'
    await vue.nextTick()
    await f.paste('654321')
    assert.equal(f.model.value, '12')
  } finally {
    f.app.unmount()
  }
})

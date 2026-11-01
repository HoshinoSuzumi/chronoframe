import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(resolve('packages/saas-ui/package.json'))
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')
const { createSSRApp, h, computed, defineComponent } = vue
const { renderToString } = require('vue/server-renderer')
function evaluate(code: string) {
  const exports: Record<string, any> = {}
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      ...vue,
      Event,
      computed,
      require,
    },
  )
  return exports
}
function component(name: string) {
  const filename = resolve(`packages/saas-ui/app/components/${name}.vue`)
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
  return evaluate(
    compileScript(descriptor, {
      id: name,
      inlineTemplate: true,
      fs: {
        fileExists: existsSync,
        readFile: (file: string) => readFileSync(file, 'utf8'),
      },
    }).content,
  ).default
}
// Probe the adapter boundary; real Nuxt UI interactions are also exercised in the browser.
async function render(
  name: string,
  props: Record<string, any> = {},
  target = 'UButton',
) {
  let received: Record<string, any> = {}
  const app = createSSRApp({ render: () => h(component(name), props) })
  app.component(
    target,
    defineComponent({
      inheritAttrs: false,
      props: ['modelValue', 'max'],
      setup(_props: unknown, { attrs }: any) {
        received = { ...attrs, ...(_props as object) }
        return () => h('span')
      },
    }),
  )
  const html = await renderToString(app)
  return { html, received }
}
test('button adapters preserve submit, pending and disabled navigation props through Nuxt UI', async () => {
  const submit = await render('CfButton', { type: 'submit' })
  assert.equal(submit.received.type, 'submit')
  assert.equal(submit.received.variant, 'solid')
  const pending = await render('CfButton', {
    to: '/sites',
    loading: true,
    disabled: true,
    variant: 'secondary',
  })
  assert.equal(pending.received.to, '/sites')
  assert.equal(pending.received.loading, true)
  assert.equal(pending.received.disabled, true)
  assert.equal(pending.received.variant, 'outline')
  assert.equal(pending.received.color, 'neutral')
})
test('input adapters forward controlled values, validation and labels to Nuxt UI', async () => {
  const { received } = await render(
    'CfInput',
    {
      id: 'gallery-name',
      value: 'Local Gallery',
      required: true,
      maxlength: 80,
      'aria-invalid': true,
    },
    'UInput',
  )
  assert.equal(received.id, 'gallery-name')
  assert.equal(received.modelValue, 'Local Gallery')
  assert.equal(received.required, true)
  assert.equal(received.maxlength, 80)
  assert.equal(received['aria-invalid'], true)
})
test('progress adapters clamp invalid usage and expose exactly one labeled progressbar', async () => {
  const over = await render(
    'CfProgress',
    { value: 125, 'aria-label': 'Sites' },
    'UProgress',
  )
  assert.equal(over.received.modelValue, 100)
  assert.match(over.html, /aria-valuenow="100"/)
  assert.match(over.html, /aria-label="Sites"/)
  const invalid = await render(
    'CfProgress',
    { value: Number.NaN, max: 0 },
    'UProgress',
  )
  assert.equal(invalid.received.modelValue, 0)
  assert.equal(invalid.received.max, 100)
})
test('checkbox adapters retain array membership and native change handlers without mutating the input', async () => {
  const original = ['a']
  let updated: unknown
  let event: Event | undefined
  const { received } = await render(
    'CfCheckbox',
    {
      modelValue: original,
      value: 'b',
      'onUpdate:modelValue': (value: unknown) => (updated = value),
      onChange: (value: Event) => (event = value),
    },
    'UCheckbox',
  )
  assert.equal(received.modelValue, false)
  received['onUpdate:modelValue'](true)
  assert.deepEqual(Array.from(updated as string[]), ['a', 'b'])
  assert.deepEqual(original, ['a'])
  assert.equal((event?.target as HTMLInputElement)?.checked, true)
})

test('resolved home paths display a localized home label and retain independent site links', async () => {
  const row = {
    label: '/',
    page: {
      site: { title: 'Gallery', href: 'https://gallery.example/' },
      segments: [],
    },
  }
  const home = await render('CfAnalyticsPageLink', { row, zh: true })
  assert.match(home.html, /首页/)
  assert.ok(home.html.includes('href="https://gallery.example/"'))
  const admin = await render('CfAnalyticsPageLink', {
    row,
    admin: true,
    zh: true,
  })
  assert.match(admin.html, /Gallery/)
  assert.match(admin.html, /首页/)
  assert.equal((admin.html.match(/<a /g) ?? []).length, 2)
})

test('input validation callbacks observe the updated model for fields and textareas', async () => {
  for (const [componentName, target] of [
    ['CfInput', 'UInput'],
    ['CfTextarea', 'UTextarea'],
  ]) {
    let model = 'before',
      observed = ''
    const { received } = await render(
      componentName,
      {
        modelValue: model,
        'onUpdate:modelValue': (value: string) => {
          model = value
        },
        onInput: () => {
          observed = model
        },
      },
      target,
    )
    received.onInput(new Event('input'))
    received['onUpdate:modelValue']('after')
    await vue.nextTick()
    assert.equal(observed, 'after')
  }
})

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(resolve('packages/saas-ui/package.json'))
const { parse, compileScript } = require('vue/compiler-sfc')
const { createSSRApp, h, computed } = require('vue')
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
      computed,
      require: (name: string) =>
        name === '../utils/cn'
          ? evaluate(readFileSync('packages/saas-ui/app/utils/cn.ts', 'utf8'))
          : require(name),
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
const render = (name: string, props = {}, children?: () => any) =>
  renderToString(
    createSSRApp({ render: () => h(component(name), props, children) }),
  )

test('Shared buttons preserve form semantics and a single pending polymorphic link', async () => {
  assert.match(await render('CfButton'), /type="button"/)
  assert.match(await render('CfButton', { type: 'submit' }), /type="submit"/)
  const pending = await render(
    'CfButton',
    { asChild: true, loading: true },
    () => h('a', { href: '/sites' }, 'Sites'),
  )
  assert.equal(pending.match(/<([a-z][a-z0-9]*)\b/i)?.[1], 'a')
  assert.match(pending, /aria-busy="true"/)
  assert.match(pending, /aria-disabled="true"/)
  assert.match(pending, /tabindex="-1"/)
  assert.match(pending, /href="\/sites"/)
  assert.doesNotMatch(pending, /<button|<svg/)
})
test('Shared native input forwards labels, validation and required form attributes', async () => {
  const html = await render('CfInput', {
    id: 'gallery-name',
    modelValue: 'Local Gallery',
    required: true,
    maxlength: 80,
    'aria-invalid': true,
  })
  for (const attribute of [
    'id="gallery-name"',
    'value="Local Gallery"',
    'required',
    'maxlength="80"',
    'aria-invalid="true"',
  ])
    assert.ok(html.includes(attribute), attribute)
})
test('Shared progress clamps invalid and over-limit usage while retaining accessible labels', async () => {
  const over = await render('CfProgress', { value: 125, 'aria-label': 'Sites' })
  assert.match(over, /aria-valuenow="100"/)
  assert.match(over, /aria-label="Sites"/)
  assert.match(over, /width:100%/)
  const unknown = await render('CfProgress', { value: Number.NaN, max: 0 })
  assert.match(unknown, /aria-valuenow="0"/)
  assert.match(unknown, /aria-valuemax="100"/)
})

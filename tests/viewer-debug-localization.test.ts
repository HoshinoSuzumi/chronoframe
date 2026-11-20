import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { parse, compileScript } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'
import * as vue from 'vue'
import ts from 'typescript'
import { localeCodes } from '../packages/gallery/i18n/i18n.options.ts'
import { DEFAULT_DEBUG_LABELS } from '../packages/webgl-image/src/debug-labels.ts'

const filename = 'packages/webgl-image/src/components/DebugInfo.vue'
const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
const source = compileScript(descriptor, {
  id: 'debug-info',
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
  require: (name: string) =>
    name === 'vue'
      ? vue
      : createRequire(import.meta.url)(
          `../packages/webgl-image/src/${name.replace('../', '')}.ts`,
        ),
})
const debugInfo = {
  scale: 1.949,
  relativeScale: 1,
  translateX: 817.5,
  translateY: 0,
  canvasWidth: 3132,
  canvasHeight: 1996,
  devicePixelRatio: 2,
  imageWidth: 768,
  imageHeight: 1024,
  tileEnabled: true,
  useTiles: false,
  totalTiles: 0,
  visibleTiles: 0,
  tileSize: 1024,
  maxTextureSize: 16384,
  isLoading: false,
  loadingState: 'complete',
  currentQuality: 'high',
  imageSrc: 'photo.webp',
}
const locales = localeCodes
const messages = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(`packages/gallery/i18n/locales/${locale}.json`, 'utf8'),
    ),
  ]),
)

function flattenLabels(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    assert.ok(value.trim().length > 0, `empty translation: ${prefix}`)
    return { [prefix]: value }
  }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), prefix)
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flattenLabels(child, prefix ? `${prefix}.${key}` : key)),
    ),
  )
}

for (const locale of locales) {
  test(`debug panel renders all labels and states in ${locale}`, async () => {
    const labels = messages[locale].debug.viewer.diagnostics
    assert.ok(labels, 'locale must provide diagnostics translations')
    assert.deepEqual(
      Object.keys(flattenLabels(labels)).sort(),
      Object.keys(flattenLabels(DEFAULT_DEBUG_LABELS)).sort(),
    )
    assert.ok(exports.default)
    for (const loadingState of [
      'idle',
      'image-loading',
      'texture-loading',
      'tile-loading',
      'complete',
      'error',
    ]) {
      for (const currentQuality of ['high', 'medium', 'low', 'unknown']) {
        const html = await renderToString(
          vue.createSSRApp(exports.default, {
            debugInfo: { ...debugInfo, loadingState, currentQuality },
            labels,
          }),
        )
        for (const value of Object.values(labels)) {
          if (typeof value === 'string')
            assert.ok(html.includes(value), `missing ${value}`)
        }
        assert.ok(html.includes(labels.loadingStates[loadingState]))
        assert.ok(html.includes(labels.qualities[currentQuality]))
        assert.ok(html.includes('1.949'))
        assert.ok(html.includes('817.50'))
      }
    }
  })
}

for (const { filename, binding } of [
  {
    filename: 'packages/gallery/app/components/photo/ProgressiveImage.vue',
    binding:
      /<WebGLImageViewer\b[^>]*\s:debug-labels\s*=\s*["']debugLabels["']/,
  },
  {
    filename: 'packages/webgl-image/src/components/WebGLImageViewer.vue',
    binding:
      /<DebugInfoComponent\b[^>]*\s:labels\s*=\s*["']props\.debugLabels["']/,
  },
]) {
  test(`${filename} forwards localized debug labels`, () => {
    const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
    assert.ok(descriptor.template)
    assert.match(descriptor.template.content, binding)
  })
}

test('gallery diagnostics recompute when the active locale changes', async () => {
  const { createI18n } = createRequire(
    new URL('../packages/gallery/package.json', import.meta.url),
  )('vue-i18n')
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: false,
    messages,
  })
  const gallery = readFileSync(
    'packages/gallery/app/components/photo/ProgressiveImage.vue',
    'utf8',
  )
  const start = gallery.indexOf('const debugLabels =')
  const end = gallery.indexOf('const containerRef =', start)
  assert.ok(start >= 0 && end > start)
  const code = ts.transpileModule(
    gallery.slice(start, end) + '\nglobalThis.labels = debugLabels',
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText
  const context = {
    computed: vue.computed,
    $t: i18n.global.t,
    labels: undefined as vue.ComputedRef | undefined,
  }
  vm.runInNewContext(code, context)
  assert.ok(context.labels)
  const image = vue.reactive({ ...debugInfo })
  for (const locale of [...locales, 'en']) {
    i18n.global.locale.value = locale
    await vue.nextTick()
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.labels.value)),
      messages[locale].debug.viewer.diagnostics,
    )
    assert.ok(exports.default)
    const html = await renderToString(
      vue.createSSRApp(exports.default, {
        debugInfo: image,
        labels: context.labels.value,
      }),
    )
    assert.ok(html.includes(messages[locale].debug.viewer.diagnostics.zoomInfo))
  }
})

test('standalone defaults match every Simplified Chinese catalogue key', () => {
  assert.deepEqual(
    DEFAULT_DEBUG_LABELS,
    messages['zh-Hans'].debug.viewer.diagnostics,
  )
})

test('standalone debug panel preserves its default labels', async () => {
  assert.ok(exports.default)
  const html = await renderToString(
    vue.createSSRApp(exports.default, { debugInfo }),
  )
  assert.ok(html.includes('缩放信息'))
  assert.ok(html.includes('加载完成'))
})

test('each diagnostic field renders its own label even when translations share text', async () => {
  let index = 0
  const labels = JSON.parse(
    JSON.stringify(DEFAULT_DEBUG_LABELS, (_key, value) =>
      typeof value === 'string' ? `__label_${index++}__` : value,
    ),
  )
  assert.ok(exports.default)
  const html = await renderToString(
    vue.createSSRApp(exports.default, { debugInfo, labels }),
  )
  for (const [key, marker] of Object.entries(flattenLabels(labels))) {
    if (key.startsWith('loadingStates.') && key !== 'loadingStates.complete')
      continue
    if (key.startsWith('qualities.') && key !== 'qualities.high') continue
    assert.equal(
      html.split(marker).length - 1,
      key === 'no' ? 2 : 1,
      `unexpected label occurrence count: ${key}`,
    )
  }
})

test('unknown runtime loading states and quality values remain visible', async () => {
  assert.ok(exports.default)
  const html = await renderToString(
    vue.createSSRApp(exports.default, {
      debugInfo: {
        ...debugInfo,
        loadingState: 'future-loading-state',
        currentQuality: 'future-quality',
      },
    }),
  )
  assert.ok(html.includes('future-loading-state'))
  assert.ok(html.includes('future-quality'))
})

test('standalone defaults and nested records are immutable', () => {
  assert.ok(Object.isFrozen(DEFAULT_DEBUG_LABELS))
  assert.ok(Object.isFrozen(DEFAULT_DEBUG_LABELS.loadingStates))
  assert.ok(Object.isFrozen(DEFAULT_DEBUG_LABELS.qualities))
})

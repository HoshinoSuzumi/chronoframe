import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { parse, compileScript } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'
import * as vue from 'vue'
import ts from 'typescript'
import { resolveShareThumbnail } from '../packages/gallery/app/utils/open-graph.ts'

type Edition = 'self-hosted' | 'cloud' | 'site'

async function render(
  template: 'Photo' | 'Home',
  edition: Edition,
  props: Record<string, unknown>,
) {
  const filename = `packages/gallery/app/components/OgImage/${template}.takumi.vue`
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename })
  const source = compileScript(descriptor, {
    id: 'og-thumbnail',
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
    computed: vue.computed,
    useEntryCapabilities: () => ({ edition }),
    useNuxtApp: () => ({ $i18n: { t: (key: string) => key } }),
    useLocationLabel: () => () => '',
    getSetting: () => '',
    require: (name: string) => {
      if (name === 'vue') return vue
      if (name === '#gallery/utils/open-graph') return { resolveShareThumbnail }
      if (name === '#gallery/utils/camera')
        return { formatCameraInfo: () => '' }
      if (name === '#build/nuxt-icon-client-bundle') return { init: () => {} }
      if (name === '@iconify/vue')
        return { Icon: () => vue.h('span'), addIcon: () => {} }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  assert.ok(exports.default)
  return renderToString(vue.createSSRApp(exports.default, props))
}

for (const edition of ['site', 'cloud', 'self-hosted'] as const) {
  test(`${edition}: photo OG renders the thumbnail and gradient without internal storage keys`, async () => {
    const thumbnailUrl =
      edition === 'self-hosted'
        ? '/storage/thumbnail.webp'
        : '/api/media/photo-id/thumbnail'
    const html = await render('Photo', edition, {
      photo: { id: 'photo-id', title: 'Example', thumbnailUrl },
      appTitle: 'Gallery',
    })
    const expected =
      edition === 'self-hosted'
        ? '/thumb/%2Fstorage%2Fthumbnail.webp'
        : thumbnailUrl
    assert.ok(html.includes(`src="${expected}"`))
    assert.ok(html.includes('og-photo__gradient'))
    assert.ok(html.includes('Example'))
  })

  test(`${edition}: home OG uses the same entry media route`, async () => {
    const url = '/api/media/photo-id/thumbnail'
    const html = await render('Home', edition, { thumbnails: [url] })
    assert.ok(html.includes(`src="${resolveShareThumbnail(url, edition)}"`))
  })
}

test('photo OG without a thumbnail keeps its text fallback', async () => {
  const html = await render('Photo', 'site', {
    photo: { id: 'missing', title: 'No thumbnail', thumbnailUrl: null },
  })
  assert.ok(html.includes('No thumbnail'))
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('og-photo__gradient'))
})

test('self-hosted external and protected thumbnails keep using the authorized JPEG proxy', () => {
  for (const url of [
    'https://media.example/photo.webp',
    '/image/__photo__/protected/thumbnail',
  ]) {
    assert.equal(
      resolveShareThumbnail(url, 'self-hosted'),
      `/thumb/${encodeURIComponent(url)}`,
    )
  }
  assert.equal(resolveShareThumbnail(undefined, 'site'), undefined)
})

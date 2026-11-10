import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { parse, compileScript } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'
import * as vue from 'vue'
import ts from 'typescript'
import { resolveShareThumbnail } from '../packages/gallery/app/utils/open-graph.ts'

const { createI18n } = createRequire(
  new URL('../packages/gallery/package.json', import.meta.url),
)('vue-i18n')

type Edition = 'self-hosted' | 'cloud' | 'site'

async function render(
  template: 'Photo' | 'Home',
  edition: Edition,
  props: Record<string, unknown>,
  i18n = {
    t: (key: string, ..._args: unknown[]) => key,
    loadLocaleMessages: async (_locale: string) => {},
  },
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
    useNuxtApp: () => ({ $i18n: i18n }),
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

  test(`${edition}: home OG without avatar or thumbnails uses the default avatar and no empty frames`, async () => {
    const html = await render('Home', edition, {
      appTitle: 'Empty Gallery 摄影',
      avatarUrl: '',
      thumbnails: [],
    })
    assert.ok(html.includes('src="/web-app-manifest-512x512.png"'))
    assert.ok(html.includes('Empty Gallery 摄影'))
    assert.ok(!html.includes('og-home__gallery'))
    assert.ok(!html.includes('src=""'))
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

for (const [locale, labels] of [
  ['en', ['no photos', 'one photo', '2 photos']],
  ['zh-Hans', ['没有照片', '一张照片', '2 张照片']],
] as const) {
  test(`Site Home uses signed ${locale} for live count despite the visitor locale`, async () => {
    const visitorLocale = locale === 'en' ? 'zh-Hans' : 'en'
    const messages = (code: string) =>
      JSON.parse(
        readFileSync(`packages/gallery/i18n/locales/${code}.json`, 'utf8'),
      )
    const composer = createI18n({
      legacy: false,
      locale: visitorLocale,
      messages: { [visitorLocale]: messages(visitorLocale) },
    }).global
    const loaded: string[] = []
    const i18n = {
      t: composer.t,
      loadLocaleMessages: async (code: string) => {
        loaded.push(code)
        composer.setLocaleMessage(code, messages(code))
      },
    }
    for (const [count, label] of labels.entries()) {
      const html = await render(
        'Home',
        'site',
        { locale, photoCount: count },
        i18n,
      )
      assert.ok(
        html.includes(label),
        `live count ${count} must use signed locale ${locale}`,
      )
    }
    assert.deepEqual(loaded, [locale, locale, locale])
    assert.equal(composer.locale.value, visitorLocale)
  })
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { createHead } from '@unhead/vue/client'
import { useHead, useSeoMeta } from '@unhead/vue'
import { renderSSRHead } from '@unhead/vue/server'
import {
  cleanShareText,
  resolveShareAvatar,
} from '../packages/gallery/app/utils/open-graph.ts'
import { defaultLocationFallback } from '../packages/gallery/shared/utils/location.ts'
import { imageUrl } from './helpers/seo.ts'

// Compile the installed OG modules with Nuxt's client flags in the same realm as
// Vue/Unhead. Only Nuxt adapters and generated virtual modules are supplied here.
function loadClientOgImage(adapters: Record<string, unknown>) {
  const runtime = resolve(
    dirname(fileURLToPath(import.meta.resolve('nuxt-og-image'))),
    'runtime',
  )
  const modules = new Map<string, { exports: Record<string, unknown> }>()
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file)
    if (cached) return cached.exports
    const module = { exports: {} }
    modules.set(file, module)
    const source = ts.transpileModule(
      readFileSync(file, 'utf8').replace(
        /import\.meta\.(client|server|dev|prerender)/g,
        (_, flag) => String(flag === 'client'),
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    vm.compileFunction(source, ['exports', 'require', 'module'])(
      module.exports,
      (name: string) =>
        name in adapters
          ? adapters[name]
          : name.startsWith('.')
            ? load(resolve(dirname(file), name))
            : createRequire(file)(name),
      module,
    )
    return module.exports
  }
  return load(resolve(runtime, 'app/composables/defineOgImage.js'))
    .defineOgImage as (
    component: string,
    props: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => unknown
}

test('route changes update a single canonical/social head and register the current OG props', () =>
  checkNavigation(false))

test('route changes update one current OG image using the real defineOgImage client module', () =>
  checkNavigation(true))

for (const edition of ['cloud', 'self-hosted'] as const) {
  test(`${edition}: shared OG registration does not acquire a Site binding`, () =>
    checkNavigation(false, edition))
}

// Exercise the real Gallery composable, Vue watchers and Unhead client reactivity
// with both a props recorder and the installed OG client. Nuxt route/fetch/lifecycle
// adapters remain fixtures; this does not claim browser-router or DOM coverage.
async function checkNavigation(
  realOgImage: boolean,
  edition: 'site' | 'cloud' | 'self-hosted' = 'site',
) {
  const route = reactive({ path: '/', params: {} as { slug?: string } })
  const homeView = ref('photos')
  const entryContext = ref({
    siteId: 1,
    capabilities: { edition },
    canonicalOrigin: 'https://gallery.example.test',
  })
  const head = createHead()
  assert.equal(head.ssr, false)
  const scope = effectScope()
  const settings = {
    'app:title': ref('Gallery 摄影'),
    'app:slogan': ref('Photography stories'),
    'app:author': ref('Fixture'),
    'app:avatarUrl': ref(''),
    'location:preferredLevel': ref('city'),
    'location:fallbackOrder': ref(defaultLocationFallback),
  }
  const photo = {
    id: 'public-photo',
    title: 'Mountain 山',
    description: 'Photo description',
    thumbnailUrl: '/fixture.png',
  }
  const images: { component: string; props: Record<string, unknown> }[] = []
  const defineOgImage = realOgImage
    ? loadClientOgImage({
        'nuxt/app': {
          useNuxtApp: () => ({ isHydrating: false }),
          useRoute: () => route,
          useRuntimeConfig: () => ({
            app: { baseURL: '/' },
            public: { 'nuxt-og-image': {} },
          }),
          injectHead: () => head,
          useHead: (input: Parameters<typeof useHead>[0]) =>
            useHead(input, { head }),
        },
        '#build/nuxt-og-image/client-config.mjs': { hasServerRuntime: true },
        '#build/nuxt-og-image/components.mjs': { componentNames: [] },
        '#site-config/app': {
          createSitePathResolver: () => (path: string) =>
            new URL(path, 'https://gallery.example.test').href,
        },
      })
    : (component: string, props: Record<string, unknown>) =>
        images.push({ component, props })
  let mounted: (() => void) | undefined
  const exports: {
    useInstanceOpenGraph?: (
      photos: ComputedRef<(typeof photo)[]>,
    ) => Promise<void>
  } = {}
  const source = ts.transpileModule(
    readFileSync(
      'packages/gallery/app/composables/useInstanceOpenGraph.ts',
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const context = {
    URL,
    exports,
    computed,
    watch,
    cleanShareText,
    resolveShareAvatar,
    require: (name: string) => {
      assert.equal(name, '@chronoframe/gallery/shared/utils/location')
      return { defaultLocationFallback }
    },
    useRoute: () => route,
    useNuxtApp: () => ({ runWithContext: (run: () => void) => run() }),
    useRequestURL: () => new URL('https://internal.example.test/'),
    useEntryContext: () => entryContext,
    useUserSession: () => ({ loggedIn: ref(false) }),
    useSettingRef: (key: keyof typeof settings) => settings[key],
    useHomeView: () => ({ homeView }),
    useI18n: () => {
      throw new Error('No i18n in this focused fixture')
    },
    useGalleryFetch: () =>
      Object.assign(Promise.resolve(), {
        data: ref(null),
        execute: async () => {},
      }),
    useHead: (input: Parameters<typeof useHead>[0]) => useHead(input, { head }),
    useSeoMeta: (input: Parameters<typeof useSeoMeta>[0]) =>
      useSeoMeta(input, { head }),
    defineOgImage,
    onMounted: (run: () => void) => {
      mounted = run
    },
  }
  // Unhead's plain-object traversal requires inputs from the same JS realm.
  vm.compileFunction(source, Object.keys(context))(...Object.values(context))
  assert.ok(exports.useInstanceOpenGraph)
  try {
    await scope.run(() =>
      exports.useInstanceOpenGraph!(computed(() => [photo])),
    )
    assert.ok(mounted)
    mounted()
    for (const [path, slug, canonical, title, component] of [
      ['/', undefined, '/', 'Gallery 摄影', 'Home'],
      [
        '/public-photo',
        'public-photo',
        '/public-photo',
        'Mountain 山',
        'Photo',
      ],
      ['/albums', undefined, '/albums', 'Gallery 摄影', 'Home'],
      ['/photos', undefined, '/', 'Gallery 摄影', 'Home'],
    ] as const) {
      route.path = path
      route.params = slug ? { slug } : {}
      await nextTick()
      const { headTags } = await renderSSRHead(head)
      assert.equal((headTags.match(/rel="canonical"/g) || []).length, 1, path)
      assert.ok(
        headTags.includes(
          `rel="canonical" href="https://gallery.example.test${canonical}"`,
        ),
        `${path}: ${headTags}`,
      )
      assert.equal((headTags.match(/property="og:url"/g) || []).length, 1, path)
      assert.ok(
        headTags.includes(
          `property="og:url" content="https://gallery.example.test${canonical}"`,
        ),
        path,
      )
      assert.ok(
        headTags.includes(`property="og:title" content="${title}"`),
        path,
      )
      assert.ok(
        headTags.includes(
          `property="og:type" content="${slug ? 'article' : 'website'}"`,
        ),
        path,
      )
      if (realOgImage) {
        assert.equal(
          (headTags.match(/property="og:image"/g) || []).length,
          1,
          path,
        )
        assert.equal(
          imageUrl(headTags),
          `https://gallery.example.test/_og/r${path === '/' ? '' : path}.png`,
          path,
        )
        assert.equal(
          (headTags.match(/name="twitter:image"/g) || []).length,
          1,
          path,
        )
        assert.ok(
          headTags.includes(
            `name="twitter:image" content="${imageUrl(headTags)}"`,
          ),
          path,
        )
      } else {
        const image = images.at(-1)!
        assert.equal(image.component, component, path)
        assert.equal(
          image.props.originSiteId,
          edition === 'site' ? 1 : undefined,
          path,
        )
        if (slug) assert.equal((image.props.photo as typeof photo).id, slug)
        else assert.equal(image.props.appTitle, 'Gallery 摄影')
      }
    }
    homeView.value = 'albums'
    route.path = '/albums'
    await nextTick()
    const { headTags } = await renderSSRHead(head)
    assert.equal((headTags.match(/rel="canonical"/g) || []).length, 1)
    assert.ok(
      headTags.includes('rel="canonical" href="https://gallery.example.test/"'),
    )
    if (!realOgImage && edition === 'site') {
      const previous = images.at(-1)!
      const registrations = images.length
      entryContext.value.siteId = 2
      await nextTick()
      assert.equal(
        images.length,
        registrations + 1,
        'changing siteId alone must trigger OG registration',
      )
      assert.deepEqual(images.at(-1), {
        ...previous,
        props: { ...previous.props, originSiteId: 2 },
      })
    }
  } finally {
    scope.stop()
  }
}

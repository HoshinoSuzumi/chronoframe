import { SOCIAL_LINK_ICONS } from '../packages/contracts/src/social-links'
import type { NuxtConfig } from 'nuxt/schema'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dayjsLocales } from '../packages/gallery/i18n/i18n.options'

const require = createRequire(import.meta.url)
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'))
// Fully bundled Workers must use Nuxt's Unhead version, not the legacy root v2.
const unheadAliases = Object.fromEntries(
  [
    '/stream/server',
    '/stream/client',
    '/stream/iife',
    '/stream/vite',
    '/components',
    '/plugins',
    '/legacy',
    '/server',
    '/client',
    '/utils',
    '/types',
    '/scripts',
    '/bundler',
    '/vite',
    '',
  ].map((subpath) => {
    const name = '@unhead/vue' + subpath
    return [name, nuxtRequire.resolve(name)]
  }),
)

/** UI dependencies only; no Self-hosted server or runtime configuration is inherited. */
export const sharedUi = {
  alias: unheadAliases,
  dir: { shared: '../../packages/gallery/shared' },
  compatibilityDate: '2025-07-15' as const,
  devtools: { enabled: false },
  modules: [
    'reka-ui/nuxt',
    '@nuxt/ui',
    '@pinia/nuxt',
    'motion-v/nuxt',
    'nuxt-auth-utils',
    '@vueuse/nuxt',
    'dayjs-nuxt',
    '@nuxtjs/i18n',
    'nuxt-mapbox',
    'nuxt-maplibre',
    'nuxt-og-image',
    'nuxt-gtag',
  ],
  // Enable dynamic OG only after selecting a Worker-compatible WASM/remote renderer.
  ogImage: { enabled: false },
  ui: { fonts: false },
  icon: {
    clientBundle: {
      icons: SOCIAL_LINK_ICONS,
      scan: {
        globInclude: [
          fileURLToPath(
            new URL('../packages/gallery/app/**/*.{vue,ts}', import.meta.url),
          ),
          fileURLToPath(
            new URL('../packages/console/app/**/*.{vue,ts}', import.meta.url),
          ),
          fileURLToPath(new URL('./cloud/app/**/*.{vue,ts}', import.meta.url)),
        ],
      },
    },
  },
  // Keep shared gallery event helpers available without injecting tracking scripts.
  gtag: { enabled: false },
  components: ['~/components'],
  runtimeConfig: {
    public: {
      console: {
        apiBase: '',
        signInPath: '/signin',
        galleryPath: '/',
        navigation: [] as unknown[],
      },
      mapbox: { accessToken: '' },
      app: { title: 'ChronoFrame', slogan: '', author: '', avatarUrl: '' },
      map: {
        provider: 'maplibre',
        mapbox: { style: '' },
        maplibre: { token: '', style: '' },
      },
    },
  },
  nitro: {
    preset: 'cloudflare-module',
    alias: unheadAliases,
    cloudflare: { deployConfig: true, nodeCompat: true },
  },
  dayjs: {
    locales: dayjsLocales,
    plugins: [
      'relativeTime',
      'utc',
      'timezone',
      'duration',
      'localizedFormat',
      'isBetween',
    ],
  },
  vite: {
    ssr: { noExternal: ['@indoorequal/vue-maplibre-gl'] },
    css: { devSourcemap: false },
    build: { sourcemap: false },
  },
} satisfies NuxtConfig

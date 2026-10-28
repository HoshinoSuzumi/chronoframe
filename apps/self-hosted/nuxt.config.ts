import { galleryFontFamilies } from '../../packages/gallery/fonts'
import { SELF_HOSTED_CAPABILITIES } from '../../packages/contracts/src/entry'
import pkg from '../../package.json'
import type { AnalyticsConfig } from '../../packages/gallery/shared/types/config'
import { dayjsLocales } from '../../packages/gallery/i18n/i18n.options'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['../../packages/console', '../../packages/gallery'],
  dir: { shared: '../../packages/gallery/shared' },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    'reka-ui/nuxt',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/test-utils',
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

  components: ['~/components'],

  runtimeConfig: {
    public: {
      capabilities: SELF_HOSTED_CAPABILITIES,
      console: {
        apiBase: '',
        signInPath: '/signin',
        galleryPath: '/',
        navigation: [] as unknown[],
      },
      VERSION: pkg.version,
      mapbox: {
        accessToken: '',
      },
      app: {
        title: 'ChronoFrame',
        slogan: '',
        author: '',
        avatarUrl: '',
      },
      map: {
        provider: 'maplibre' as 'mapbox' | 'maplibre',
        mapbox: {
          style: '',
        },
        maplibre: {
          token: '',
          style: '',
        },
      },
      analytics: {
        matomo: {
          enabled: false,
          url: '',
          siteId: '',
        },
      } satisfies AnalyticsConfig,
      oauth: {
        github: {
          enabled: false,
        },
      },
    },
    mapbox: {
      accessToken: '',
    },
    nominatim: {
      baseUrl: 'https://nominatim.openstreetmap.org',
    },
    STORAGE_PROVIDER: 's3' satisfies 's3' | 'local' | 'openlist',
    provider: {
      s3: {
        endpoint: '',
        bucket: '',
        region: 'auto',
        accessKeyId: '',
        secretAccessKey: '',
        prefix: '',
        cdnUrl: '',
        forcePathStyle: false,
      },
      local: {
        localPath: './data/storage',
        baseUrl: '/storage',
        prefix: 'photos/',
      },
      openlist: {
        baseUrl: '',
        rootPath: '',
        token: '',
        endpoints: {
          upload: '/api/fs/put',
          download: '',
          list: '',
          delete: '/api/fs/remove',
          meta: '/api/fs/get',
        },
        pathField: 'path',
        cdnUrl: '',
      } as {
        baseUrl: string
        rootPath: string
        token: string
        endpoints: {
          upload: string
          download: string
          list: string
          delete: string
          meta: string
        }
        pathField: string
        cdnUrl: string
      },
    },
    upload: {
      mime: {
        whitelistEnabled: true,
        whitelist:
          'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/heic,image/heif,video/quicktime,video/mp4',
      },
      duplicateCheck: {
        enabled: true,
        mode: 'skip' as 'warn' | 'block' | 'skip',
      },
    },
    /** @deprecated Defaults to allow insecure cookies now */
    allowInsecureCookie: false,
  },

  nitro: {
    preset: 'node_server',
    experimental: {
      websocket: true,
      tasks: true,
    },
  },

  vite: {
    optimizeDeps: {
      include: [
        '@indoorequal/vue-maplibre-gl',
        '@yeger/vue-masonry-wall',
        'dayjs', // CJS
        'dayjs/locale/en', // CJS
        'dayjs/locale/ja', // CJS
        'dayjs/locale/ru', // CJS
        'dayjs/locale/zh-cn', // CJS
        'dayjs/locale/zh-hk', // CJS
        'dayjs/locale/zh-tw', // CJS
        'dayjs/plugin/duration', // CJS
        'dayjs/plugin/isBetween', // CJS
        'dayjs/plugin/localizedFormat', // CJS
        'dayjs/plugin/relativeTime', // CJS
        'dayjs/plugin/timezone', // CJS
        'dayjs/plugin/updateLocale', // CJS
        'dayjs/plugin/utc', // CJS
        'driver.js',
        'es-toolkit',
        'file-type',
        'mapbox-gl', // CJS
        'maplibre-gl',
        'motion-v',
        'reka-ui',
        'swiper/modules',
        'swiper/vue',
        'tailwind-merge',
        'thumbhash',
        'tippy.js',
        'zod',
      ],
    },
    ssr: {
      noExternal: ['@indoorequal/vue-maplibre-gl'],
    },
    css: {
      devSourcemap: false,
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        // Nitro resolves shared source imports before emitting the runtime bundle.
        // Keep their absolute identities instead of deriving paths from SSR chunks.
        makeAbsoluteExternalsRelative: false,
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return
            }

            if (
              id.includes('/mapbox-gl/') ||
              id.includes('/maplibre-gl/') ||
              id.includes('/@indoorequal/vue-maplibre-gl/') ||
              id.includes('/nuxt-mapbox/') ||
              id.includes('/nuxt-maplibre/')
            ) {
              return 'vendor-map'
            }
          },
        },
      },
      commonjsOptions: {
        include: [/maplibre-gl/, /node_modules/],
        transformMixedEsModules: true,
      },
    },
    plugins: [
      // Prebundle safe-stable-stringify for the Vite client. vite-plugin-vue-devtools@9.0.0-rc.2
      // (via @nuxt/devtools@4.0.0-beta.7) dynamically imports @vue/devtools-agent/devframe,
      // whose ESM wrapper default-imports that package's CommonJS build.
      // Remove this plugin and the direct devDependency on the next @nuxt/devtools bump
      // if a cold dev session no longer logs "[vue-devtools] Failed to register agent tools"
      // for safe-stable-stringify.
      {
        name: 'vite-optimize-vue-devtools-agent',
        apply: 'serve',
        configEnvironment(name, config) {
          if (name !== 'client') return
          config.optimizeDeps ??= {}
          config.optimizeDeps.include ??= []
          config.optimizeDeps.include.push('safe-stable-stringify')
        },
      },
      {
        apply: 'build',
        name: 'vite-plugin-ignore-sourcemap-warnings',
        configResolved(config) {
          const originalOnWarn = config.build.rollupOptions.onwarn
          config.build.rollupOptions.onwarn = (warning, warn) => {
            if (
              warning.code === 'SOURCEMAP_BROKEN' &&
              warning.plugin === '@tailwindcss/vite:generate:build'
            ) {
              return
            }

            if (originalOnWarn) {
              originalOnWarn(warning, warn)
            } else {
              warn(warning)
            }
          }
        },
      },
    ],
  },

  gtag: {
    enabled: process.env.NODE_ENV === 'production',
  },

  colorMode: {
    // preference: process.env.NUXT_PUBLIC_COLOR_MODE_PREFERENCE || 'dark',
    storageKey: 'cframe-color-mode',
  },

  icon: {
    clientBundle: {
      scan: true,
    },
  },

  fonts: {
    families: galleryFontFamilies,
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
    defaultTimezone: 'Asia/Shanghai',
  },
})

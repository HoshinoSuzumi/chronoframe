import pkg from './package.json'
import type { AnalyticsConfig } from './shared/types/config'
import i18n, { dayjsLocales } from './i18n/i18n.options'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
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

  css: ['~/assets/css/tailwind.css'],

  components: [{ path: '~/components/ui', pathPrefix: false }, '~/components'],

  runtimeConfig: {
    public: {
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
    families: [
      { name: 'Rubik', weights: [400, 500, 600, 700], global: true },
      { name: 'Noto Sans SC', weights: [400, 500, 600, 700], global: true },
    ],
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

  i18n,
})

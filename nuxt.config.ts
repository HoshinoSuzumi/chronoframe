import pkg from './package.json'
import tailwindcss from '@tailwindcss/vite'
import type { AnalyticsConfig } from './shared/types/config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  modules: [
    'reka-ui/nuxt',
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
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
          style: ''
        },
        maplibre: {
          token: '',
          style: '',
        }
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
        region: '',
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
        baseUrl: string;
        rootPath: string;
        token: string;
        endpoints: {
          upload: string;
          download: string;
          list: string;
          delete: string;
          meta: string;
        };
        pathField: string;
        cdnUrl: string;
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
    plugins: [tailwindcss() as any],
    optimizeDeps: {
      include: [
        'zod',
        'dayjs',
        'dayjs/plugin/updateLocale',
        'dayjs/locale/zh-cn',
        'dayjs/locale/zh-hk',
        'dayjs/locale/zh-tw',
        'dayjs/locale/en',
        'dayjs/plugin/relativeTime',
        'dayjs/plugin/utc',
        'dayjs/plugin/timezone',
        'dayjs/plugin/duration',
        'dayjs/plugin/localizedFormat',
        'dayjs/plugin/isBetween',
        '@yeger/vue-masonry-wall',
        'motion-v',
        'swiper/vue',
        'swiper/modules',
        'tailwind-merge',
        'thumbhash',
        'mapbox-gl',
        'maplibre-gl',
        '@indoorequal/vue-maplibre-gl',
        'file-type',
        'reka-ui',
        'es-toolkit',
        'tippy.js',
      ],
    },
    ssr: {
      noExternal: ['@indoorequal/vue-maplibre-gl'],
    },
    css: {
      devSourcemap: true,
    },
    build: {
      sourcemap: false,
      commonjsOptions: {
        include: [/maplibre-gl/, /node_modules/],
        transformMixedEsModules: true,
      },
    },
  },

  gtag: {
    enabled: process.env.NODE_ENV === 'production',
  },

  colorMode: {
    preference: process.env.NUXT_PUBLIC_COLOR_MODE_PREFERENCE || 'dark',
    storageKey: 'cframe-color-mode',
  },

  icon: {
    clientBundle: {
      scan: true,
    },
  },

  ogImage: {
    fonts: ['Rubik:400', 'Rubik:700', 'Noto+Sans+SC:400', 'Noto+Sans+SC:700'],
  },

  dayjs: {
    locales: ['zh-cn', 'zh-hk', 'en'],
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

  i18n: {
    experimental: {
      localeDetector: 'localeDetector.ts',
    },
    detectBrowserLanguage: {
      fallbackLocale: 'en',
      useCookie: false,
      cookieKey: 'chronoframe-locale',
    },
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      {
        code: 'zh-Hans',
        name: '简体中文',
        file: 'zh-Hans.json',
        language: 'zh',
      },
      {
        code: 'zh-Hant-TW',
        name: '繁体中文(台湾)',
        file: 'zh-Hant-TW.json',
        language: 'zh-TW',
      },
      {
        code: 'zh-Hant-HK',
        name: '繁体中文(香港)',
        file: 'zh-Hant-HK.json',
        language: 'zh-HK',
      },
      { code: 'en', name: 'English', file: 'en.json', language: 'en' },
      { code: 'ja', name: '日本語', file: 'ja.json', language: 'ja' },
    ],
  },
})

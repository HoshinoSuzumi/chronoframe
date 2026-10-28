import { CLOUD_CAPABILITIES } from '../../packages/contracts/src/entry'
import { sharedUi } from '../nuxt.shared'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
const galleryPages = fileURLToPath(
  new URL('../../packages/gallery/app/pages/', import.meta.url),
)
export default defineNuxtConfig({
  ...sharedUi,
  modules: sharedUi.modules,
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    bundle: { onlyLocales: ['en', 'zh-Hans'] },
    locales: [
      { code: 'en', language: 'en', file: 'en.json' },
      { code: 'zh-Hans', language: 'zh', file: 'zh-Hans.json' },
    ],
    langDir: 'locales',
    vueI18n: 'i18n.config.ts',
    detectBrowserLanguage: {
      useCookie: false,
      redirectOn: 'all',
      fallbackLocale: 'en',
    },
    experimental: { localeDetector: 'localeDetector.ts' },
  },
  devServer: { port: 3001 },
  nitro: {
    ...sharedUi.nitro,
    // WebAuthn certificate validation uses reflection during module initialization.
    moduleSideEffects: ['reflect-metadata'],
    // Telemetry is disabled; omit the library's optional Node environment probes too.
    alias: {
      ...sharedUi.nitro.alias,
      '@better-auth/telemetry': fileURLToPath(
        new URL('./server/utils/account-telemetry.ts', import.meta.url),
      ),
    },
    cloudflare: {
      ...sharedUi.nitro.cloudflare,
      wrangler: { name: 'chronoframe-cloud', compatibility_date: '2026-10-22' },
    },
  },
  extends: [
    '../../packages/saas-ui',
    '../../packages/console',
    '../../packages/gallery',
  ],
  runtimeConfig: {
    ...sharedUi.runtimeConfig,
    public: {
      ...sharedUi.runtimeConfig.public,
      siteBaseDomain: 'chronoframe.art',
      defaultDomainsReady: false,
      capabilities: CLOUD_CAPABILITIES,
    },
    session: { name: 'chronoframe-cloud' },
    platform: {
      portalOrigin: 'https://app.chronoframe.art',
      domainEnabled: false,
      domainRoutingReady: false,
      domainProviderToken: '',
      domainZoneId: '',
      domainCnameTarget: 'cname.chronoframe.art',
      domainSiteWorker: 'chronoframe-site',
      domainResourceLimit: 20,
      secret: '',
      emailFrom: '',
      storageSecret: '',
      s3EndpointHosts: '',
      workerSecret: '',
    },
  },
  css: ['~/assets/cloud.css'],
  hooks: {
    'nitro:config'(config) {
      if (config.dev) {
        const temporary = fileURLToPath(
          new URL('./.wrangler/tmp', import.meta.url),
        )
        if (process.platform === 'win32') {
          mkdirSync(temporary, { recursive: true })
          process.env.TMP = temporary
          process.env.TEMP = temporary
        }
        config.cloudflare ||= {}
        config.cloudflare.dev = {
          configPath: fileURLToPath(
            new URL('./wrangler.local.json', import.meta.url),
          ),
          persistDir: fileURLToPath(
            new URL('./.wrangler/state/v3', import.meta.url),
          ),
        }
        config.runtimeConfig ||= {}
        config.runtimeConfig.cloudLocalMailDirectory = fileURLToPath(
          new URL('./.data', import.meta.url),
        )
        config.plugins ||= []
        config.plugins.push(
          fileURLToPath(
            new URL('../../scripts/cloud-local-runtime.ts', import.meta.url),
          ),
        )
      }
    },
    'pages:extend'(pages) {
      // The portal shares console capabilities, not the public gallery route tree.
      for (let index = pages.length - 1; index >= 0; index--) {
        if (pages[index]?.file?.startsWith(galleryPages)) pages.splice(index, 1)
      }
    },
  },
})

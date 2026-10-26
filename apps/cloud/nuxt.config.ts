import { CLOUD_CAPABILITIES } from '../../packages/contracts/src/entry'
import { sharedUi } from '../nuxt.shared'
import { fileURLToPath } from 'node:url'
const galleryPages = fileURLToPath(
  new URL('../../packages/gallery/app/pages/', import.meta.url),
)
export default defineNuxtConfig({
  ...sharedUi,
  modules: [...sharedUi.modules, 'shadcn-nuxt'],
  shadcn: { prefix: '', componentDir: './app/components/ui' },
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
  extends: ['../../packages/console', '../../packages/gallery'],
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
    'pages:extend'(pages) {
      // The portal shares console capabilities, not the public gallery route tree.
      for (let index = pages.length - 1; index >= 0; index--) {
        if (pages[index]?.file?.startsWith(galleryPages)) pages.splice(index, 1)
      }
    },
  },
})

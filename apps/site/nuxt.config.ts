import { galleryFontFamilies } from '../../packages/gallery/fonts'
import { SITE_CAPABILITIES } from '../../packages/contracts/src/entry'
import { sharedUi } from '../nuxt.shared'
export default defineNuxtConfig({
  ...sharedUi,
  modules: [...sharedUi.modules, '@nuxt/fonts'],
  fonts: { families: galleryFontFamilies },
  devServer: { port: 3002 },
  app: { head: { htmlAttrs: { lang: 'en' } } },
  nitro: {
    ...sharedUi.nitro,
    cloudflare: {
      ...sharedUi.nitro.cloudflare,
      wrangler: { name: 'chronoframe-site', compatibility_date: '2026-10-22' },
    },
  },
  extends: ['../../packages/gallery'],
  runtimeConfig: {
    ...sharedUi.runtimeConfig,
    public: {
      ...sharedUi.runtimeConfig.public,
      siteBaseDomain: 'chronoframe.art',
      defaultDomainsReady: false,
      capabilities: SITE_CAPABILITIES,
    },
    session: { name: 'chronoframe-site' },
    platform: {
      secret: '',
      storageSecret: '',
      s3EndpointHosts: '',
      portalOrigin: 'https://app.chronoframe.art',
    },
  },
})

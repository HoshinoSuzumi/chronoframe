import { sharedUi } from '../nuxt.shared'
export default defineNuxtConfig({
  ...sharedUi,
  devServer: { port: 3002 },
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
    session: { name: 'chronoframe-site' },
  },
})

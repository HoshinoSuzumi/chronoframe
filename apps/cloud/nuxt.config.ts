import { sharedUi } from '../nuxt.shared'
import { fileURLToPath } from 'node:url'
const galleryPages = fileURLToPath(
  new URL('../../packages/gallery/app/pages/', import.meta.url),
)
export default defineNuxtConfig({
  ...sharedUi,
  devServer: { port: 3001 },
  nitro: {
    ...sharedUi.nitro,
    cloudflare: {
      ...sharedUi.nitro.cloudflare,
      wrangler: { name: 'chronoframe-cloud', compatibility_date: '2026-10-22' },
    },
  },
  extends: ['../../packages/console', '../../packages/gallery'],
  runtimeConfig: {
    ...sharedUi.runtimeConfig,
    session: { name: 'chronoframe-cloud' },
    platform: {
      portalOrigin: 'https://app.chronoframe.art',
      secret: '',
      emailFrom: '',
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

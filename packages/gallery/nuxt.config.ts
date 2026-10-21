import { fileURLToPath } from 'node:url'
import i18n from './i18n/i18n.options'
const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const app = resolve('./app/')
export default defineNuxtConfig({
  alias: { '#gallery': app, '#gallery-i18n': resolve('./i18n/') },
  css: [app + 'assets/css/tailwind.css'],
  components: [
    { path: app + 'components/ui', pathPrefix: false },
    { path: app + 'components' },
  ],
  pinia: { storesDirs: [app + 'stores/**'] },
  i18n: {
    ...i18n,
    langDir: 'locales',
    vueI18n: 'i18n.config.ts',
    experimental: {
      ...i18n.experimental,
      localeDetector: 'localeDetector.ts',
    },
  },
  runtimeConfig: { public: { gallery: { apiBase: '' } } },
})

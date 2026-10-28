import { fileURLToPath } from 'node:url'

/** Presentation only. Cloud and Admin extend this layer before feature layers. */
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  ui: { fonts: false },
  colorMode: { preference: 'dark', fallback: 'dark', classSuffix: '' },
  alias: { '#saas-ui': fileURLToPath(new URL('./app/', import.meta.url)) },
  components: [
    {
      path: fileURLToPath(new URL('./app/components', import.meta.url)),
      pathPrefix: false,
    },
  ],
  css: [fileURLToPath(new URL('./app/assets/main.css', import.meta.url))],
})

import { fileURLToPath } from 'node:url'
const app = fileURLToPath(new URL('./app/', import.meta.url))
export default defineNuxtConfig({
  alias: { '#console': app },
  components: [
    { path: app + 'components/ui', pathPrefix: false },
    { path: app + 'components' },
  ],
})

import { defineVitestConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    globals: true,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '@@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})

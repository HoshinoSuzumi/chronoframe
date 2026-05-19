import { defineConfig } from '@playwright/test'

const port = Number(process.env.PORT || 3000)
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 2 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 2 * 60 * 1000,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      CFRAME_ADMIN_NAME: process.env.CFRAME_ADMIN_NAME || 'admin',
      CFRAME_ADMIN_EMAIL:
        process.env.CFRAME_ADMIN_EMAIL || 'admin@example.com',
      CFRAME_ADMIN_PASSWORD:
        process.env.CFRAME_ADMIN_PASSWORD || 'admin123',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})

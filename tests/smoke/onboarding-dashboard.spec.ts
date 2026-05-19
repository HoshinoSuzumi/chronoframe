import { test, expect } from '@playwright/test'

test('first launch onboarding reaches dashboard', async ({ page }) => {
  const adminEmail = process.env.CFRAME_ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.CFRAME_ADMIN_PASSWORD || 'admin123'

  await page.goto('/')
  const startingUrl = page.url()

  if (startingUrl.includes('/onboarding')) {
    await page.locator('[href="/onboarding/admin"]').click()
    await expect(page).toHaveURL(/\/onboarding\/admin$/)
    await expect(page.locator('button[form="admin-form"]')).toBeEnabled()
    await page.locator('button[form="admin-form"]').click()

    await expect(page).toHaveURL(/\/onboarding\/site$/)
    await expect(page.locator('button[form="site-form"]')).toBeEnabled()
    await page.locator('button[form="site-form"]').click()

    await expect(page).toHaveURL(/\/onboarding\/storage$/)
    await expect(page.locator('button[form="storage-form"]')).toBeEnabled()
    await page.locator('button[form="storage-form"]').click()

    await expect(page).toHaveURL(/\/onboarding\/map$/)
    await page.locator('input[placeholder="pk.xxxxxx"]').fill('smoke-token')
    await expect(page.locator('button[form="map-form"]')).toBeEnabled()
    await page.locator('button[form="map-form"]').click()

    await expect(page).toHaveURL(/\/onboarding\/complete$/)
    await expect(page.getByRole('button')).toHaveCount(1)

    const wizardSubmit = page.waitForResponse((res) => {
      return (
        res.request().method() === 'POST' &&
        res.url().includes('/api/wizard/submit')
      )
    })
    await page.getByRole('button').click()
    await expect((await wizardSubmit).ok()).toBeTruthy()
  }

  await page.goto('/dashboard')

  const signInButton = page.getByRole('button', { name: 'Sign In' })
  if (await signInButton.count()) {
    await signInButton.click()
    await expect(page).toHaveURL(/\/signin/)
  }

  if (page.url().includes('/signin')) {
    await page.locator('input[name="email"]').fill(adminEmail)
    await page.locator('input[name="password"]').fill(adminPassword)
    await page.locator('button[type="submit"]').click()
  }

  const statsResponse = page.waitForResponse((res) => {
    return res.request().method() === 'GET' && res.url().includes('/api/system/stats')
  })
  await expect(page).toHaveURL(/\/dashboard(\/)?$/)
  await expect((await statsResponse).ok()).toBeTruthy()
  await expect(page.locator('a[href="/dashboard/photos"]')).toBeVisible()
})

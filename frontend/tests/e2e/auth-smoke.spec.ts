import { test, expect } from '@playwright/test'

test('unauthenticated dashboard route redirects to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})

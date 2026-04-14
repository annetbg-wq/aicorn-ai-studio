const { test, expect } = require('playwright/test');

test('Projects section opens', async ({ page }) => {
  await page.goto('http://localhost:5183', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.locator('button[title="Projects"]').click();
  await expect(page.locator('text=Projects')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Overview')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Revisions')).toBeVisible({ timeout: 15000 });
});

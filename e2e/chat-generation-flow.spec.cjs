// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL     = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 90_000;

// ── helpers ──────────────────────────────────────────────────────────────────

async function bypassAuth(page) {
  await page.evaluate(() => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function openEngine(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await bypassAuth(page);
  await page.locator('[title="System Engine"]').click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function typeInChat(page, text) {
  const textarea = page.locator('textarea').first();
  await textarea.fill(text);
  await textarea.press('Enter');
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Chat → generation → blueprint → preview', () => {
  test.setTimeout(FLOW_TIMEOUT);

  test('full generation flow — no crash, preview shows content', async ({ page }) => {
    // 1. Open studio
    await openEngine(page);

    // 2. Send prompt — plan card appears immediately, no clarifier step
    await typeInChat(page, 'todo app with supabase');
    await expect(page.locator('[data-testid="generation-plan-card"]')).toBeVisible({ timeout: 60_000 });

    // 3. Confirm the plan
    await page.locator('[data-testid="confirm-plan-btn"]').click();

    // 4. "Building…" confirms blueprint was accepted
    await expect(
      page.locator('text=⚙️ Building…').or(page.locator('text=Building…'))
    ).toBeVisible({ timeout: 10_000 });

    // 5. Wait for preview iframe to contain "Todo"
    const iframeLocator = page.frameLocator('iframe[src*="/preview/"]');
    await expect(async () => {
      const bodyText = await iframeLocator.locator('body').innerText({ timeout: 5_000 });
      expect(bodyText).toMatch(/todo/i);
    }).toPass({ timeout: FLOW_TIMEOUT, intervals: [2_000, 3_000, 5_000] });

    // 6. No crash text
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toMatch(/\bError\b/);
    expect(pageText).not.toContain('insertBefore');
    expect(pageText).not.toContain('Cannot read properties of null');
  });

  // ── Double-click regression ───────────────────────────────────────────────
  test('double-click on confirm does not duplicate dispatch', async ({ page }) => {
    await openEngine(page);
    await typeInChat(page, 'simple counter app');

    await expect(page.locator('[data-testid="generation-plan-card"]')).toBeVisible({ timeout: 60_000 });

    const confirmBtn = page.locator('[data-testid="confirm-plan-btn"]');
    await confirmBtn.waitFor({ state: 'visible', timeout: 30_000 });

    // Double-click — second click must be a no-op (button disappears after first)
    await confirmBtn.dblclick();
    await expect(confirmBtn).toHaveCount(0, { timeout: 5_000 });

    // No crash indicator
    await expect(
      page.locator('text=insertBefore').or(page.locator('text=Cannot read properties'))
    ).toHaveCount(0, { timeout: 5_000 });
  });
});

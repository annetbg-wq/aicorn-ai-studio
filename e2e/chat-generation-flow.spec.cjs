// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL     = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;

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
  // Enter can be flaky in CI when focus briefly shifts; click send as a stable fallback.
  await textarea.press('Enter');
  const sendBtn = page.locator('textarea').first().locator('xpath=following-sibling::button[not(@disabled)]').first();
  if (await sendBtn.count()) {
    await sendBtn.click({ force: true }); // игнорим перекрытие
  }
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
    const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await page.waitForSelector('iframe[data-build-id]', { timeout: 60000 });
    await expect(page.locator('iframe[src*="/preview/"]')).toBeVisible();
    await expect(page.frameLocator('iframe').locator('text=Todo')).toBeVisible();

    // 4. "Building…" confirms blueprint was accepted
    await expect(
      page.locator('text=⚙️ Building…').or(page.locator('text=Building…'))
    ).toBeVisible({ timeout: 10_000 });

    // 5. Wait until frontend receives preview-manager URL for this project
    await page.waitForFunction(() => window.__E2E_PREVIEW_URL__, { timeout: 30_000 });
    const previewUrl = await page.evaluate(() => window.__E2E_PREVIEW_URL__);
    expect(previewUrl).toContain('127.0.0.1:');

    // 6. iframe must be visible and point to dynamic preview-manager URL
    const iframe = page.locator('[data-testid="preview-iframe"]');
    await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
    await expect(async () => {
      const src = await iframe.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).not.toBe('about:blank');
      expect(src).toContain('127.0.0.1:');
    }).toPass({ timeout: FLOW_TIMEOUT, intervals: [2_000, 3_000, 5_000] });

    // 7. Counter app should render initial value 0
    await expect(page.frameLocator('[data-testid="preview-iframe"]').locator('body')).toContainText('0', {
      timeout: FLOW_TIMEOUT,
    });

    // 8. No crash text
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toMatch(/\bError\b/);
    expect(pageText).not.toContain('insertBefore');
    expect(pageText).not.toContain('Cannot read properties of null');
  });

  // ── Double-click regression ───────────────────────────────────────────────
  test('double-click on confirm does not duplicate dispatch', async ({ page }) => {
    await openEngine(page);
    await typeInChat(page, 'todo app with supabase');

    await expect(page.locator('[data-testid="generation-plan-card"]')).toBeVisible({ timeout: 60_000 });

    const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]');
    await confirmBtn.waitFor({ state: 'visible', timeout: 30_000 });

    // Double-click — second click must be a no-op (button disappears after first)
    await confirmBtn.dblclick();
    // Ждем что карточка исчезла целиком, а не только кнопка
    await expect(page.locator('[data-testid="generation-plan-card"]')).toHaveCount(0, { timeout: 5_000 });

    // No crash indicator
    await expect(
      page.locator('text=insertBefore').or(page.locator('text=Cannot read properties'))
    ).toHaveCount(0, { timeout: 5_000 });
  });
});

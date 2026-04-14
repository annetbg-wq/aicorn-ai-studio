// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL    = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Bypass auth gate the same way projects.smoke does —
 * localStorage flag recognised by AuthContext.
 */
async function bypassAuth(page) {
  await page.evaluate(() => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Type text into the chat composer textarea and press Enter.
 */
async function sendChatMessage(page, text) {
  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });
  await textarea.fill(text);
  await textarea.press('Enter');
}

// ── test ─────────────────────────────────────────────────────────────────────

test.describe('Chat → generation → blueprint → preview', () => {
  test.setTimeout(FLOW_TIMEOUT);

  test('full generation flow — no crash, preview shows content', async ({ page }) => {

    // ── 1. Open /studio ───────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await bypassAuth(page);

    // Wait for the chat composer to be ready
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10_000 });

    // ── 2. Send message ───────────────────────────────────────────────────
    await sendChatMessage(page, 'todo app with supabase');

    // ── 3. Wait for generation-plan card ─────────────────────────────────
    // The card is rendered with a spinning indicator while building.
    // We look for the text that appears in the generation-plan header:
    // "Analyzing your idea..." or "Building {appName}..."
    await expect(
      page.locator('text=/Analyzing your idea|Building .+\\.\\.\\./').first()
    ).toBeVisible({ timeout: 30_000 });

    // ── 4. Wait for Blueprint card and click "Build it" ───────────────────
    // onPlanReady fires and appends the blueprint message.
    // The card shows an "Awaiting confirmation" badge and "Build it" button.
    const buildItBtn = page.locator('button', { hasText: 'Build it' });
    await buildItBtn.waitFor({ state: 'visible', timeout: 30_000 });

    // Capture the project id from the URL before clicking
    // (it may be in /studio/:projectId or as a query param)
    const urlBefore = page.url();

    await buildItBtn.click();

    // ── 5. Blueprint card hidden, "Building…" message appears ─────────────
    await expect(
      page.locator('text=⚙️ Building…').or(page.locator('text=Building…'))
    ).toBeVisible({ timeout: 10_000 });

    // ── 6. Wait for preview iframe to load content ────────────────────────
    // The iframe src is /preview/{projectId}.
    // We poll until the iframe's document contains the word "Todo".
    const iframeLocator = page.frameLocator('iframe[src*="/preview/"]');

    await expect(async () => {
      // If the frame isn't attached yet, this throws — retried by expect.poll
      const bodyText = await iframeLocator.locator('body').innerText({ timeout: 5_000 });
      expect(bodyText).toMatch(/todo/i);
    }).toPass({
      timeout:  FLOW_TIMEOUT,
      intervals: [2_000, 3_000, 5_000],
    });

    // ── 7. No error text on the main page ────────────────────────────────
    const pageText = await page.locator('body').innerText();

    expect(pageText).not.toContain('insertBefore');
    expect(pageText).not.toContain('Cannot read properties of null');

    // "Error" banner check — narrow to visible studio chrome, not inside iframe
    const studioError = page
      .locator('[data-testid="chat-error-boundary"], .error-banner')
      .filter({ hasText: /error/i });
    await expect(studioError).toHaveCount(0);
  });

  // ── Double-click regression ──────────────────────────────────────────────
  test('double-click on Build it does not duplicate dispatch', async ({ page }) => {
    test.setTimeout(FLOW_TIMEOUT);

    await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await bypassAuth(page);

    await sendChatMessage(page, 'simple counter app');

    const buildItBtn = page.locator('button', { hasText: 'Build it' });
    await buildItBtn.waitFor({ state: 'visible', timeout: 30_000 });

    // Double-click as fast as Playwright allows
    await buildItBtn.dblclick();

    // After the first click the button disappears (pendingPlan → null).
    // If it disappeared, the second click was a no-op — no duplicate dispatch.
    await expect(buildItBtn).toHaveCount(0, { timeout: 5_000 });

    // No crash indicator
    await expect(
      page.locator('text=insertBefore').or(page.locator('text=Cannot read properties'))
    ).toHaveCount(0, { timeout: 5_000 });
  });
});

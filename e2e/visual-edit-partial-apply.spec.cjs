// @ts-check
/**
 * Real browser chain — primary proof path:
 *   1. Open Studio and mount a deterministic real compiled preview build
 *   2. Enable Select in the real UI (button click → bridge sends visual-select-start)
 *   3. Await __E2E_VISUAL_BRIDGE.waitForSelectReady() — resolves only after the
 *      iframe posts visual-select-ready, proving click-capture is live before we
 *      dispatch the test click (eliminates the postMessage delivery race)
 *   4. Click a real element inside the live preview iframe — goes through the
 *      real browser click path, NOT the __E2E_VISUAL_SELECT injection hook
 *   5. Verify chat textarea is populated from the real postMessage selection event
 *   6. Stage a multi-file diff via secondary hook (__E2E_DIFF_TEST.stageCandidateFiles)
 *      — acceptable setup aid only
 *   7. Apply only a subset through the real DiffPreview UI
 *   8. Verify the promoted result through real browser-visible evidence:
 *      iframe src changes to a new compiled /preview/:buildId and the live iframe
 *      shows the accepted App.tsx marker while still rendering the original
 *      CounterCard.tsx behavior from the rejected file
 *   9. Verify the code-panel reflects the accepted code state (second real
 *      observable independent of the iframe):
 *      — App.tsx editor contains APP_MARKER (accepted change persisted)
 *      — CounterCard.tsx editor has no COMPONENT_MARKER and retains useState
 *        (rejected file original preserved in editor state)
 *
 * Reject-all path (second test):
 *   1. Mount the same real preview build and stage the same deterministic diffs
 *   2. Click "Reject all" in DiffPreview
 *   3. Verify the iframe src stays on the last-good build
 *   4. Verify the live preview still shows and runs the original CounterCard
 *   5. Verify the code-panel still shows the original App.tsx (no APP_MARKER)
 *
 * __E2E_* hooks used here:
 *   __E2E_PREVIEW_TEST.mountPreview        — compile + load a real preview build
 *   __E2E_DIFF_TEST.stageCandidateFiles    — inject candidate diffs (setup only)
 *   __E2E_VISUAL_BRIDGE.waitForSelectReady — synchronisation gate (NOT proof)
 *
 * Primary PASS evidence:
 *   promote path  — real iframe click → real textarea → real partial apply →
 *                   iframe src changes to a new compiled build →
 *                   APP_MARKER visible in the live iframe while the original
 *                   CounterCard button still increments count;
 *                   code panel shows accepted App.tsx (APP_MARKER present) and
 *                   original CounterCard.tsx (COMPONENT_MARKER absent, useState kept)
 *   rollback path — reject-all → iframe src stays on the original build →
 *                   live iframe still shows the original CounterCard and it
 *                   remains interactive (last-good);
 *                   code panel shows original App.tsx (no APP_MARKER present)
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';

// Increased from 120s: the test now includes a second full compile+promote cycle
// (partial apply) on top of the initial mountPreview compile, so 180s gives
// comfortable headroom for both compile cycles even on a cold server.
const FLOW_TIMEOUT = 180_000;

const APP_MARKER       = 'partial-apply-app-marker';
const COMPONENT_MARKER = 'partial-apply-component-marker';
const SELECT_TARGET    = 'counter-trigger';

const PREVIEW_FILES = {
  'src/App.tsx': [
    "import { CounterCard } from './components/CounterCard';",
    '',
    'export default function App() {',
    '  return (',
    '    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>',
    '      <CounterCard />',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/components/CounterCard.tsx': [
    "import { useState } from 'react';",
    '',
    'export function CounterCard() {',
    '  const [count, setCount] = useState(0);',
    '  return (',
    '    <section style={{ display: "grid", gap: 12, textAlign: "center" }}>',
    '      <h1 style={{ margin: 0 }}>Counter</h1>',
    '      <p data-testid="count-value" style={{ margin: 0, fontSize: 32 }}>{count}</p>',
    '      <button',
    `        data-testid="${SELECT_TARGET}"`,
    '        onClick={() => setCount(value => value + 1)}',
    '        style={{ padding: "12px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "#22c55e", color: "#052e16", fontWeight: 700 }}',
    '      >',
    '        Increase',
    '      </button>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
};

const CANDIDATE_FILES = {
  'src/App.tsx': [
    "import { CounterCard } from './components/CounterCard';",
    '',
    'export default function App() {',
    '  return (',
    `    <main data-testid="${APP_MARKER}" style={{ minHeight: "100vh", display: "grid", placeItems: "center", gap: 16, background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>`,
    `      <span>${APP_MARKER}</span>`,
    '      <CounterCard />',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/components/CounterCard.tsx': [
    'export function CounterCard() {',
    `  return <aside data-testid="${COMPONENT_MARKER}">${COMPONENT_MARKER}</aside>;`,
    '}',
    '',
  ].join('\n'),
};

async function bypassAuth(page) {
  await page.evaluate(() => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
}

async function openEngine(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await bypassAuth(page);

  const engineEntry = page.getByText('System Engine', { exact: true }).first();
  const textarea = page.locator('textarea').first();
  await expect(engineEntry.or(textarea)).toBeVisible({ timeout: 60_000 });
  if (await engineEntry.isVisible()) {
    await engineEntry.click();
  }
  await textarea.waitFor({ state: 'visible', timeout: 30_000 });
}

async function waitForE2EHooks(page) {
  await expect(async () => {
    const ok = await page.evaluate(() =>
      typeof window.__E2E_PREVIEW_TEST?.mountPreview === 'function' &&
      typeof window.__E2E_DIFF_TEST?.stageCandidateFiles === 'function' &&
      typeof window.__E2E_VISUAL_BRIDGE?.waitForSelectReady === 'function',
    );
    expect(ok).toBe(true);
  }).toPass({ timeout: 8_000, intervals: [200, 400, 800] });
}

async function readPreviewSrc(page) {
  const iframe = page.locator('[data-testid="preview-iframe"]');
  const src = await iframe.getAttribute('src');
  expect(src).toBeTruthy();
  expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
  return src;
}

async function waitForPreviewSrcChange(page, previousSrc) {
  await expect(async () => {
    const nextSrc = await readPreviewSrc(page);
    expect(nextSrc).not.toBe(previousSrc);
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 3_000] });
  return readPreviewSrc(page);
}

async function expectPreviewSrcToStay(page, expectedSrc, timeout = 5_000) {
  const iframe = page.locator('[data-testid="preview-iframe"]');
  await expect.poll(
    async () => iframe.getAttribute('src'),
    { timeout, intervals: [500, 1_000, 1_500] },
  ).toBe(expectedSrc);
}

async function mountPreviewAndWait(page) {
  await page.evaluate(async (previewFiles) => {
    await window.__E2E_PREVIEW_TEST.mountPreview(previewFiles);
  }, PREVIEW_FILES);

  const iframe = page.locator('[data-testid="preview-iframe"]');
  await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(async () => {
    const src = await iframe.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 3_000] });

  const frame = page.frameLocator('[data-testid="preview-iframe"]');
  await expect(frame.locator(`[data-testid="${SELECT_TARGET}"]`)).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(frame.locator('[data-testid="count-value"]')).toContainText('0', { timeout: 10_000 });
  return readPreviewSrc(page);
}

test.describe('Visual-edit → partial apply → observable promote', () => {
  test.setTimeout(FLOW_TIMEOUT);

  // ── Test 1: Promote path ───────────────────────────────────────────────────
  // Primary proof: real iframe click → input populated → partial apply →
  // iframe src changes to a new compiled build and the live iframe shows the
  // accepted App.tsx change while still rendering the rejected file's original UI.
  test('real iframe selection populates prompt and partial apply promotes only accepted file', async ({ page }) => {
    await openEngine(page);
    await waitForE2EHooks(page);
    const initialPreviewSrc = await mountPreviewAndWait(page);

    // ── Visual selection (real browser click path) ────────────────────────
    const selectBtn = page.locator('[data-testid="visual-select-btn"]');
    await expect(selectBtn).toBeVisible({ timeout: 8_000 });
    await selectBtn.click();
    await expect(selectBtn).toContainText('Selecting', { timeout: 3_000 });

    // ── Primary synchronisation gate ─────────────────────────────────────
    // Bridge sent 'visual-select-start' to the iframe.  Do NOT click inside the
    // iframe until the iframe has posted 'visual-select-ready' back — otherwise
    // the click lands before the capture-phase handler is installed.
    await page.evaluate(() => window.__E2E_VISUAL_BRIDGE.waitForSelectReady());

    // ── Real iframe click — primary PASS evidence for visual-select ───────
    // Genuine browser click dispatched inside the live preview iframe.  Goes
    // through the iframe's capture-phase onClick → window.parent.postMessage →
    // bridge → handleVisualElementSelected → setInput.  No __E2E_VISUAL_SELECT.
    const frame = page.frameLocator('[data-testid="preview-iframe"]');
    await frame.locator(`[data-testid="${SELECT_TARGET}"]`).click();

    // Verify real postMessage path populated the textarea
    const textarea = page.locator('textarea').first();
    await expect(textarea).toHaveValue(/\[Visual Edit\]/, { timeout: 5_000 });
    await expect(textarea).toHaveValue(/data-testid="counter-trigger"/, { timeout: 5_000 });
    await expect(selectBtn).toContainText('Selected', { timeout: 3_000 });
    await expect(page.locator('[data-testid="visual-edit-infobar"]')).toContainText('button', { timeout: 3_000 });

    // ── Stage candidate diffs (secondary hook) ────────────────────────────
    await page.evaluate((candidateFiles) => {
      window.__E2E_DIFF_TEST.stageCandidateFiles(candidateFiles);
    }, CANDIDATE_FILES);

    const diffPanel = page.locator('[data-testid="diff-review-panel"]');
    await expect(diffPanel).toBeVisible({ timeout: 5_000 });
    await expect(diffPanel).toContainText('src/App.tsx');
    await expect(diffPanel).toContainText('src/components/CounterCard.tsx');

    // Deselect CounterCard so only App.tsx is applied
    await page.locator('[data-testid="diff-file-toggle"][data-path="src/components/CounterCard.tsx"]').click();

    const applyBtn = page.locator('[data-testid="diff-apply-btn"]');
    await expect(applyBtn).toContainText('Apply 1', { timeout: 2_000 });
    await applyBtn.click();
    await expect(diffPanel).not.toBeVisible({ timeout: 5_000 });

    // ── Primary promote proof: iframe navigates to a new compiled build ───────
    await waitForPreviewSrcChange(page, initialPreviewSrc);

    // ── Primary promote proof: accepted vs rejected subset is visible in iframe ──
    // App.tsx was accepted, so its marker must be present in the promoted build.
    // CounterCard.tsx was rejected, so the original button/count UI must still
    // render and remain interactive, while COMPONENT_MARKER must stay absent.
    const promotedFrame = page.frameLocator('[data-testid="preview-iframe"]');
    await expect(promotedFrame.locator(`[data-testid="${APP_MARKER}"]`)).toBeVisible({ timeout: 30_000 });
    await expect(promotedFrame.locator(`[data-testid="${COMPONENT_MARKER}"]`)).not.toBeVisible({ timeout: 5_000 });
    await expect(promotedFrame.locator(`[data-testid="${SELECT_TARGET}"]`)).toBeVisible({ timeout: 15_000 });
    await expect(promotedFrame.locator('[data-testid="count-value"]')).toContainText('0', { timeout: 5_000 });
    await promotedFrame.locator(`[data-testid="${SELECT_TARGET}"]`).click();
    await expect(promotedFrame.locator('[data-testid="count-value"]')).toContainText('1', { timeout: 5_000 });

    // ── Secondary: code-panel verifies accepted code state ────────────────
    // Switch to the Code tab and confirm the editor reflects the partial apply.
    // This is a second real observable — "actual code state after promote" —
    // independent of the live iframe compilation check above.
    // App.tsx was accepted: the candidate content (APP_MARKER) must appear.
    // CounterCard.tsx was rejected: the original source (useState, no COMPONENT_MARKER).
    await page.locator('[data-testid="preview-tab-code"]').click();
    await page.locator('[data-testid="code-file-item"][data-path="src/App.tsx"]').click();
    await expect(page.locator('[data-testid="code-editor-textarea"]')).toContainText(APP_MARKER, { timeout: 3_000 });
    await page.locator('[data-testid="code-file-item"][data-path="src/components/CounterCard.tsx"]').click();
    await expect(page.locator('[data-testid="code-editor-textarea"]')).not.toContainText(COMPONENT_MARKER, { timeout: 3_000 });
    await expect(page.locator('[data-testid="code-editor-textarea"]')).toContainText('useState', { timeout: 3_000 });
  });

  // ── Test 2: Reject-all / rollback path ────────────────────────────────────
  // Primary proof: reject-all keeps the iframe on the existing last-good build
  // and the original CounterCard remains visible and interactive.
  test('reject-all preserves last-good preview build', async ({ page }) => {
    await openEngine(page);
    await waitForE2EHooks(page);
    const lastGoodPreviewSrc = await mountPreviewAndWait(page);   // preview shows original CounterCard

    // Stage candidate diffs
    await page.evaluate((candidateFiles) => {
      window.__E2E_DIFF_TEST.stageCandidateFiles(candidateFiles);
    }, CANDIDATE_FILES);

    const diffPanel = page.locator('[data-testid="diff-review-panel"]');
    await expect(diffPanel).toBeVisible({ timeout: 5_000 });
    await expect(diffPanel).toContainText('src/App.tsx');
    await expect(diffPanel).toContainText('src/components/CounterCard.tsx');

    // ── Reject all ────────────────────────────────────────────────────────
    await page.locator('[data-testid="diff-reject-btn"]').click();
    await expect(diffPanel).not.toBeVisible({ timeout: 5_000 });

    // ── Prove preview iframe stayed on the existing last-good build ─────────
    await expectPreviewSrcToStay(page, lastGoodPreviewSrc);

    const lastGoodFrame = page.frameLocator('[data-testid="preview-iframe"]');
    await expect(lastGoodFrame.locator(`[data-testid="${APP_MARKER}"]`)).not.toBeVisible({ timeout: 5_000 });
    await expect(lastGoodFrame.locator(`[data-testid="${COMPONENT_MARKER}"]`)).not.toBeVisible({ timeout: 5_000 });
    await expect(lastGoodFrame.locator(`[data-testid="${SELECT_TARGET}"]`)).toBeVisible({ timeout: 15_000 });
    await expect(lastGoodFrame.locator('[data-testid="count-value"]')).toContainText('0', { timeout: 5_000 });
    await lastGoodFrame.locator(`[data-testid="${SELECT_TARGET}"]`).click();
    await expect(lastGoodFrame.locator('[data-testid="count-value"]')).toContainText('1', { timeout: 5_000 });

    // ── Secondary: code-panel verifies no files were changed on reject ────
    // Reject-all must not update file state.  The editor should show the
    // original PREVIEW_FILES content — no APP_MARKER should appear.
    await page.locator('[data-testid="preview-tab-code"]').click();
    await page.locator('[data-testid="code-file-item"][data-path="src/App.tsx"]').click();
    await expect(page.locator('[data-testid="code-editor-textarea"]')).not.toContainText(APP_MARKER, { timeout: 3_000 });
    await expect(page.locator('[data-testid="code-editor-textarea"]')).not.toContainText(COMPONENT_MARKER, { timeout: 3_000 });
  });
});

// @ts-check
/**
 * P0 regression guard: preview session binding.
 *
 * Verifies that after the P0 security patch:
 *   1. POST /api/preview/:id/compile → 200, success:true
 *   2. GET  /preview/:id?previewSession=<token>  → 200 (legitimate access)
 *   3. GET  /preview/:id (no token)              → 403 (access denied)
 *   4. Preview iframe loads the compiled React app (smoke-root testid visible).
 *
 * E2E seed-path race — not a product bug, fixed only in test infra:
 *   A. previewController.notifyCompiling() sets previewUrl before compile completes
 *      → iframe GETs /preview/:id while build dir doesn't exist yet (race).
 *      Fix: hold the premature document request until fs.existsSync passes,
 *           then redirect to trailing-slash URL (/preview/:id/) so Vite's
 *           `base: './'` relative asset paths resolve correctly.
 *   B. Session-bound builds require ?previewSession= on every sub-resource
 *      (JS/CSS), but HTML-relative asset imports don't carry the token.
 *      Fix: in the route handler, inject ?previewSession= into asset sub-requests
 *           for the same buildId.
 *
 * Phase 1 — HTTP assertions via page.request (bypasses page.route entirely):
 *   Proves the session binding contract. Also primes the shadcn/ui install.
 * Phase 2 — iframe mount via mountPreview() with route handler:
 *   No LLM, no generation pipeline, no API credits spent.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { test, expect } = require('@playwright/test');

const BASE_URL   = process.env.STUDIO_URL || 'http://localhost:5183';
// BUILDS_DIR mirrors backend/preview-manager.ts: path.resolve(__dirname, '..', 'builds')
// where __dirname = backend/. From e2e/ directory: '../builds' = C:\ai_studio\builds.
const BUILDS_DIR = path.resolve(__dirname, '..', 'builds');

// Phase 1 compile: shadcn install attempt (~60–90 s, non-fatal) + vite build (~30 s).
const COMPILE_TIMEOUT_MS   = 150_000;
// Route hold: must exceed compile time so the premature request isn't released early.
const IFRAME_HOLD_TIMEOUT_MS = 150_000;
const IFRAME_POLL_MS         = 500;
// Flow timeout for Playwright assertions after mountPreview resolves.
const FLOW_TIMEOUT_MS        = 70_000;

// Static session token used for Phase 1 HTTP assertions only (not mountPreview's token).
// Length 36 — valid per normalizePreviewSessionToken (16–200 chars).
const HTTP_TEST_SESSION = 'e2e-p0-session-guard-test-token-abc';

// Minimal self-contained React app. No extra deps — must compile cleanly via Vite.
const PREVIEW_FILES = {
  'src/App.tsx': [
    "import { useState } from 'react';",
    '',
    'export default function App() {',
    '  const [count, setCount] = useState(0);',
    '  return (',
    '    <main',
    '      data-testid="smoke-root"',
    '      style={{ minHeight: "100vh", display: "grid", placeItems: "center",',
    '               background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}',
    '    >',
    '      <section style={{ display: "grid", gap: 12, textAlign: "center" }}>',
    '        <h1 style={{ margin: 0 }}>Smoke Preview</h1>',
    '        <p data-testid="count-value" style={{ margin: 0, fontSize: 32 }}>{count}</p>',
    '        <button',
    '          type="button"',
    '          onClick={() => setCount(v => v + 1)}',
    '          style={{ padding: "12px 18px", borderRadius: 10, border: "none",',
    '                   cursor: "pointer", background: "#22c55e", color: "#052e16", fontWeight: 700 }}',
    '        >Increment</button>',
    '      </section>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Poll until window.__E2E_PREVIEW_TEST.mountPreview is available (VITE_PLAYWRIGHT_TEST=1). */
async function waitForPreviewHook(page) {
  await expect(async () => {
    const ready = await page.evaluate(
      () => typeof window.__E2E_PREVIEW_TEST?.mountPreview === 'function',
    );
    expect(ready).toBe(true);
  }).toPass({ timeout: 15_000, intervals: [200, 400, 800] });
}

/** Redact the session token from a URL string (safe error messages). */
function redactSession(url) {
  return url.replace(/(previewSession=)[^&]+/, '$1<redacted>');
}

/** Extract a UUID buildId from a /preview/<uuid>... URL. Returns null if absent. */
function extractBuildId(url) {
  const m = url.match(/\/preview\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

/**
 * Install a narrow page.route handler for /preview/* requests.
 *
 * Fixes two E2E seed-path issues without touching product code:
 *
 * Issue A — premature 404:
 *   previewController.notifyCompiling() triggers syncPreviewState which sets
 *   previewUrl before the vite build completes. The iframe requests /preview/:id
 *   when the build dir doesn't exist yet. This handler polls the filesystem and
 *   holds the request until the dir appears, then issues a 301 to the trailing-
 *   slash form so Vite's `base: './'` relative asset imports resolve correctly.
 *
 * Issue B — session 403 on subrequests:
 *   The session binding (P0) requires ?previewSession= on all GET /preview/:id/*
 *   requests. HTML-relative imports (./assets/xxx.js) don't carry the token.
 *   This handler intercepts those asset requests and appends ?previewSession=<tok>
 *   so canReadPreviewBuild() returns 200 for each file.
 *
 * page.request.get/post (Phase 1) is unaffected — Playwright APIRequestContext
 * bypasses page.route entirely.
 */
async function installPreviewIframeRetry(page) {
  // Session token and buildId captured from the first session-bound document
  // request so subsequent asset sub-requests can reuse them.
  let capturedSession = null;
  let capturedBuildId = null;

  await page.route('**/preview/**', async (route) => {
    const request = route.request();
    const url     = request.url();
    const parsed  = new URL(url);
    const buildId = extractBuildId(url);

    // No UUID buildId (e.g. Phase 1's custom testBuildId) — pass through.
    if (!buildId) { await route.continue(); return; }

    // ── Case A: session-bound document (iframe navigation) ─────────────────
    if (url.includes('previewSession=') && request.resourceType() === 'document') {
      // Capture session token (strip URL-encoding; tokens are hex+hyphen only).
      const m = url.match(/[?&]previewSession=([^&]+)/);
      if (m && !capturedSession) {
        capturedSession = decodeURIComponent(m[1]);
        capturedBuildId = buildId;
      }

      // If path already has a trailing slash, build should be ready — continue.
      if (parsed.pathname.endsWith('/')) {
        await route.continue();
        return;
      }

      // Without trailing slash: hold until the build directory appears, then
      // redirect to the slash form. Vite builds relative paths (base: './') that
      // only resolve correctly when the document URL ends with a slash.
      const buildPath = path.join(BUILDS_DIR, buildId);
      const deadline  = Date.now() + IFRAME_HOLD_TIMEOUT_MS;

      while (Date.now() < deadline) {
        if (fs.existsSync(buildPath)) {
          // Redirect to trailing-slash URL, preserving the session query param.
          const location = parsed.pathname + '/' + parsed.search;
          await route.fulfill({ status: 301, headers: { Location: location } });
          return;
        }
        await new Promise(r => setTimeout(r, IFRAME_POLL_MS));
      }

      // Deadline exceeded: pass through (backend returns 404 or 200).
      await route.continue();
      return;
    }

    // ── Case B: asset sub-request without session token ────────────────────
    // Inject ?previewSession= so canReadPreviewBuild() passes for bound builds.
    if (!url.includes('previewSession=') && capturedSession && buildId === capturedBuildId) {
      parsed.searchParams.set('previewSession', capturedSession);
      await route.continue({ url: parsed.toString() });
      return;
    }

    // Everything else (non-session requests, other routes) — pass through.
    await route.continue();
  });
}

// ── test ──────────────────────────────────────────────────────────────────────

test.describe('Preview session smoke — P0 regression guard', () => {
  // Phase 1 compile ≤150 s + Phase 2 route hold+mount ≤210 s + 30 s buffer.
  test.setTimeout(400_000);

  test(
    'session binding: 200 with token, 403 without, compiled preview iframe loads',
    async ({ page }) => {
      // ── 1. Bootstrap: open studio, clear stale state, set auth bypass ────────
      await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
        localStorage.setItem('OPENROUTER_API_KEY', 'e2e-smoke-key');
      });
      await page.reload({ waitUntil: 'domcontentloaded' });

      // ── 2. Navigate into the Engine view (LeftPanel + PreviewCanvas visible) ─
      await page.locator('[title="System Engine"]').click();
      await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 15_000 });

      // ── 3. Wait for E2E preview hook (VITE_PLAYWRIGHT_TEST=1 gate) ───────────
      await waitForPreviewHook(page);

      // ── Phase 1: HTTP session binding assertions ─────────────────────────────
      //
      // page.request bypasses page.route; the route handler has no effect here.
      // This compile also primes the shadcn/ui install in preview-workspace, so
      // Phase 2 compile runs vite build only (~30 s, no npm install overhead).

      const testBuildId = `e2e-build-${Date.now().toString(36)}-p0smoke`;

      // 4. Compile — bind HTTP_TEST_SESSION and build static output to disk.
      const compileRes = await page.request.post(
        `${BASE_URL}/api/preview/${testBuildId}/compile`,
        {
          headers: { 'X-Preview-Session': HTTP_TEST_SESSION },
          data: { files: PREVIEW_FILES, sessionId: HTTP_TEST_SESSION },
          timeout: COMPILE_TIMEOUT_MS,
        },
      );
      expect(
        compileRes.status(),
        `POST /api/preview/${testBuildId}/compile — expected 200, got ${compileRes.status()}`,
      ).toBe(200);
      const compileBody = await compileRes.json();
      expect(compileBody.success, 'compile must return success:true').toBe(true);

      // 5. GET with session → 200 — P0 regression guard.
      const previewWithSession = `${BASE_URL}/preview/${testBuildId}?previewSession=${HTTP_TEST_SESSION}`;
      const okResponse = await page.request.get(previewWithSession, { timeout: 10_000 });
      expect(
        okResponse.status(),
        `GET ${redactSession(previewWithSession)} — expected 200, got ${okResponse.status()}`,
      ).toBe(200);

      // 6. GET without session → 403 — P0 fix enforcement.
      const previewNoSession = `${BASE_URL}/preview/${testBuildId}`;
      const deniedResponse = await page.request.get(previewNoSession, { timeout: 10_000 });
      expect(
        deniedResponse.status(),
        `GET ${previewNoSession} (no previewSession) — expected 403, got ${deniedResponse.status()}`,
      ).toBe(403);

      // ── Phase 2: iframe mount ────────────────────────────────────────────────
      //
      // Install route handler BEFORE mountPreview so the premature iframe GET is
      // intercepted before the browser sees a 404. The handler:
      //   - Holds the request until the build dir appears (filesystem poll).
      //   - Redirects to /preview/:id/ (trailing slash) for correct asset paths.
      //   - Injects ?previewSession= on JS/CSS sub-requests so canReadPreviewBuild
      //     returns 200 for session-bound builds.

      // 7. Install route handler (Issue A + B fixes).
      await installPreviewIframeRetry(page);

      // 8. Compile and mount deterministic preview — no LLM, no generation.
      //    shadcn is pre-warmed from Phase 1; vite build only (~30 s).
      const mountResult = await page.evaluate(
        async (files) => window.__E2E_PREVIEW_TEST.mountPreview(files),
        PREVIEW_FILES,
      );

      const relativeUrl = mountResult?.url;
      expect(relativeUrl, 'mountPreview must return a url').toBeTruthy();
      expect(relativeUrl, 'url must point to /preview/').toMatch(/\/preview\/[0-9a-f-]+/i);
      expect(relativeUrl, 'url must carry previewSession').toContain('previewSession=');

      // 9. iframe must be visible with the compiled preview URL.
      const iframeLocator = page.locator('[data-testid="preview-iframe"]');
      await expect(iframeLocator).toBeVisible({ timeout: FLOW_TIMEOUT_MS });

      await expect(async () => {
        const src = await iframeLocator.getAttribute('src');
        expect(src, 'iframe src must be set').toBeTruthy();
        expect(src, 'iframe src must not be about:blank').not.toBe('about:blank');
        expect(src, 'iframe src must point to compiled preview').toMatch(/\/preview\/[0-9a-f-]+/i);
        expect(src, 'iframe src must carry previewSession').toContain('previewSession=');
      }).toPass({ timeout: FLOW_TIMEOUT_MS, intervals: [1_000, 2_000, 3_000] });

      // 10. Compiled app content must be visible inside the iframe.
      //     data-testid="smoke-root" is the root element of PREVIEW_FILES/App.tsx.
      await expect(
        page.frameLocator('[data-testid="preview-iframe"]').locator('[data-testid="smoke-root"]'),
      ).toBeVisible({ timeout: FLOW_TIMEOUT_MS });
    },
  );
});

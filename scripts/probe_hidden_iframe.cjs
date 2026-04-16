// Hidden-iframe handshake probe — same-origin compiled-preview path.
//
// LEGACY MODEL (removed): loaded an external PREVIEW_URL (separate preview
// server at localhost:3100), rewrote __build_id.ts via /__write_preview to
// trigger Vite HMR, and waited for a preview-mounted postMessage from that
// external iframe.
//
// CURRENT MODEL (this file): uses the canonical same-origin compiled-preview
// contract:
//   1. POST minimal React files to /api/preview/:buildId/compile (backend build).
//   2. Load the studio page in a headless browser.
//   3. Inject a display:none iframe pointing to /preview/:buildId (same-origin,
//      no external server required) with the same sandbox attrs as production.
//   4. Wait for a `preview-mounted` postMessage from the iframe, matching the
//      expected buildId.
//
// No PREVIEW_URL environment variable is required.
// STUDIO_URL defaults to http://localhost:5183.

const { chromium } = require('playwright');
const { randomUUID } = require('crypto');

const STUDIO_URL         = process.env.STUDIO_URL || 'http://localhost:5183';
const COMPILE_TIMEOUT_MS = 90_000;
const MOUNT_TIMEOUT_MS   = 15_000;

// Sandbox policy — must match the runtime preview iframe in PreviewCanvas.tsx.
const PREVIEW_SANDBOX =
  'allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-downloads';

(async () => {
  const buildId    = randomUUID();
  const compileUrl = `${STUDIO_URL}/api/preview/${buildId}/compile`;
  const previewPath = `/preview/${buildId}`;       // relative same-origin path

  console.log('=== HIDDEN-IFRAME PROBE (same-origin compiled-preview) ===');
  console.log('build_id:     ', buildId);
  console.log('compile_url:  ', compileUrl);
  console.log('preview_path: ', previewPath);

  // ── Step 1: compile ────────────────────────────────────────────────────────
  console.log('\nStep 1: compiling...');
  const compileStart = Date.now();
  let compileBody = null;

  try {
    const res = await fetch(compileUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: {
          'App.tsx': [
            `export default function App() {`,
            `  return (`,
            `    <div data-testid="hidden-iframe-probe"`,
            `         style={{ padding: 24, fontFamily: 'system-ui' }}>`,
            `      Hidden-iframe probe — buildId: ${JSON.stringify(buildId)}`,
            `    </div>`,
            `  );`,
            `}`,
          ].join('\n'),
        },
      }),
      signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
    });

    try { compileBody = await res.json(); } catch { /* ignore parse errors */ }

    if (!res.ok || compileBody?.success === false) {
      console.error('compile FAILED:', compileBody?.error ?? `HTTP ${res.status}`);
      process.exit(1);
    }
  } catch (e) {
    console.error('compile fetch error:', e && e.message ? e.message : String(e));
    process.exit(1);
  }
  console.log(`compile OK (${Date.now() - compileStart} ms)`);

  // ── Step 2: load studio page, inject hidden iframe, await postMessage ──────
  // MountReporter (preview-workspace/src/main.tsx) fires window.parent.postMessage
  // after React commits: { type: 'preview-mounted', buildId }.
  // Because the iframe is same-origin this message reaches the parent window.
  console.log('\nStep 2: loading studio and injecting hidden preview iframe...');

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page    = await ctx.newPage();

  page.on('pageerror', (e) => console.log('[pageerror]', String(e && e.message ? e.message : e)));

  await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  // Install message collector then inject the hidden preview iframe.
  // The iframe uses the same sandbox policy as the production runtime iframe
  // (PreviewCanvas.tsx) so this test exercises the real security boundary.
  await page.evaluate(
    ({ path, sandbox }) => {
      (window as any).__probe = { msgs: [] };
      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        (window as any).__probe.msgs.push({ t: Date.now(), origin: e.origin, data: e.data });
      });

      const iframe = document.createElement('iframe');
      iframe.id    = 'probe-preview-iframe';
      iframe.src   = path;   // same-origin relative URL — no external server
      iframe.setAttribute('sandbox', sandbox);
      iframe.style.cssText = 'display:none;width:800px;height:600px;border:0';
      document.body.appendChild(iframe);
    },
    { path: previewPath, sandbox: PREVIEW_SANDBOX },
  );

  // Poll up to MOUNT_TIMEOUT_MS for a preview-mounted message matching buildId.
  const needle   = buildId;
  let matched    = null;
  const deadline = Date.now() + MOUNT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    matched = await page.evaluate((wantId) => {
      const list = (window as any).__probe?.msgs ?? [];
      return (
        list.find(
          (m: any) => m.data && m.data.type === 'preview-mounted' && m.data.buildId === wantId,
        ) || null
      );
    }, needle);
    if (matched) break;
    await page.waitForTimeout(200);
  }

  const allMsgs = await page.evaluate(() => (window as any).__probe?.msgs ?? []);

  console.log('\n=== HIDDEN-IFRAME PROBE RESULT ===');
  console.log('build_id:                   ', buildId);
  console.log('preview_path (same-origin): ', previewPath);
  console.log('handshake_seen:             ', Boolean(matched));
  console.log('\nall messages received by studio window (' + allMsgs.length + '):');
  allMsgs.forEach((m: any, i: number) => {
    console.log('  [' + i + '] origin=' + m.origin + ' data=' + JSON.stringify(m.data));
  });

  await browser.close();
  process.exit(matched ? 0 : 1);
})();

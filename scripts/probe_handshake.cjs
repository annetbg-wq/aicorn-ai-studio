// Synthetic handshake probe — same-origin compiled-preview path.
//
// Old path (removed): opened a separate PREVIEW_URL (localhost:3100), rewrote
// __build_id.ts via /__write_preview to trigger Vite HMR, waited for
// `preview-mounted sent for <newId>` in console.
//
// New path (this file): uses the canonical compiled-preview contract:
//   1. POST minimal React files to /api/preview/:buildId/compile (backend vite build).
//   2. Open /preview/:buildId (same-origin, proxied to backend) in headless browser.
//   3. Assert MountReporter posts `preview-mounted sent for <buildId>` in console.
//
// No PREVIEW_URL environment variable is required.
// STUDIO_URL defaults to http://localhost:5183.

const { chromium } = require('playwright');
const { randomUUID } = require('crypto');

const STUDIO_URL        = process.env.STUDIO_URL || 'http://localhost:5183';
const COMPILE_TIMEOUT_MS = 90_000; // vite build can take up to 90 s
const MOUNT_TIMEOUT_MS   = 15_000; // after build, MountReporter should fire quickly

(async () => {
  const buildId    = randomUUID();
  const compileUrl = `${STUDIO_URL}/api/preview/${buildId}/compile`;
  const previewUrl = `${STUDIO_URL}/preview/${buildId}`;

  console.log('=== HANDSHAKE PROBE (same-origin compiled-preview) ===');
  console.log('build_id:    ', buildId);
  console.log('compile_url: ', compileUrl);
  console.log('preview_url: ', previewUrl);

  // ── Step 1: compile ───────────────────────────────────────────
  // POST minimal files → Express /api/preview/:buildId/compile → vite build →
  // builds/:buildId/ static output. The call blocks until the build finishes.
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
            `    <div data-testid="handshake-probe"`,
            `         style={{ padding: 24, fontFamily: 'system-ui' }}>`,
            `      Handshake probe — buildId: ${JSON.stringify(buildId)}`,
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
  console.log(`compile OK (${Date.now() - compileStart} ms) → ${compileBody?.url}`);

  // ── Step 2: open preview in browser, assert preview-mounted ──
  // MountReporter (preview-workspace/src/main.tsx) fires useEffect after React
  // commits and logs `[preview] preview-mounted sent for <buildId>`.
  console.log('\nStep 2: opening preview and waiting for handshake...');

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page    = await ctx.newPage();

  const lines   = [];
  const startMs = Date.now();
  const push = (src, msg) => {
    const t = ((Date.now() - startMs) / 1000).toFixed(1) + 's';
    lines.push(`[${t}] ${src} ${msg}`);
  };
  page.on('console',   (m) => push('[console.' + m.type() + ']', m.text()));
  page.on('pageerror', (e) => push('[pageerror]', String(e && e.message ? e.message : e)));

  try {
    await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    // Non-fatal: page may still render after timeout
    console.warn('goto warning (non-fatal):', e && e.message ? e.message : String(e));
  }

  // Poll until MountReporter logs the canonical preview-mounted line.
  const needle   = `preview-mounted sent for ${buildId}`;
  let handshakeSeen = false;
  const deadline = Date.now() + MOUNT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (lines.some((l) => l.includes(needle))) { handshakeSeen = true; break; }
    await page.waitForTimeout(200);
  }

  console.log('\n=== HANDSHAKE RESULT ===');
  console.log('build_id:        ', buildId);
  console.log('preview_url:     ', previewUrl);
  console.log('handshake_seen:  ', handshakeSeen);
  console.log('\npreview console lines:');
  lines.forEach((l) => console.log('  ' + l));

  await browser.close();
  process.exit(handshakeSeen ? 0 : 1);
})();

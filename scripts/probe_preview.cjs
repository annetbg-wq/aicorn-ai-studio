// Same-origin preview smoke test — compiled-preview path.
//
// LEGACY MODEL (removed): required a PREVIEW_URL env var pointing to a
// separate preview server (e.g. localhost:3100). Opened that URL headless,
// captured console + network, asserted no 500 responses.
//
// CURRENT MODEL (this file): no separate preview server. Uses the canonical
// same-origin compiled-preview contract:
//   1. POST minimal React files to /api/preview/:buildId/compile.
//   2. Open /preview/:buildId on the same origin.
//   3. Capture console + network, assert no 500 responses and React renders.
//
// STUDIO_URL defaults to http://localhost:5183.
// No PREVIEW_URL environment variable is required or accepted.

const { chromium } = require('playwright');
const { randomUUID } = require('crypto');

const STUDIO_URL         = process.env.STUDIO_URL || 'http://localhost:5183';
const COMPILE_TIMEOUT_MS = 90_000;

(async () => {
  const buildId    = randomUUID();
  const compileUrl = `${STUDIO_URL}/api/preview/${buildId}/compile`;
  const previewUrl = `${STUDIO_URL}/preview/${buildId}`;

  console.log('=== PROBE PREVIEW (same-origin compiled-preview) ===');
  console.log('studio_url:   ', STUDIO_URL);
  console.log('build_id:     ', buildId);
  console.log('compile_url:  ', compileUrl);
  console.log('preview_url:  ', previewUrl);

  // ── Step 1: compile ────────────────────────────────────────────────────────
  console.log('\nStep 1: compiling...');
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
            `    <div id="probe-root" style={{ padding: 24, fontFamily: 'system-ui' }}>`,
            `      Preview smoke test — OK`,
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
  console.log('compile OK');

  // ── Step 2: open preview, capture console + network ─────────────────────
  console.log('\nStep 2: opening preview...');

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext();
  const page    = await ctx.newPage();

  const consoleLines = [];
  const pageErrors   = [];
  const badResponses = [];

  page.on('console',   (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
  page.on('response',  (res) => { if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`); });

  let gotoError   = null;
  let finalStatus = null;
  try {
    const resp = await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 20_000 });
    finalStatus = resp ? resp.status() : null;
  } catch (e) {
    gotoError = String(e && e.message ? e.message : e);
  }

  await page.waitForTimeout(2_000);

  const title    = await page.title().catch(() => '');
  const rootText = await page
    .evaluate(() => {
      const el = document.getElementById('root') || document.body;
      return el ? el.innerText.slice(0, 200) : '(no content)';
    })
    .catch(() => '(eval failed)');

  console.log('\n=== PROBE PREVIEW RESULT ===');
  console.log('navigation_error:', gotoError);
  console.log('final_status:    ', finalStatus);
  console.log('title:           ', title);
  console.log('root_text:       ', rootText);
  console.log('page_errors:');
  pageErrors.forEach((p) => console.log('  - ' + p));
  console.log('bad_responses (>=400):');
  badResponses.forEach((r) => console.log('  - ' + r));
  console.log('console_lines (first 40):');
  consoleLines.slice(0, 40).forEach((c) => console.log('  ' + c));

  await browser.close();

  const has5xx = badResponses.some((r) => r.startsWith('5'));
  process.exit(gotoError || has5xx ? 1 : 0);
})();

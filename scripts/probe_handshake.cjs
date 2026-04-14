// Synthetic handshake probe: open preview-workspace, rewrite __build_id.ts via studio's
// /__write_preview middleware, assert preview-workspace posts preview-mounted with the
// new buildId inside the timeout window.
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');

const PREVIEW_URL = process.env.PREVIEW_URL;
const STUDIO_URL  = 'http://localhost:5183';

if (!PREVIEW_URL) {
  throw new Error('PREVIEW_URL required');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();

  const lines = [];
  const startMs = Date.now();
  const push = (src, msg) => {
    const t = ((Date.now() - startMs) / 1000).toFixed(1) + 's';
    lines.push(`[${t}] ${src} ${msg}`);
  };
  page.on('console', (m) => push('[console.' + m.type() + ']', m.text()));
  page.on('pageerror', (e) => push('[pageerror]', String(e && e.message || e)));

  // 1. Load preview-workspace in the iframe and read its initial buildId
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(1500);

  const beforeFile = await fetch(`${STUDIO_URL}/__read_preview?path=__build_id.ts`)
    .then((r) => r.json())
    .catch(() => null);
  console.log('before file:', beforeFile && beforeFile.content);

  // 2. Generate a NEW uuid and write __build_id.ts via studio middleware
  const newId = randomUUID();
  const content = `export const BUILD_ID = ${JSON.stringify(newId)};\n`;
  console.log('writing new buildId:', newId);

  const writeResp = await fetch(`${STUDIO_URL}/__write_preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '__build_id.ts', content }),
  });
  console.log('write status:', writeResp.status);

  // 3. Wait up to 10 s for the preview-workspace to log
  //    "[preview] preview-mounted sent for <newId>"
  const deadline = Date.now() + 10_000;
  const needle = `preview-mounted sent for ${newId}`;
  let handshakeSeen = false;
  while (Date.now() < deadline) {
    if (lines.some((l) => l.includes(needle))) { handshakeSeen = true; break; }
    await page.waitForTimeout(200);
  }

  const afterFile = await fetch(`${STUDIO_URL}/__read_preview?path=__build_id.ts`)
    .then((r) => r.json())
    .catch(() => null);

  console.log('\n=== HANDSHAKE RESULT ===');
  console.log('new_build_id:         ', newId);
  console.log('handshake_seen:       ', handshakeSeen);
  console.log('file_after_write:     ', afterFile && afterFile.content);
  console.log('\npreview-workspace console lines:');
  lines.forEach((l) => console.log('  ' + l));

  await browser.close();
  process.exit(handshakeSeen ? 0 : 1);
})();

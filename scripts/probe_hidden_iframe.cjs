// Reproduce the real-world failure mode: inject a display:none iframe of the
// preview-workspace INSIDE the studio origin (http://localhost:5183), rewrite
// __build_id.ts via /__write_preview, and assert the studio window receives
// a `preview-mounted` postMessage with the new buildId within 12 s.
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');

const STUDIO_URL = 'http://localhost:5183';
const PREVIEW_URL = process.env.PREVIEW_URL;

if (!PREVIEW_URL) {
  throw new Error('PREVIEW_URL required');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => console.log('[pageerror]', String(e && e.message || e)));

  console.log('Loading studio origin…');
  await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  // Install a message collector and inject a display:none iframe of preview-workspace
  // using the EXACT sandbox attrs SandpackPreview uses in production.
  await page.evaluate((previewUrl) => {
    window.__probe = { msgs: [] };
    window.addEventListener('message', (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      window.__probe.msgs.push({ t: Date.now(), origin: e.origin, data: e.data });
    });

    const iframe = document.createElement('iframe');
    iframe.id = 'probe-preview-iframe';
    iframe.src = previewUrl;
    iframe.setAttribute(
      'sandbox',
      'allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads',
    );
    iframe.style.display = 'none';
    iframe.style.width = '800px';
    iframe.style.height = '600px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }, PREVIEW_URL);

  // Give the hidden iframe time to boot the preview-workspace
  await page.waitForTimeout(3500);

  const beforeMsgs = await page.evaluate(() => window.__probe.msgs.length);
  console.log('messages before write:', beforeMsgs);

  const beforeFile = await page.evaluate(async () => {
    const r = await fetch('/__read_preview?path=__build_id.ts');
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.content ? j.content : null;
  });
  console.log('before file:', beforeFile && beforeFile.trim());

  const newId = randomUUID();
  console.log('writing new buildId:', newId);
  const writeStatus = await page.evaluate(async (id) => {
    const r = await fetch('/__write_preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: '__build_id.ts',
        content: 'export const BUILD_ID = ' + JSON.stringify(id) + ';\n',
      }),
    });
    return r.status;
  }, newId);
  console.log('write status:', writeStatus);

  // Poll up to 12 s for a preview-mounted message matching newId
  const deadline = Date.now() + 12_000;
  let matched = null;
  while (Date.now() < deadline) {
    matched = await page.evaluate((wantId) => {
      const list = window.__probe.msgs;
      return list.find(
        (m) => m.data && m.data.type === 'preview-mounted' && m.data.buildId === wantId,
      ) || null;
    }, newId);
    if (matched) break;
    await page.waitForTimeout(200);
  }

  const allMsgs = await page.evaluate(() => window.__probe.msgs);

  console.log('\n=== HIDDEN-IFRAME HANDSHAKE RESULT ===');
  console.log('handshake_seen_for_new_buildId:', Boolean(matched));
  console.log('new_build_id:', newId);
  console.log('\nall messages received by the STUDIO window (' + allMsgs.length + '):');
  allMsgs.forEach((m, i) => {
    console.log('  [' + i + '] origin=' + m.origin + ' data=' + JSON.stringify(m.data));
  });

  await browser.close();
  process.exit(matched ? 0 : 1);
})();

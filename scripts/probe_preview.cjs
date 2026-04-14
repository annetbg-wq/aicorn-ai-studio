// Autonomous preview smoke test.
// Step 3: open http://localhost:3100 headless, capture console + network, assert no 500.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleLines = [];
  const pageErrors = [];
  const responses = [];

  page.on('console', (msg) => {
    consoleLines.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err && err.message ? err.message : err));
  });
  page.on('response', (res) => {
    const u = res.url();
    const s = res.status();
    if (s >= 400) responses.push(`${s} ${u}`);
  });

  let gotoError = null;
  let finalStatus = null;
  try {
    const resp = await page.goto('http://localhost:3100', {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    finalStatus = resp ? resp.status() : null;
  } catch (e) {
    gotoError = String(e && e.message ? e.message : e);
  }

  // Give HMR / modules a moment to stabilize
  await page.waitForTimeout(2000);

  const title = await page.title().catch(() => '');
  const rootText = await page
    .evaluate(() => {
      const el = document.getElementById('root');
      return el ? el.innerText.slice(0, 200) : '(no #root)';
    })
    .catch(() => '(eval failed)');

  console.log('=== PROBE 3100 ===');
  console.log('navigation_error:', gotoError);
  console.log('final_status:', finalStatus);
  console.log('title:', title);
  console.log('root_text:', rootText);
  console.log('page_errors:');
  pageErrors.forEach((p) => console.log('  - ' + p));
  console.log('bad_responses (>=400):');
  responses.forEach((r) => console.log('  - ' + r));
  console.log('console_lines (first 40):');
  consoleLines.slice(0, 40).forEach((c) => console.log('  ' + c));

  await browser.close();

  const has500 = responses.some((r) => r.startsWith('5'));
  process.exit(gotoError || has500 ? 1 : 0);
})();

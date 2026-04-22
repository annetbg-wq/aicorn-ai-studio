const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto('http://localhost:5183', { waitUntil: 'networkidle' });
  const buttons = await p.$$('button');
  for (const button of buttons) {
    const text = await button.textContent();
    if (text && text.includes('Test Login')) { await button.click(); break; }
  }
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'scripts/debug-dashboard2.png' });
  console.log('dashboard done');
  await b.close();
})().catch(e => console.error(e.message));

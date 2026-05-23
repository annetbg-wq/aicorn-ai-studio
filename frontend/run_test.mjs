import { test, chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  // ... run tests here ...
  await browser.close();
})();

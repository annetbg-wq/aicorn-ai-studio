import { chromium } from 'playwright';

const b = await chromium.launch({ headless: false, slowMo: 150 });
const p = await b.newPage();
p.setDefaultTimeout(30000);

await p.goto('http://localhost:5183', { timeout: 60000, waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await p.getByText('Test Login', { exact: false }).first().click();
await p.waitForTimeout(5000);

await p.screenshot({ path: 'live-obs-03-dashboard.png', fullPage: true });

// Look for settings via user avatar or hamburger
const userBtnText = 'Ddev.local@aic-studio.test';
const userBtn = p.getByText(userBtnText, { exact: false });
if (await userBtn.count() > 0) {
  console.log('Found user button, clicking...');
  await userBtn.click();
  await p.waitForTimeout(2000);
  const menuText = await p.evaluate(() => document.body.innerText);
  console.log('AFTER_USER_CLICK:', menuText.substring(0, 600).replace(/\n/g,' | '));
  await p.screenshot({ path: 'live-obs-04-usermenu.png', fullPage: true });
}

// Navigate to System Engine 
await p.goto('http://localhost:5183', { timeout: 60000, waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

// Try clicking on System Engine
const engineBtn = p.getByText('System Engine', { exact: false }).first();
if (await engineBtn.count() > 0) {
  await engineBtn.click();
  await p.waitForTimeout(4000);
  await p.screenshot({ path: 'live-obs-05-engine.png', fullPage: true });
  const engineText = await p.evaluate(() => document.body.innerText);
  console.log('ENGINE_TEXT:', engineText.substring(0, 600).replace(/\n/g,' | '));
}

await b.close();

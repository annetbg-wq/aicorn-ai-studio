import { chromium } from 'playwright';

const p_screenshot = async (page, name) => page.screenshot({ path: `live-obs-${name}.png`, fullPage: true });

const b = await chromium.launch({ headless: false, slowMo: 120 });
const p = await b.newPage();
p.setDefaultTimeout(30000);

// LOGIN
await p.goto('http://localhost:5183', { timeout: 60000, waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await p.getByText('Test Login', { exact: false }).first().click();
await p.waitForTimeout(4000);
await p_screenshot(p, '03-dashboard');

// Check all buttons
const allBtns = await p.locator('button').allTextContents();
console.log('ALL_BUTTONS:', JSON.stringify(allBtns.slice(0, 30)));

// Check all links/nav items
const navItems = await p.locator('a, [role="menuitem"], [role="button"]').allTextContents();
console.log('NAV_ITEMS:', JSON.stringify(navItems.filter(t => t.trim()).slice(0, 30)));

// Check for settings-related elements
const bodyText = await p.evaluate(() => document.body.innerText);
console.log('HAS_SETTINGS:', bodyText.includes('Settings') || bodyText.includes('Настройки'));
console.log('HAS_AGENTS:', bodyText.includes('Agent') || bodyText.includes('Агент'));
console.log('HAS_ENGINE:', bodyText.includes('Engine'));

await b.close();

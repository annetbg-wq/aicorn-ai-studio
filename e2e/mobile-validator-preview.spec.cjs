// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;

const MOBILE_PREVIEW_FILES = {
  'src/main.tsx': [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import App from './App';",
    "createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);",
  ].join('\n'),
  'src/App.tsx': [
    "import Home from './pages/Home';",
    "import BottomTabs from './components/BottomTabs';",
    'export default function App() {',
    '  return <main data-testid="mobile-app-shell" style={{maxWidth:430,margin:"0 auto",padding:20,fontFamily:"system-ui"}}>',
    '    <Home />',
    '    <BottomTabs />',
    '  </main>;',
    '}',
  ].join('\n'),
  'src/data/seed.ts': [
    "export const HABITS = [{ id: 'hydrate', title: 'Drink water', streak: 7 }];",
    'export const habits = HABITS;',
    'export const seed = HABITS;',
    'export const SEED = HABITS;',
    "export const PAYWALL_FEATURES = ['Unlimited habits', 'Progress insights'];",
    'export const paywallFeatures = PAYWALL_FEATURES;',
    "export const PRICING_TIERS = [{ id: 'monthly', label: 'Monthly', price: '$4.99' }, { id: 'yearly', label: 'Yearly', price: '$39.99' }];",
    'export const SUBSCRIPTION_PLANS = PRICING_TIERS;',
    'export const subscriptionPlans = SUBSCRIPTION_PLANS;',
    'export default HABITS;',
  ].join('\n'),
  'src/components/EmptyState.tsx': [
    'export default function EmptyState() {',
    '  return <aside data-testid="reusable-empty-state">Reusable skeleton state</aside>;',
    '}',
  ].join('\n'),
  'src/components/BottomTabs.tsx': [
    'export default function BottomTabs() {',
    '  return <nav data-testid="root-navigation" aria-label="Primary"><button>Home</button><button>Progress</button><button>Profile</button></nav>;',
    '}',
  ].join('\n'),
  'src/pages/Home.tsx': [
    "import EmptyState from '../components/EmptyState';",
    'export default function Home() {',
    '  return <section><h1>Mobile habit app</h1><button type="button">Complete today</button><EmptyState /></section>;',
    '}',
  ].join('\n'),
};

async function bypassAuth(page) {
  await page.evaluate(() => localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function openStudio(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await bypassAuth(page);
  await page.locator('[title="System Engine"]').click();
}

async function waitForPreviewHook(page) {
  await expect(async () => {
    const ready = await page.evaluate(() => typeof window.__E2E_PREVIEW_TEST?.mountPreview === 'function');
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000, intervals: [200, 500, 1_000] });
}

test.describe('mobile validator boundary → real preview', () => {
  test.setTimeout(120_000);

  test('reusable read-only UI compiles inside skeleton-owned root navigation', async ({ page }) => {
    await openStudio(page);
    await page.evaluate(() => localStorage.setItem('AIC_E2E_BLUEPRINT_SHORTCUT', '1'));
    await waitForPreviewHook(page);

    await page.evaluate(async (files) => {
      await window.__E2E_PREVIEW_TEST.mountPreview(files);
    }, MOBILE_PREVIEW_FILES);

    const iframe = page.locator('[data-testid="preview-iframe"]');
    await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
    await expect(async () => {
      const src = await iframe.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).not.toBe('about:blank');
      expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
    }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 3_000] });

    const frame = page.frameLocator('[data-testid="preview-iframe"]');
    await expect(frame.locator('[data-testid="mobile-app-shell"]')).toBeVisible({ timeout: FLOW_TIMEOUT });
    await expect(frame.locator('[data-testid="root-navigation"]')).toBeVisible({ timeout: FLOW_TIMEOUT });
    await expect(frame.locator('[data-testid="reusable-empty-state"]')).toContainText('Reusable skeleton state');
    await expect(frame.locator('body')).toContainText('Mobile habit app');
  });
});

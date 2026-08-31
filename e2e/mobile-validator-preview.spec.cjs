// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;

const simplePage = (name) => `export default function ${name}(){return <section><h2>Mobile habit app — ${name}</h2></section>}`;

// Product-owned contract files only. Bootstrap, root App/layout, BottomTabs and reusable
// components are intentionally omitted so the installed mobile skeleton owns them.
const MOBILE_PREVIEW_FILES = {
  'src/config/app.ts': [
    "export const APP_CONFIG = { name: 'Habit Mobile', tagline: 'Daily progress' } as const;",
    'export default APP_CONFIG;',
  ].join('\n'),
  'src/config/routes.ts': [
    "export const ROUTES = { onboarding: '/onboarding', home: '/', detail: '/detail', create: '/create', progress: '/progress', profile: '/profile' } as const;",
    'export default ROUTES;',
  ].join('\n'),
  'src/config/navigation.ts': [
    "export const NAVIGATION = [{ id: 'home', label: 'Home', path: '/' }, { id: 'progress', label: 'Progress', path: '/progress' }, { id: 'profile', label: 'Profile', path: '/profile' }] as const;",
    'export const NAV_ITEMS = NAVIGATION;',
    'export default NAVIGATION;',
  ].join('\n'),
  'src/config/theme.ts': [
    "export const DEFAULT_THEME = 'light';",
    "export const THEME = { light: 'light', dark: 'dark' } as const;",
    'export const THEMES = THEME;',
    "export const THEME_CONFIG = { defaultTheme: DEFAULT_THEME, storageKey: 'aic-theme' } as const;",
    "export const resolveTheme = (value) => value === 'dark' ? 'dark' : 'light';",
    'export default THEME_CONFIG;',
  ].join('\n'),
  'src/data/types.ts': [
    'export type Habit = { id: string; title: string; streak: number };',
    'export type PricingTier = { id: string; label: string; price: string };',
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
  'src/pages/Onboarding.tsx': simplePage('Onboarding'),
  'src/pages/Home.tsx': [
    "import EmptyState from '../components/EmptyState';",
    'export default function Home() {',
    '  return <section><h1>Mobile habit app — Home</h1><button type="button">Complete today</button><EmptyState title="No habits yet" description="Start one" /></section>;',
    '}',
  ].join('\n'),
  'src/pages/Detail.tsx': simplePage('Detail'),
  'src/pages/Create.tsx': simplePage('Create'),
  'src/pages/Progress.tsx': simplePage('Progress'),
  'src/pages/Profile.tsx': simplePage('Profile'),
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

  test('product slots compile with skeleton-owned bootstrap, root layout and navigation', async ({ page }) => {
    await openStudio(page);
    await page.evaluate(() => localStorage.setItem('AIC_E2E_BLUEPRINT_SHORTCUT', '1'));
    await waitForPreviewHook(page);

    await page.evaluate(async (files) => {
      await window.__E2E_PREVIEW_TEST.mountPreview(files, 'mobile-app');
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
    await expect(frame.locator('body')).toContainText('Mobile habit app', { timeout: FLOW_TIMEOUT });
  });
});

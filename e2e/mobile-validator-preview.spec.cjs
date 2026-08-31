// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;

const simplePage = (name) => `export default function ${name}(){return <section><h2>Mobile habit app — ${name}</h2></section>}`;

// Product-owned contract files only. Bootstrap, root App/layout, BottomTabs and reusable
// components are intentionally omitted so the installed mobile skeleton owns them.
// Config/data exports mirror the APIs consumed by the read-only skeleton foundation.
const MOBILE_PREVIEW_FILES = {
  'src/config/app.ts': [
    "export const APP_CONFIG = { name: 'Habit Mobile', tagline: 'Daily progress', freeActionLimit: 3, storagePrefix: 'habit-mobile.v1' } as const;",
    'export const STORAGE_KEYS = {',
    '  profile: `${APP_CONFIG.storagePrefix}.profile`,',
    '  theme: `${APP_CONFIG.storagePrefix}.theme`,',
    '  feed: `${APP_CONFIG.storagePrefix}.feed`,',
    '  progress: `${APP_CONFIG.storagePrefix}.progress`,',
    '} as const;',
  ].join('\n'),
  'src/config/routes.ts': [
    "export const ROUTES = { onboarding: '/onboarding', home: '/home', detail: '/detail/:id', create: '/create', progress: '/progress', profile: '/profile' } as const;",
    'export type RouteKey = keyof typeof ROUTES;',
    "export function detailRoute(id) { return ROUTES.detail.replace(':id', encodeURIComponent(id)); }",
  ].join('\n'),
  'src/config/navigation.ts': [
    "import { Home as HomeIcon, BarChart3, User, Plus } from 'lucide-react';",
    "import { ROUTES } from './routes';",
    'export const BOTTOM_TABS = [',
    "  { to: ROUTES.home, label: 'Home', icon: HomeIcon },",
    "  { to: ROUTES.create, label: 'Create', icon: Plus, primary: true },",
    "  { to: ROUTES.progress, label: 'Progress', icon: BarChart3 },",
    "  { to: ROUTES.profile, label: 'Profile', icon: User },",
    '] as const;',
  ].join('\n'),
  'src/config/theme.ts': [
    "export type ThemeChoice = 'light' | 'dark' | 'system';",
    "export type ResolvedTheme = 'light' | 'dark';",
    "export const DEFAULT_THEME = 'system';",
    "export function resolveTheme(choice) { if (choice === 'system') { if (typeof window === 'undefined') return 'light'; return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } return choice; }",
  ].join('\n'),
  'src/data/types.ts': [
    "import type { ThemeChoice } from '@/config/theme';",
    'export type ID = string;',
    "export type SubscriptionPlan = 'free' | 'pro' | 'premium';",
    "export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';",
    'export interface UserProfile { id: ID; name: string; goal: string; createdAt: string; onboardingComplete: boolean; plan: SubscriptionPlan; usageCount: number; }',
    'export interface FeedItem { id: ID; title: string; subtitle: string; kind: string; accent?: string; createdAt: string; meta?: Record<string, string | number | boolean>; }',
    'export interface ProgressEntry { date: string; value: number; goalMet: boolean; }',
    'export interface PricingTier { id: SubscriptionPlan; name: string; pricePerMonth: number; highlight?: boolean; features: readonly string[]; }',
    'export type { ThemeChoice };',
  ].join('\n'),
  'src/data/seed.ts': [
    "import { APP_CONFIG } from '@/config/app';",
    "export const SEED_FEED = [{ id: 'habit-1', title: 'Hydrate', subtitle: 'Drink water', kind: 'habit', createdAt: '2026-08-31T08:00:00Z', meta: { streak: 7 } }] as const;",
    "export const SEED_PROGRESS = [{ date: '2026-08-31', value: 1, goalMet: true }] as const;",
    'export const PRICING_TIERS = [',
    "  { id: 'free', name: 'Free', pricePerMonth: 0, features: [`Up to ${APP_CONFIG.freeActionLimit} actions per day`] },",
    "  { id: 'pro', name: 'Pro', pricePerMonth: 9, highlight: true, features: ['Unlimited actions'] },",
    "  { id: 'premium', name: 'Premium', pricePerMonth: 19, features: ['Priority features'] },",
    '] as const;',
  ].join('\n'),
  'src/pages/Onboarding.tsx': simplePage('Onboarding'),
  'src/pages/Home.tsx': [
    "import { CircleOff } from 'lucide-react';",
    "import { EmptyState } from '../components/EmptyState';",
    'export default function Home() {',
    '  return <section><h1>Mobile habit app — Home</h1><button type="button">Complete today</button><EmptyState icon={CircleOff} title="No habits yet" description="Start one" /></section>;',
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
    page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on('pageerror', (error) => console.log(`[browser:pageerror] ${error.message}`));

    await openStudio(page);
    await page.evaluate(() => localStorage.setItem('AIC_E2E_BLUEPRINT_SHORTCUT', '1'));
    await waitForPreviewHook(page);

    await page.evaluate((files) => {
      window.__MOBILE_PREVIEW_RESULT = 'pending';
      window.__E2E_PREVIEW_TEST.mountPreview(files, 'mobile-app')
        .then(() => { window.__MOBILE_PREVIEW_RESULT = 'mounted'; })
        .catch((error) => { window.__MOBILE_PREVIEW_RESULT = `error:${String(error?.message ?? error)}`; });
    }, MOBILE_PREVIEW_FILES);

    const iframe = page.locator('[data-testid="preview-iframe"]');
    await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
    await expect(async () => {
      const src = await iframe.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).not.toBe('about:blank');
      expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
    }).toPass({ timeout: FLOW_TIMEOUT, intervals: [500, 1_000, 2_000] });

    const initialSrc = await iframe.getAttribute('src');
    expect(initialSrc).toBeTruthy();

    // SandpackPreview derives its URL from PreviewController.expectingBuildId, so the
    // iframe may perform one harmless early 404 navigation while Vite is compiling.
    // Production RevisionManager reloads the iframe after triggerCompile resolves.
    // Mirror that exact ordering here: wait for backend readiness, then reload once.
    await expect.poll(async () => {
      return page.evaluate(async (src) => {
        const preview = new URL(src);
        const buildId = preview.pathname.split('/preview/')[1]?.split('/')[0] ?? '';
        const previewSession = preview.searchParams.get('previewSession') ?? '';
        if (!buildId) return 'missing-build-id';

        const statusUrl = new URL(`/api/preview/${buildId}/status`, preview.origin);
        if (previewSession) statusUrl.searchParams.set('previewSession', previewSession);
        const response = await fetch(statusUrl.toString());
        if (response.status === 404) return 'missing';
        if (!response.ok) return `http-${response.status}`;
        const body = await response.json();
        return body?.status ?? 'unknown';
      }, initialSrc);
    }, { timeout: FLOW_TIMEOUT, intervals: [250, 500, 1_000] }).toBe('ready');

    await iframe.evaluate((element) => {
      const next = new URL(element.src);
      next.searchParams.set('mountAttempt', String(Date.now()));
      element.src = next.toString();
    });

    const frame = page.frameLocator('[data-testid="preview-iframe"]');
    await expect(frame.locator('body')).toContainText('Mobile habit app', { timeout: FLOW_TIMEOUT });

    await expect.poll(
      () => page.evaluate(() => window.__MOBILE_PREVIEW_RESULT),
      { timeout: 10_000, intervals: [250, 500, 1_000] },
    ).toBe('mounted');
  });
});

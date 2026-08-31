// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;

const EXPECTED_MOBILE_PRODUCT_SLOTS = [
  'src/config/app.ts',
  'src/config/navigation.ts',
  'src/config/routes.ts',
  'src/data/seed.ts',
  'src/data/types.ts',
  'src/pages/Create.tsx',
  'src/pages/Detail.tsx',
  'src/pages/Home.tsx',
  'src/pages/Onboarding.tsx',
  'src/pages/Profile.tsx',
  'src/pages/Progress.tsx',
].sort();

const MOBILE_SCENARIOS = [
  {
    id: 'finance',
    appName: 'Pocket Ledger',
    marker: 'Pocket Ledger — spending overview',
    tagline: 'Know where your money goes',
    storagePrefix: 'pocket-ledger.v1',
    goal: 'Keep weekly spending under budget',
    item: {
      id: 'expense-groceries',
      title: 'Groceries',
      subtitle: '$64.20 this week',
      kind: 'expense',
      meta: { amount: 64.2, category: 'Food' },
    },
    progress: { value: 72, goalMet: true },
    emptyTitle: 'No transactions yet',
    emptyDescription: 'Add your first expense or income',
    createTitle: 'Add transaction',
    detailTitle: 'Transaction detail',
    progressTitle: 'Budget pulse',
    profileTitle: 'Money preferences',
    tabs: ['Overview', 'Add', 'Budget', 'Profile'],
  },
  {
    id: 'meal-planner',
    appName: 'Pantry Flow',
    marker: 'Pantry Flow — weekly meals',
    tagline: 'Plan meals without wasting groceries',
    storagePrefix: 'pantry-flow.v1',
    goal: 'Cook five balanced dinners this week',
    item: {
      id: 'meal-salmon-bowl',
      title: 'Salmon grain bowl',
      subtitle: 'Dinner · 30 minutes',
      kind: 'meal',
      meta: { servings: 2, minutes: 30 },
    },
    progress: { value: 4, goalMet: false },
    emptyTitle: 'No meals planned',
    emptyDescription: 'Add a meal to build your week',
    createTitle: 'Plan a meal',
    detailTitle: 'Meal detail',
    progressTitle: 'Weekly cooking progress',
    profileTitle: 'Food preferences',
    tabs: ['Meals', 'Plan', 'Week', 'Profile'],
  },
  {
    id: 'study',
    appName: 'Study Sprint',
    marker: 'Study Sprint — today’s practice',
    tagline: 'Turn short sessions into steady progress',
    storagePrefix: 'study-sprint.v1',
    goal: 'Practice Spanish vocabulary every day',
    item: {
      id: 'deck-travel-spanish',
      title: 'Travel Spanish',
      subtitle: '24 cards · 8 due today',
      kind: 'deck',
      meta: { cards: 24, due: 8 },
    },
    progress: { value: 8, goalMet: true },
    emptyTitle: 'No study decks yet',
    emptyDescription: 'Create a deck for your first practice session',
    createTitle: 'Create study deck',
    detailTitle: 'Practice deck',
    progressTitle: 'Learning streak',
    profileTitle: 'Study preferences',
    tabs: ['Today', 'Create', 'Progress', 'Profile'],
  },
];

const q = (value) => JSON.stringify(value);

function buildMobileProductDelta(scenario) {
  const simplePage = (componentName, title, description) => [
    `export default function ${componentName}() {`,
    `  return <section><h1>${title}</h1><p>${description}</p></section>;`,
    '}',
  ].join('\n');

  return {
    'src/config/app.ts': [
      `export const APP_CONFIG = { name: ${q(scenario.appName)}, tagline: ${q(scenario.tagline)}, freeActionLimit: 3, storagePrefix: ${q(scenario.storagePrefix)} } as const;`,
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
      "export function detailRoute(id: string) { return ROUTES.detail.replace(':id', encodeURIComponent(id)); }",
    ].join('\n'),
    'src/config/navigation.ts': [
      "import { Home as HomeIcon, BarChart3, User, Plus } from 'lucide-react';",
      "import { ROUTES } from './routes';",
      'export const BOTTOM_TABS = [',
      `  { to: ROUTES.home, label: ${q(scenario.tabs[0])}, icon: HomeIcon },`,
      `  { to: ROUTES.create, label: ${q(scenario.tabs[1])}, icon: Plus, primary: true },`,
      `  { to: ROUTES.progress, label: ${q(scenario.tabs[2])}, icon: BarChart3 },`,
      `  { to: ROUTES.profile, label: ${q(scenario.tabs[3])}, icon: User },`,
      '] as const;',
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
      `export const SEED_FEED = [{ id: ${q(scenario.item.id)}, title: ${q(scenario.item.title)}, subtitle: ${q(scenario.item.subtitle)}, kind: ${q(scenario.item.kind)}, createdAt: '2026-08-31T08:00:00Z', meta: ${JSON.stringify(scenario.item.meta)} }] as const;`,
      `export const SEED_PROGRESS = [{ date: '2026-08-31', value: ${scenario.progress.value}, goalMet: ${scenario.progress.goalMet} }] as const;`,
      'export const PRICING_TIERS = [',
      "  { id: 'free', name: 'Free', pricePerMonth: 0, features: [`Up to ${APP_CONFIG.freeActionLimit} actions per day`] },",
      "  { id: 'pro', name: 'Pro', pricePerMonth: 9, highlight: true, features: ['Unlimited actions'] },",
      "  { id: 'premium', name: 'Premium', pricePerMonth: 19, features: ['Priority features'] },",
      '] as const;',
    ].join('\n'),
    'src/pages/Onboarding.tsx': simplePage('Onboarding', `Welcome to ${scenario.appName}`, scenario.goal),
    'src/pages/Home.tsx': [
      "import { CircleOff } from 'lucide-react';",
      "import { EmptyState } from '../components/EmptyState';",
      "import { SEED_FEED } from '../data/seed';",
      'export default function Home() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${scenario.marker}</h1><article><strong>{first.title}</strong><p>{first.subtitle}</p></article><EmptyState icon={CircleOff} title=${q(scenario.emptyTitle)} description=${q(scenario.emptyDescription)} /></section>;`,
      '}',
    ].join('\n'),
    'src/pages/Detail.tsx': [
      "import { SEED_FEED } from '../data/seed';",
      'export default function Detail() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${scenario.detailTitle}</h1><h2>{first.title}</h2><p>{first.subtitle}</p></section>;`,
      '}',
    ].join('\n'),
    'src/pages/Create.tsx': simplePage('Create', scenario.createTitle, `Create something new in ${scenario.appName}`),
    'src/pages/Progress.tsx': [
      "import { SEED_PROGRESS } from '../data/seed';",
      'export default function Progress() {',
      '  const latest = SEED_PROGRESS[0];',
      `  return <section><h1>${scenario.progressTitle}</h1><p>Current value: {latest.value}</p><p>{latest.goalMet ? 'Goal met' : 'In progress'}</p></section>;`,
      '}',
    ].join('\n'),
    'src/pages/Profile.tsx': [
      "import { APP_CONFIG } from '../config/app';",
      'export default function Profile() {',
      `  return <section><h1>${scenario.profileTitle}</h1><p>{APP_CONFIG.name}</p><p>{APP_CONFIG.tagline}</p></section>;`,
      '}',
    ].join('\n'),
  };
}

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

async function mountRealMobilePreview(page, files, marker) {
  await page.evaluate((productFiles) => {
    window.__MOBILE_PREVIEW_RESULT = 'pending';
    window.__E2E_PREVIEW_TEST.mountPreview(productFiles, 'mobile-app')
      .then(() => { window.__MOBILE_PREVIEW_RESULT = 'mounted'; })
      .catch((error) => { window.__MOBILE_PREVIEW_RESULT = `error:${String(error?.message ?? error)}`; });
  }, files);

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

  // SandpackPreview can navigate once before Vite is ready. Mirror production ordering:
  // wait for the backend build to be ready, then reload the iframe once.
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
  await expect(frame.locator('body')).toContainText(marker, { timeout: FLOW_TIMEOUT });

  await expect.poll(
    () => page.evaluate(() => window.__MOBILE_PREVIEW_RESULT),
    { timeout: 10_000, intervals: [250, 500, 1_000] },
  ).toBe('mounted');
}

test.describe('mobile product delta → real preview matrix', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  for (const scenario of MOBILE_SCENARIOS) {
    test(`${scenario.appName}: exact product slots compile on the unchanged mobile skeleton`, async ({ page }) => {
      page.on('console', (message) => console.log(`[${scenario.id}:browser:${message.type()}] ${message.text()}`));
      page.on('pageerror', (error) => console.log(`[${scenario.id}:browser:pageerror] ${error.message}`));

      const files = buildMobileProductDelta(scenario);
      expect(Object.keys(files).sort()).toEqual(EXPECTED_MOBILE_PRODUCT_SLOTS);
      expect(Object.keys(files)).not.toContain('src/App.tsx');
      expect(Object.keys(files)).not.toContain('src/config/theme.ts');
      expect(Object.keys(files).some((path) => path.startsWith('src/components/'))).toBe(false);
      expect(Object.keys(files).some((path) => path.startsWith('src/hooks/'))).toBe(false);

      await openStudio(page);
      await page.evaluate(() => localStorage.setItem('AIC_E2E_BLUEPRINT_SHORTCUT', '1'));
      await waitForPreviewHook(page);
      await mountRealMobilePreview(page, files, scenario.marker);
    });
  }
});

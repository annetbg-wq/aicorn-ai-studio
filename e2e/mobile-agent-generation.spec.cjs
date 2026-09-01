// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;
const LIVE_FLOW_TIMEOUT = 300_000;

const SCENARIOS = [
  {
    id: 'finance',
    prompt: 'Build a mobile personal finance app for tracking weekly spending and budget progress',
    appName: 'Pocket Ledger',
    marker: 'Pocket Ledger — spending overview',
    tagline: 'Know where your money goes',
    storagePrefix: 'pocket-ledger.agent.v1',
    goal: 'Keep weekly spending under budget',
    item: { id: 'expense-groceries', title: 'Groceries', subtitle: '$64.20 this week', kind: 'expense', meta: { amount: 64.2, category: 'Food' } },
    progress: { value: 72, goalMet: true },
    labels: { create: 'Add transaction', detail: 'Transaction detail', progress: 'Budget pulse', profile: 'Money preferences' },
    tabs: ['Overview', 'Add', 'Budget', 'Profile'],
  },
  {
    id: 'meal-planner',
    prompt: 'Build a mobile meal planning app for weekly dinners and pantry-aware cooking progress',
    appName: 'Pantry Flow',
    marker: 'Pantry Flow — weekly meals',
    tagline: 'Plan meals without wasting groceries',
    storagePrefix: 'pantry-flow.agent.v1',
    goal: 'Cook five balanced dinners this week',
    item: { id: 'meal-salmon-bowl', title: 'Salmon grain bowl', subtitle: 'Dinner · 30 minutes', kind: 'meal', meta: { servings: 2, minutes: 30 } },
    progress: { value: 4, goalMet: false },
    labels: { create: 'Plan a meal', detail: 'Meal detail', progress: 'Weekly cooking progress', profile: 'Food preferences' },
    tabs: ['Meals', 'Plan', 'Week', 'Profile'],
  },
  {
    id: 'study',
    prompt: 'Build a mobile learning app for short Spanish vocabulary practice and streak progress',
    appName: 'Study Sprint',
    marker: 'Study Sprint — today’s practice',
    tagline: 'Turn short sessions into steady progress',
    storagePrefix: 'study-sprint.agent.v1',
    goal: 'Practice Spanish vocabulary every day',
    item: { id: 'deck-travel-spanish', title: 'Travel Spanish', subtitle: '24 cards · 8 due today', kind: 'deck', meta: { cards: 24, due: 8 } },
    progress: { value: 8, goalMet: true },
    labels: { create: 'Create study deck', detail: 'Practice deck', progress: 'Learning streak', profile: 'Study preferences' },
    tabs: ['Today', 'Create', 'Progress', 'Profile'],
  },
];

const q = (value) => JSON.stringify(value);

function buildDelta(s) {
  const simplePage = (name, title, body) => [
    `export default function ${name}() {`,
    `  return <section><h1>${title}</h1><p>${body}</p></section>;`,
    '}',
  ].join('\n');

  return {
    'config/app.ts': [
      `export const APP_CONFIG = { name: ${q(s.appName)}, tagline: ${q(s.tagline)}, freeActionLimit: 3, storagePrefix: ${q(s.storagePrefix)} } as const;`,
      'export const STORAGE_KEYS = {',
      '  profile: `${APP_CONFIG.storagePrefix}.profile`,',
      '  theme: `${APP_CONFIG.storagePrefix}.theme`,',
      '  feed: `${APP_CONFIG.storagePrefix}.feed`,',
      '  progress: `${APP_CONFIG.storagePrefix}.progress`,',
      '} as const;',
    ].join('\n'),
    'config/routes.ts': [
      "export const ROUTES = { onboarding: '/onboarding', home: '/home', detail: '/detail/:id', create: '/create', progress: '/progress', profile: '/profile' } as const;",
      'export type RouteKey = keyof typeof ROUTES;',
      "export function detailRoute(id: string) { return ROUTES.detail.replace(':id', encodeURIComponent(id)); }",
    ].join('\n'),
    'config/navigation.ts': [
      "import { Home as HomeIcon, BarChart3, User, Plus } from 'lucide-react';",
      "import { ROUTES } from './routes';",
      'export const BOTTOM_TABS = [',
      `  { to: ROUTES.home, label: ${q(s.tabs[0])}, icon: HomeIcon },`,
      `  { to: ROUTES.create, label: ${q(s.tabs[1])}, icon: Plus, primary: true },`,
      `  { to: ROUTES.progress, label: ${q(s.tabs[2])}, icon: BarChart3 },`,
      `  { to: ROUTES.profile, label: ${q(s.tabs[3])}, icon: User },`,
      '] as const;',
    ].join('\n'),
    'data/types.ts': [
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
    'data/seed.ts': [
      "import { APP_CONFIG } from '@/config/app';",
      `export const SEED_FEED = [{ id: ${q(s.item.id)}, title: ${q(s.item.title)}, subtitle: ${q(s.item.subtitle)}, kind: ${q(s.item.kind)}, createdAt: '2026-09-01T08:00:00Z', meta: ${JSON.stringify(s.item.meta)} }] as const;`,
      `export const SEED_PROGRESS = [{ date: '2026-09-01', value: ${s.progress.value}, goalMet: ${s.progress.goalMet} }] as const;`,
      'export const PRICING_TIERS = [',
      "  { id: 'free', name: 'Free', pricePerMonth: 0, features: [`Up to ${APP_CONFIG.freeActionLimit} actions per day`] },",
      "  { id: 'pro', name: 'Pro', pricePerMonth: 9, highlight: true, features: ['Unlimited actions'] },",
      "  { id: 'premium', name: 'Premium', pricePerMonth: 19, features: ['Priority features'] },",
      '] as const;',
    ].join('\n'),
    'pages/Onboarding.tsx': [
      "import { useState } from 'react';",
      "import { useApp } from '@/context/AppContext';",
      'export default function Onboarding() {',
      "  const { completeOnboarding } = useApp();",
      "  const [name, setName] = useState('Alex');",
      `  return <section><h1>Welcome to ${s.appName}</h1><p>${s.goal}</p><input aria-label="Your name" value={name} onChange={event => setName(event.target.value)} /><button type="button" onClick={() => completeOnboarding({ name, goal: ${q(s.goal)} })}>Start</button></section>;`,
      '}',
    ].join('\n'),
    'pages/Home.tsx': [
      "import { SEED_FEED } from '../data/seed';",
      'export default function Home() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${s.marker}</h1><article><strong>{first.title}</strong><p>{first.subtitle}</p></article></section>;`,
      '}',
    ].join('\n'),
    'pages/Detail.tsx': [
      "import { SEED_FEED } from '../data/seed';",
      'export default function Detail() {',
      '  const first = SEED_FEED[0];',
      `  return <section><h1>${s.labels.detail}</h1><h2>{first.title}</h2><p>{first.subtitle}</p></section>;`,
      '}',
    ].join('\n'),
    'pages/Create.tsx': simplePage('Create', s.labels.create, `Create a new item in ${s.appName}`),
    'pages/Progress.tsx': [
      "import { SEED_PROGRESS } from '../data/seed';",
      'export default function Progress() {',
      '  const latest = SEED_PROGRESS[0];',
      `  return <section><h1>${s.labels.progress}</h1><p>Current value: {latest.value}</p><p>{latest.goalMet ? 'Goal met' : 'In progress'}</p></section>;`,
      '}',
    ].join('\n'),
    'pages/Profile.tsx': [
      "import { APP_CONFIG } from '../config/app';",
      'export default function Profile() {',
      `  return <section><h1>${s.labels.profile}</h1><p>{APP_CONFIG.name}</p><p>{APP_CONFIG.tagline}</p></section>;`,
      '}',
    ].join('\n'),
  };
}

function fileMarkers(files) {
  return Object.entries(files)
    .map(([path, content]) => `<<<FILE: ${path}>>>\n${content}\n<<<END>>>`)
    .join('\n');
}

function architectPlan(s, files) {
  return JSON.stringify({
    appName: s.appName,
    skeleton: 'mobile-app',
    summary: `${s.appName} mobile product for ${s.goal.toLowerCase()}.`,
    fileTree: Object.fromEntries(Object.keys(files).map(path => [`src/${path}`, `Required mobile product slot for ${s.appName}`])),
    pages: [
      { path: '/onboarding', name: 'Onboarding', file: 'src/pages/Onboarding.tsx', purpose: `Introduce ${s.appName}` },
      { path: '/home', name: 'Home', file: 'src/pages/Home.tsx', purpose: 'Primary product overview' },
      { path: '/detail/:id', name: 'Detail', file: 'src/pages/Detail.tsx', purpose: 'Inspect a product item' },
      { path: '/create', name: 'Create', file: 'src/pages/Create.tsx', purpose: 'Create a product item' },
      { path: '/progress', name: 'Progress', file: 'src/pages/Progress.tsx', purpose: 'Show progress toward the user goal' },
      { path: '/profile', name: 'Profile', file: 'src/pages/Profile.tsx', purpose: 'Show product preferences' },
    ],
    contextContract: 'Use the existing mobile AppContext and skeleton-owned navigation. Do not replace App.tsx or shared shell components.',
    dataModel: `${s.item.kind} item plus progress entry`,
  });
}

function planResponse(s) {
  return JSON.stringify({
    appName: s.appName,
    summary: `${s.appName}: ${s.goal}`,
    pages: ['Onboarding', 'Home', 'Detail', 'Create', 'Progress', 'Profile'],
    steps: [
      { id: 'think', label: 'Define the mobile product journey' },
      { id: 'architect', label: 'Map product slots onto the mobile skeleton' },
      { id: 'code', label: 'Generate the product delta' },
      { id: 'save', label: 'Compile and promote the preview' },
    ],
    assumptions: ['Use the existing mobile shell and bottom navigation'],
  });
}

function legacyArchitectResponse(s) {
  return JSON.stringify({
    appName: s.appName,
    description: s.goal,
    theme: 'clean-mobile',
    targetUser: 'Consumer mobile user',
    productStrategy: { coreAction: s.goal, retentionLoop: 'Return daily', businessModel: 'freemium', paywall: { needed: false, trigger: '', lockedFeature: '', upgradeMessage: '', surface: 'inline' } },
    userJourney: { onboarding: { needed: true, reason: 'Capture the user goal', steps: ['goal'], completionAction: 'Open Home' }, firstSession: 'Complete onboarding and see product data.', returningSession: 'Open the latest product state.' },
    layout: { type: 'mobile', navigation: 'bottom-tabs', primaryColor: 'system accent' },
    pages: [
      { path: '/onboarding', name: 'Onboarding', file: 'pages/Onboarding.tsx', purpose: 'Capture the goal', isMainScreen: false, showInNav: false, guard: { type: 'none' }, uiSpec: 'One focused mobile onboarding step', keyElements: ['Goal'] },
      { path: '/home', name: 'Home', file: 'pages/Home.tsx', purpose: 'Primary overview', isMainScreen: true, showInNav: true, guard: { type: 'none' }, uiSpec: 'Mobile overview', keyElements: ['Current item'] },
    ],
    authFlow: { type: 'none', reason: 'Prototype', localFirst: true, comment: 'Use local state' },
    dataModel: { entities: [{ name: 'Item', fields: 'id, title, subtitle' }], seedData: { needed: true, reason: 'Show useful initial state', examples: [s.item.title] }, sharedState: 'existing AppContext' },
    uxPatterns: { emptyStates: true, loadingSkeletons: true, searchAndFilter: false, onboarding: true, swipeActions: false, pullToRefresh: false, hapticFeedback: false, animations: 'gentle' },
    responsiveness: { primaryDevice: 'mobile', mobileFirst: true, maxWidth: 'mobile' },
    criticalUiRules: ['Keep the mobile skeleton shell', 'Use product-specific data', 'Make primary actions visible'],
    shadcnComponents: [],
    icons: [],
  });
}

function responderFor(s) {
  const files = buildDelta(s);
  const markers = fileMarkers(files);
  const plan = planResponse(s);
  const protoArchitect = architectPlan(s, files);
  const legacyArchitect = legacyArchitectResponse(s);
  const artifact = JSON.stringify({ artifact: { entry: 'src/pages/Home.tsx', dependencies: [], files: Object.entries(files).map(([path, content]) => ({ path: `src/${path}`, content })) } });
  const tech = JSON.stringify({ technicalBlueprint: { appShell: { routingStrategy: 'Use existing mobile skeleton routes', stateStrategy: 'Use existing AppContext plus local screen state', persistenceStrategy: 'Use skeleton storage contract', guardStrategy: 'Use skeleton onboarding guard' }, fileStructure: Object.keys(files).map(file => ({ file, purpose: 'Product delta slot' })), componentContracts: [], dataFlow: { entities: [s.item.kind] }, criticalPaths: ['Onboarding to Home', 'Home to Detail', 'Create', 'Progress'], implementationRisks: ['Do not replace skeleton shell'] } });
  const analysis = JSON.stringify({ productType: 'mobile-app', branchBriefSummary: s.goal, firstPassCapabilities: ['onboarding', 'home', 'create', 'progress', 'profile'], deferredCapabilities: [], implementationOrder: ['config', 'data', 'screens'], openQuestions: [] });

  return (systemText, userText, stream) => {
    // Route JSON-producing roles before the shared skeleton header: architect prompts
    // also contain `SKELETON: Mobile App`, while coder prompts require FILE markers.
    if (systemText.includes('fixing prototype quality gate failures')) return markers;
    if (systemText.includes('Pass 2 critic')) return '[]';
    if (systemText.includes('Pass 2 implementer')) return markers;
    if (systemText.includes('senior product architect')) return protoArchitect;
    if (systemText.includes('fixing build errors')) return markers;
    if (systemText.includes('Generate a step-by-step plan')) return plan;
    if (systemText.includes('Senior Tech Lead')) return tech;
    if (systemText.includes('top-tier product founder') || systemText.includes('web developer designing a landing page')) return legacyArchitect;
    if (systemText.includes('SKELETON: Mobile App')) return markers;
    if (systemText.includes('React') || systemText.includes('developer') || userText.includes('CURRENT USER REQUEST')) return stream ? artifact : markers;
    return stream ? plan : analysis;
  };
}

function sseFromText(text) {
  return [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`, '', 'data: [DONE]', ''].join('\n');
}

async function installLLM(page, responder) {
  await page.route('**/functions/v1/llm-proxy', async route => {
    let proxyBody = {};
    let llmBody = {};
    try {
      proxyBody = JSON.parse(route.request().postData() || '{}');
      llmBody = JSON.parse(proxyBody.body || '{}');
    } catch {}
    const messages = Array.isArray(llmBody.messages) ? llmBody.messages : [];
    const toText = value => Array.isArray(value) ? value.map(part => part?.text || '').join('\n') : String(value || '');
    const systemText = toText(messages[0]?.content);
    const userText = toText(messages[messages.length - 1]?.content);
    const stream = Boolean(proxyBody.stream || llmBody.stream);
    const text = responder(systemText, userText, stream);
    if (!stream) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFromText(text) });
  });
}

async function expectProductionArtifactStudio(page) {
  const response = await page.request.get(`${BASE_URL}/studio`);
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).not.toContain('/@vite/client');
  expect(html).not.toContain('/src/main.tsx');
  expect(html).toMatch(/\/assets\/[^"']+\.js/);
}

async function openEngine(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.evaluate(() => localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[title="System Engine"]').click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function typeInChat(page, text) {
  const textarea = page.locator('textarea').first();
  await textarea.fill(text);
  await textarea.press('Enter');
  const sendBtn = textarea.locator('xpath=following-sibling::button[not(@disabled) and not(@title="Stop generation")]').first();
  if (await sendBtn.count()) await sendBtn.click({ force: true });
}

function timelineLines(logs) {
  return logs.filter(line => line.includes('[preview-timeline]'));
}

async function serializeConsoleMessage(msg) {
  const values = await Promise.all(msg.args().map(async arg => {
    try {
      const value = await arg.jsonValue();
      return typeof value === 'string' ? value : JSON.stringify(value);
    } catch { return String(arg); }
  }));
  return values.join(' ');
}

async function runScenario(page, scenario) {
  const logs = [];
  page.on('console', msg => {
    serializeConsoleMessage(msg).then(line => logs.push(line)).catch(() => logs.push(msg.text()));
  });

  await installLLM(page, responderFor(scenario));
  await page.addInitScript(() => {
    localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY', '1');
    localStorage.setItem('OPENROUTER_API_KEY', 'e2e-mobile-agent-key');
    localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({ provider: 'openrouter', modelId: 'openai/gpt-4o-mini' }));
    localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
  });

  await expectProductionArtifactStudio(page);
  await openEngine(page);
  await typeInChat(page, scenario.prompt);
  await page.locator('[data-testid="surface-choice-btn-app"]').click({ timeout: 5_000 }).catch(() => {});
  await page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last().click({ timeout: 3_000 }).catch(() => {});

  await expect(async () => {
    const followUpConfirm = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
    if (await followUpConfirm.isVisible().catch(() => false)) {
      await followUpConfirm.click();
      return;
    }
    expect(timelineLines(logs).some(line => line.includes('controller_compiling'))).toBe(true);
  }).toPass({ timeout: LIVE_FLOW_TIMEOUT, intervals: [500, 1_000, 2_000] });

  let buildId = null;
  for (const line of [...timelineLines(logs)].reverse()) {
    const match = line.match(/"buildId"\s*:\s*"([\w-]+)"/);
    if (match) { buildId = match[1]; break; }
  }
  const previewSession = await page.evaluate(() => sessionStorage.getItem('AIC_PREVIEW_SESSION_ID')).catch(() => null);
  await expect(async () => {
    if (!buildId) throw new Error('buildId not found');
    const response = await page.request.get(`${BASE_URL}/api/preview/${buildId}/status`, { headers: { 'X-Preview-Session': previewSession ?? '' } });
    if (response.status() === 404) throw new Error('build status not registered yet');
    const body = await response.json();
    expect(body?.status).toBe('ready');
  }).toPass({ timeout: LIVE_FLOW_TIMEOUT, intervals: [2_000, 3_000, 5_000] });

  const iframe = page.locator('[data-testid="preview-iframe"]');
  await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(page.frameLocator('[data-testid="preview-iframe"]').locator('body')).toContainText(`Welcome to ${scenario.appName}`, { timeout: FLOW_TIMEOUT });
  await expect(async () => {
    expect(timelineLines(logs).some(line => line.includes('generation_preview_ownership_released'))).toBe(true);
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 5_000] });
}

test.describe('mobile full agent generation matrix', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(LIVE_FLOW_TIMEOUT);
  for (const scenario of SCENARIOS) {
    test(`${scenario.appName}: architect → coder → gates → compile → iframe @mobile-agent-generation`, async ({ page }) => {
      await runScenario(page, scenario);
    });
  }
});

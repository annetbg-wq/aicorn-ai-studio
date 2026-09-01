// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;
const LIVE_FLOW_TIMEOUT = 300_000;

const SCENARIO = {
  prompt: 'Build a super app called Life Atlas that combines personal finance, daily wellness and short Spanish learning in one shared mobile app with one profile and one navigation shell',
  appName: 'Life Atlas',
  goal: 'Balance money, wellness and learning in one place',
};

function buildDelta() {
  return {
    'config/app.ts': [
      "export const APP_CONFIG = { name: 'Life Atlas', tagline: 'Money, wellness and learning in one place', freeActionLimit: 5, storagePrefix: 'life-atlas.agent.v1' } as const;",
      'export const STORAGE_KEYS = {',
      '  profile: `${APP_CONFIG.storagePrefix}.profile`,',
      '  theme: `${APP_CONFIG.storagePrefix}.theme`,',
      '  feed: `${APP_CONFIG.storagePrefix}.feed`,',
      '  progress: `${APP_CONFIG.storagePrefix}.progress`,',
      '} as const;',
    ].join('\n'),
    'config/routes.ts': [
      "export const ROUTES = { onboarding: '/onboarding', home: '/home', finance: '/finance', wellness: '/wellness', learning: '/learning', profile: '/profile' } as const;",
      'export type RouteKey = keyof typeof ROUTES;',
    ].join('\n'),
    'config/navigation.ts': [
      "import { Home as HomeIcon, WalletCards, HeartPulse, GraduationCap, User } from 'lucide-react';",
      "import { ROUTES } from './routes';",
      'export const BOTTOM_TABS = [',
      "  { to: ROUTES.home, label: 'Home', icon: HomeIcon },",
      "  { to: ROUTES.finance, label: 'Money', icon: WalletCards },",
      "  { to: ROUTES.wellness, label: 'Wellness', icon: HeartPulse, primary: true },",
      "  { to: ROUTES.learning, label: 'Learn', icon: GraduationCap },",
      "  { to: ROUTES.profile, label: 'Profile', icon: User },",
      '] as const;',
    ].join('\n'),
    'data/types.ts': [
      "import type { ThemeChoice } from '@/config/theme';",
      'export type ID = string;',
      "export type SubscriptionPlan = 'free' | 'pro' | 'team';",
      "export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';",
      "export type DomainId = 'finance' | 'wellness' | 'learning';",
      'export interface UserProfile { id: ID; name: string; goal: string; createdAt: string; onboardingComplete: boolean; plan: SubscriptionPlan; usageCount: number; }',
      'export interface DomainItem { id: ID; domain: DomainId; title: string; value: number; unit: string; }',
      'export interface PricingTier { id: SubscriptionPlan; name: string; pricePerMonth: number; highlight?: boolean; features: readonly string[]; }',
      'export type { ThemeChoice };',
    ].join('\n'),
    'data/seed.ts': [
      "import type { DomainItem, PricingTier } from './types';",
      "export const DOMAIN_ITEMS: DomainItem[] = [",
      "  { id: 'expense-groceries', domain: 'finance', title: 'Groceries', value: 64, unit: 'USD' },",
      "  { id: 'water-today', domain: 'wellness', title: 'Water', value: 5, unit: 'glasses' },",
      "  { id: 'spanish-session', domain: 'learning', title: 'Spanish practice', value: 10, unit: 'minutes' },",
      '];',
      "export const PRICING_TIERS: readonly PricingTier[] = [",
      "  { id: 'free', name: 'Free', pricePerMonth: 0, features: ['Core domains'] },",
      "  { id: 'pro', name: 'Pro', pricePerMonth: 12, highlight: true, features: ['Unlimited domain actions'] },",
      "  { id: 'team', name: 'Family', pricePerMonth: 20, features: ['Shared household goals'] },",
      '];',
    ].join('\n'),
    'pages/Onboarding.tsx': [
      "import { useState } from 'react';",
      "import { useApp } from '@/context/AppContext';",
      'export default function Onboarding() {',
      '  const { completeOnboarding } = useApp();',
      "  const [name, setName] = useState('Alex');",
      "  return <section><h1>Welcome to Life Atlas</h1><p>Set one shared goal across money, wellness and learning.</p><input aria-label=\"Your name\" value={name} onChange={event => setName(event.target.value)} /><button type=\"button\" onClick={() => completeOnboarding({ name, goal: 'Balance money, wellness and learning' })}>Start</button></section>;",
      '}',
    ].join('\n'),
    'pages/Home.tsx': [
      "import { Link } from 'react-router-dom';",
      "import { DOMAIN_ITEMS } from '../data/seed';",
      "import { ROUTES } from '../config/routes';",
      'export default function Home() {',
      "  return <section><h1>Life Atlas — life hub</h1><p>Three domains, one daily view.</p><p>Signals: {DOMAIN_ITEMS.length}</p><nav><Link to={ROUTES.finance}>Open Money</Link><Link to={ROUTES.wellness}>Open Wellness</Link><Link to={ROUTES.learning}>Open Learning</Link></nav></section>;",
      '}',
    ].join('\n'),
    'pages/Finance.tsx': [
      "import { useMemo, useState } from 'react';",
      "import { DOMAIN_ITEMS } from '../data/seed';",
      'export default function Finance() {',
      "  const seed = useMemo(() => DOMAIN_ITEMS.filter(item => item.domain === 'finance'), []);",
      '  const [entries, setEntries] = useState(() => [...seed]);',
      "  const [amount, setAmount] = useState('18');",
      '  const total = entries.reduce((sum, item) => sum + item.value, 0);',
      "  return <section><h1>Money</h1><p>Tracked spending: ${total}</p><input aria-label=\"Expense amount\" value={amount} onChange={event => setAmount(event.target.value)} /><button type=\"button\" onClick={() => setEntries(current => [...current, { id: `local-${current.length}`, domain: 'finance', title: 'Quick expense', value: Number(amount) || 0, unit: 'USD' }])}>Add expense</button><p>Money entries: {entries.length}</p></section>;",
      '}',
    ].join('\n'),
    'pages/Wellness.tsx': [
      "import { useState } from 'react';",
      "import { DOMAIN_ITEMS } from '../data/seed';",
      'export default function Wellness() {',
      "  const seed = DOMAIN_ITEMS.find(item => item.domain === 'wellness');",
      '  const [water, setWater] = useState(seed?.value ?? 0);',
      "  return <section><h1>Wellness</h1><p>Hydration today: {water} glasses</p><button type=\"button\" onClick={() => setWater(value => value + 1)}>Log water</button><p>{water >= 8 ? 'Hydration goal reached' : `${8 - water} glasses to goal`}</p></section>;",
      '}',
    ].join('\n'),
    'pages/Learning.tsx': [
      "import { useMemo, useState } from 'react';",
      "import { DOMAIN_ITEMS } from '../data/seed';",
      'export default function Learning() {',
      "  const minutes = useMemo(() => DOMAIN_ITEMS.filter(item => item.domain === 'learning').reduce((sum, item) => sum + item.value, 0), []);",
      '  const [sessions, setSessions] = useState(1);',
      "  return <section><h1>Learning</h1><p>Practice minutes: {minutes}</p><p>Sessions today: {sessions}</p><button type=\"button\" onClick={() => setSessions(value => value + 1)}>Complete practice</button></section>;",
      '}',
    ].join('\n'),
    'pages/Profile.tsx': [
      "import { useState } from 'react';",
      "import { useApp } from '@/context/AppContext';",
      'export default function Profile() {',
      '  const { profile } = useApp();',
      '  const [digest, setDigest] = useState(true);',
      "  return <section><h1>Profile</h1><p>Shared profile: {profile.name}</p><p>{profile.goal}</p><button type=\"button\" onClick={() => setDigest(value => !value)}>Daily digest: {digest ? 'On' : 'Off'}</button></section>;",
      '}',
    ].join('\n'),
  };
}

function fileMarkers(files) {
  return Object.entries(files).map(([path, content]) => `<<<FILE: ${path}>>>\n${content}\n<<<END>>>`).join('\n');
}

function architectPlan(files) {
  return JSON.stringify({
    appName: SCENARIO.appName,
    skeleton: 'super-app',
    summary: 'One shared mobile super app across finance, wellness and learning.',
    fileTree: Object.fromEntries(Object.keys(files).map(path => [`src/${path}`, 'Required super-app product slot'])),
    pages: [
      { path: '/onboarding', name: 'Onboarding', file: 'src/pages/Onboarding.tsx', purpose: 'Create one shared profile' },
      { path: '/home', name: 'Home', file: 'src/pages/Home.tsx', purpose: 'Cross-domain hub' },
      { path: '/finance', name: 'Finance', file: 'src/pages/Finance.tsx', purpose: 'Track money and spending' },
      { path: '/wellness', name: 'Wellness', file: 'src/pages/Wellness.tsx', purpose: 'Track daily wellness' },
      { path: '/learning', name: 'Learning', file: 'src/pages/Learning.tsx', purpose: 'Run short learning sessions' },
      { path: '/profile', name: 'Profile', file: 'src/pages/Profile.tsx', purpose: 'Shared profile and preferences' },
    ],
    contextContract: 'Use the existing super-app AppContext and shared BottomTabs shell. Keep domains inside one application root.',
    dataModel: 'Shared profile plus finance, wellness and learning domain items.',
  });
}

function planResponse() {
  return JSON.stringify({
    appName: SCENARIO.appName,
    summary: SCENARIO.goal,
    pages: ['Onboarding', 'Home', 'Money', 'Wellness', 'Learning', 'Profile'],
    steps: [
      { id: 'think', label: 'Define the shared cross-domain journey' },
      { id: 'architect', label: 'Map domains onto the super-app skeleton' },
      { id: 'code', label: 'Generate only the product delta' },
      { id: 'save', label: 'Compile and promote the multi-domain preview' },
    ],
    assumptions: ['One shared profile and shell across all domains'],
  });
}

function legacyArchitectResponse() {
  return JSON.stringify({
    appName: SCENARIO.appName,
    description: SCENARIO.goal,
    theme: 'clean-mobile',
    targetUser: 'Consumer who wants one daily life hub',
    productStrategy: { coreAction: 'Move between life domains and take a useful action', retentionLoop: 'Return daily across domains', businessModel: 'freemium', paywall: { needed: false, trigger: '', lockedFeature: '', upgradeMessage: '', surface: 'inline' } },
    userJourney: { onboarding: { needed: true, reason: 'Create shared identity', steps: ['name', 'goal'], completionAction: 'Open Home' }, firstSession: 'Complete onboarding and explore all three domains.', returningSession: 'Open the shared hub and continue any domain.' },
    layout: { type: 'mobile', navigation: 'bottom-tabs', primaryColor: 'system accent' },
    pages: [
      { path: '/onboarding', name: 'Onboarding', file: 'pages/Onboarding.tsx', purpose: 'Shared identity', isMainScreen: false, showInNav: false, guard: { type: 'none' }, uiSpec: 'Focused onboarding', keyElements: ['Name', 'Goal'] },
      { path: '/home', name: 'Home', file: 'pages/Home.tsx', purpose: 'Domain hub', isMainScreen: true, showInNav: true, guard: { type: 'none' }, uiSpec: 'Cross-domain hub', keyElements: ['Money', 'Wellness', 'Learning'] },
      { path: '/finance', name: 'Finance', file: 'pages/Finance.tsx', purpose: 'Money action', isMainScreen: true, showInNav: true, guard: { type: 'none' }, uiSpec: 'Finance domain', keyElements: ['Spending', 'Add expense'] },
      { path: '/wellness', name: 'Wellness', file: 'pages/Wellness.tsx', purpose: 'Wellness action', isMainScreen: true, showInNav: true, guard: { type: 'none' }, uiSpec: 'Wellness domain', keyElements: ['Hydration', 'Log water'] },
      { path: '/learning', name: 'Learning', file: 'pages/Learning.tsx', purpose: 'Learning action', isMainScreen: true, showInNav: true, guard: { type: 'none' }, uiSpec: 'Learning domain', keyElements: ['Practice', 'Complete session'] },
    ],
    authFlow: { type: 'none', reason: 'Prototype', localFirst: true, comment: 'Use shared local profile' },
    dataModel: { entities: [{ name: 'DomainItem', fields: 'id, domain, title, value, unit' }], seedData: { needed: true, reason: 'Show all domains', examples: ['Groceries', 'Water', 'Spanish practice'] }, sharedState: 'existing AppContext' },
    uxPatterns: { emptyStates: true, loadingSkeletons: true, searchAndFilter: false, onboarding: true, swipeActions: false, pullToRefresh: false, hapticFeedback: false, animations: 'gentle' },
    responsiveness: { primaryDevice: 'mobile', mobileFirst: true, maxWidth: 'mobile' },
    criticalUiRules: ['Keep the super-app shared shell', 'Keep all domains reachable', 'Use real state-changing actions'],
    shadcnComponents: [],
    icons: [],
  });
}

function responder() {
  const files = buildDelta();
  const markers = fileMarkers(files);
  const plan = planResponse();
  const protoArchitect = architectPlan(files);
  const legacyArchitect = legacyArchitectResponse();
  const artifact = JSON.stringify({ artifact: { entry: 'src/pages/Home.tsx', dependencies: [], files: Object.entries(files).map(([path, content]) => ({ path: `src/${path}`, content })) } });
  const tech = JSON.stringify({ technicalBlueprint: { appShell: { routingStrategy: 'Use existing super-app routes', stateStrategy: 'One shared AppContext plus local domain state', persistenceStrategy: 'Use skeleton storage contract', guardStrategy: 'Use shared onboarding guard' }, fileStructure: Object.keys(files).map(file => ({ file, purpose: 'Super-app product delta slot' })), componentContracts: [], dataFlow: { entities: ['DomainItem'], domains: ['finance', 'wellness', 'learning'] }, criticalPaths: ['Onboarding to Home', 'Home to Finance', 'Home to Wellness', 'Home to Learning'], implementationRisks: ['Do not split domains into separate app roots'] } });
  const analysis = JSON.stringify({ productType: 'super-app', branchBriefSummary: SCENARIO.goal, firstPassCapabilities: ['onboarding', 'domain-hub', 'finance', 'wellness', 'learning', 'profile'], deferredCapabilities: [], implementationOrder: ['config', 'data', 'domain screens'], openQuestions: [] });

  return (systemText, userText, stream) => {
    if (systemText.includes('fixing prototype quality gate failures')) return markers;
    if (systemText.includes('Pass 2 critic')) return '[]';
    if (systemText.includes('Pass 2 implementer')) return markers;
    if (systemText.includes('senior product architect')) return protoArchitect;
    if (systemText.includes('fixing build errors')) return markers;
    if (systemText.includes('Generate a step-by-step plan')) return plan;
    if (systemText.includes('Senior Tech Lead')) return tech;
    if (systemText.includes('top-tier product founder') || systemText.includes('web developer designing a landing page')) return legacyArchitect;
    if (systemText.includes('SKELETON: Super App')) return markers;
    if (systemText.includes('React') || systemText.includes('developer') || userText.includes('CURRENT USER REQUEST')) return stream ? artifact : markers;
    return stream ? plan : analysis;
  };
}

function sseFromText(text) {
  return [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`, '', 'data: [DONE]', ''].join('\n');
}

async function installLLM(page) {
  const respond = responder();
  await page.route('**/functions/v1/llm-proxy', async route => {
    let proxyBody = {};
    let llmBody = {};
    try { proxyBody = JSON.parse(route.request().postData() || '{}'); llmBody = JSON.parse(proxyBody.body || '{}'); } catch {}
    const messages = Array.isArray(llmBody.messages) ? llmBody.messages : [];
    const toText = value => Array.isArray(value) ? value.map(part => part?.text || '').join('\n') : String(value || '');
    const systemText = toText(messages[0]?.content);
    const userText = toText(messages[messages.length - 1]?.content);
    const stream = Boolean(proxyBody.stream || llmBody.stream);
    const text = respond(systemText, userText, stream);
    if (!stream) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseFromText(text) });
  });
}

async function openEngine(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.evaluate(() => localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[title="System Engine"]').click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10_000 });
}

function timelineLines(logs) { return logs.filter(line => line.includes('[preview-timeline]')); }

async function runSuperAppCanary(page) {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  await installLLM(page);
  await page.addInitScript(() => {
    localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY', '1');
    localStorage.setItem('OPENROUTER_API_KEY', 'e2e-super-app-key');
    localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({ provider: 'openrouter', modelId: 'openai/gpt-4o-mini' }));
    localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
  });

  await openEngine(page);
  const textarea = page.locator('textarea').first();
  await textarea.fill(SCENARIO.prompt);
  await textarea.press('Enter');
  const sendBtn = textarea.locator('xpath=following-sibling::button[not(@disabled) and not(@title="Stop generation")]').first();
  if (await sendBtn.count()) await sendBtn.click({ force: true });
  await page.locator('[data-testid="surface-choice-btn-superapp"]').click({ timeout: 5_000 }).catch(() => {});
  await page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last().click({ timeout: 3_000 }).catch(() => {});

  await expect(async () => {
    const followUpConfirm = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
    if (await followUpConfirm.isVisible().catch(() => false)) { await followUpConfirm.click(); return; }
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

  const preview = page.frameLocator('[data-testid="preview-iframe"]');
  await expect(preview.locator('body')).toContainText('Welcome to Life Atlas', { timeout: FLOW_TIMEOUT });
  await preview.getByRole('button', { name: 'Start' }).click();
  await expect(preview.getByRole('heading', { name: 'Life Atlas — life hub' })).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(preview.locator('body')).toContainText('Three domains, one daily view.');

  await preview.getByText('Money', { exact: true }).last().click();
  await expect(preview.getByRole('heading', { name: 'Money' })).toBeVisible();
  await preview.getByRole('textbox', { name: 'Expense amount' }).fill('25');
  await preview.getByRole('button', { name: 'Add expense' }).click();
  await expect(preview.locator('body')).toContainText('Money entries: 2');

  await preview.getByText('Wellness', { exact: true }).last().click();
  await expect(preview.getByRole('heading', { name: 'Wellness' })).toBeVisible();
  await preview.getByRole('button', { name: 'Log water' }).click();
  await expect(preview.locator('body')).toContainText('Hydration today: 6 glasses');

  await preview.getByText('Learn', { exact: true }).last().click();
  await expect(preview.getByRole('heading', { name: 'Learning' })).toBeVisible();
  await preview.getByRole('button', { name: 'Complete practice' }).click();
  await expect(preview.locator('body')).toContainText('Sessions today: 2');

  await preview.getByText('Profile', { exact: true }).last().click();
  await expect(preview.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await preview.getByRole('button', { name: 'Daily digest: On' }).click();
  await expect(preview.getByRole('button', { name: 'Daily digest: Off' })).toBeVisible();

  await expect(async () => {
    expect(timelineLines(logs).some(line => line.includes('generation_preview_ownership_released'))).toBe(true);
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 5_000] });
}

test.describe('super-app full agent multi-domain canary', () => {
  test.setTimeout(LIVE_FLOW_TIMEOUT);
  test('Life Atlas: one shell → three domains → real actions @super-app-agent-canary', async ({ page }) => {
    await runSuperAppCanary(page);
  });
});

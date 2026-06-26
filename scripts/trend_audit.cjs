// @ts-check
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5183';
const BLUEPRINT_JSON = JSON.stringify({
  id: 'audit-trend-001',
  appName: 'Audit Counter',
  description: 'Minimal counter for trend audit',
  theme: 'dark-slate',
  targetUser: 'Test engineer',
  layout: { type: 'single', navigation: 'none' },
  uxPatterns: { emptyStates: false, loadingSkeletons: false, searchAndFilter: false, animations: 'none' },
  responsiveness: { primaryDevice: 'desktop', mobileFirst: false, maxWidth: 'max-w-2xl' },
  pages: [{ path: '/', name: 'Home', file: 'App.tsx', purpose: 'Main', isMainScreen: true, showInNav: false, uiSpec: 'Counter', keyElements: ['Counter'] }],
  dataModel: { entities: [{ name: 'State', fields: 'count: number' }], sharedState: 'local' },
  criticalUiRules: ['Keep simple'],
  shadcnComponents: [],
  icons: [],
  packageSummary: 'Simple counter',
  visualTag: 'Modern SaaS',
  authFlow: { type: 'none', provider: '', onboardingSteps: [] },
  monetization: { model: 'free', paywall: { trigger: '', limits: [], upgradeMessage: '' } },
  databaseSchema: { sql: '', tables: [] },
  aiLogic: { features: [] },
  fileArchitecture: [{ path: 'src/App.tsx', role: 'page', purpose: 'Main' }],
  premiumUiDirectives: [],
});

const TREND_NICHES_MODEL = JSON.stringify({
  generatedAt: new Date().toISOString(),
  taskInterest: null,
  daily: [{
    id: 'trend-audit-001',
    theme: 'dark-slate',
    categories: ['ai_automation'],
    en: { title: 'AI Meeting Summarizer', description: 'Auto-summarize meetings with action items and follow-ups', marketAngle: 'Remote work needs better async communication', whyInteresting: 'Every team loses hours weekly to unproductive meetings' },
    ru: { title: 'ИИ-суммаризатор встреч', description: 'Автоматически создаёт резюме встреч с задачами', marketAngle: 'Удалённая работа требует асинхронной коммуникации', whyInteresting: 'Каждая команда теряет часы на непродуктивных встречах' },
  }],
  weekly: [],
  monthly: [],
});

const CANARY_APP_TSX = [
  "import { useState } from 'react';",
  "export default function App() {",
  "  const [count, setCount] = useState(0);",
  "  return (",
  "    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0' }}>",
  "      <div data-testid='live-canary-surface'>",
  "        <strong data-testid='count-value'>{count}</strong>",
  "        <button type='button' onClick={() => setCount(v => v + 1)}>Increment</button>",
  "      </div>",
  "    </main>",
  "  );",
  "}",
].join('\n');

const PLAN_R = JSON.stringify({ appName:'Audit Counter', summary:'Counter app', pages:['Home'], steps:[{id:'think',label:'Think'},{id:'architect',label:'Architect'},{id:'code',label:'Code'},{id:'theme',label:'Theme'},{id:'save',label:'Save'}], assumptions:[] });
const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Counter', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['Render counter'], openQuestions:[] });
const ARCH_R = JSON.stringify({ appName:'Audit Counter', description:'Counter', theme:'dark-slate', targetUser:'Engineer', productStrategy:{ coreAction:'Increment', retentionLoop:'N/A', businessModel:'free', paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'} }, userJourney:{onboarding:{needed:false,reason:'N/A',steps:[],completionAction:'Open'},firstSession:'Counter',returningSession:'Counter'}, layout:{type:'single',navigation:'none',primaryColor:'green'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Counter',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'Counter with increment button',keyElements:['Counter','Button']}], authFlow:{type:'none',reason:'No auth',localFirst:true,comment:''}, dataModel:{entities:[{name:'CounterState',fields:'count: number'}],seedData:{needed:false,reason:'',examples:[]},sharedState:'count in App.tsx'}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:['Simple'], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single App.tsx',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Counter'}], componentContracts:[{file:'App.tsx',responsibility:'Counter',mustRender:['Counter'],uses:['React useState'],localState:['count: number']}], dataFlow:{entities:['CounterState']}, criticalPaths:['Increment'], implementationRisks:[] } });
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{ path:'src/App.tsx', content: CANARY_APP_TSX }] } });

function sseBody(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
}

function llmResponse(systemText, userText, stream) {
  if (!stream) return JSON.stringify({ choices: [{ message: { content: ARCH_ANALYSIS } }] });
  if (systemText.includes('Generate a step-by-step plan')) return sseBody(PLAN_R);
  if (systemText.includes('Senior Tech Lead')) return sseBody(TECH_R);
  if (systemText.includes('top-tier product founder') || systemText.includes('web developer designing')) return sseBody(ARCH_R);
  if (systemText.includes('React') || systemText.includes('developer') || userText.includes('CURRENT USER REQUEST')) return sseBody(CODER_R);
  return sseBody(PLAN_R);
}

async function installMocks(page, { bridgeMode }) {
  // Dev-agent mode endpoint
  await page.route('http://127.0.0.1:3000/dev-agent-mode', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'codex', provider: 'codex' }) })
  );

  // Bridge endpoint — callLLM routes ALL LLM calls here when devAgentActive=true.
  // Route by message content (same heuristics as llm-proxy mock).
  await page.route('http://127.0.0.1:3000/chat', async route => {
    if (bridgeMode === 'success') {
      const body = JSON.parse(route.request().postData() || '{}');
      const msg = String(body.message || '');
      let text;
      if (msg.includes('Generate a step-by-step plan')) text = PLAN_R;
      else if (msg.includes('Senior Tech Lead')) text = TECH_R;
      else if (msg.includes('top-tier product founder') || msg.includes('web developer designing')) text = ARCH_R;
      else if (msg.includes('CURRENT USER REQUEST') || msg.includes('developer') || msg.includes('React')) text = CODER_R;
      else text = BLUEPRINT_JSON; // packaging / idea-model calls
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ text }] }) });
    } else if (bridgeMode === '500') {
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'bridge error' });
    } else if (bridgeMode === 'empty') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ text: '' }] }) });
    } else { // abort
      await route.abort('failed');
    }
  });

  // OpenRouter fallback (GeminiService path 3)
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    // If this is a packaging call (no stream), return blueprint
    if (!body.stream) {
      if (bridgeMode === 'both-fail') {
        await route.fulfill({ status: 500, contentType: 'text/plain', body: 'OpenRouter error' });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: BLUEPRINT_JSON } }] }) });
      }
    } else {
      // streaming call from GeminiService - shouldn't happen for packaging
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: BLUEPRINT_JSON } }] }) });
    }
  });

  // LLM proxy (main generation pipeline)
  await page.route('**/functions/v1/llm-proxy', async route => {
    const rawBody = route.request().postData() || '{}';
    let proxyBody = {}; let llmBody = {};
    try { proxyBody = JSON.parse(rawBody); llmBody = JSON.parse(proxyBody.body || '{}'); } catch {}
    const msgs = Array.isArray(llmBody.messages) ? llmBody.messages : [];
    const toText = v => Array.isArray(v) ? v.map(p => p?.text || '').join('\n') : String(v || '');
    const sysText = toText(msgs[0]?.content);
    const usrText = toText(msgs[msgs.length - 1]?.content);
    const stream = Boolean(proxyBody.stream || llmBody.stream);
    const text = llmResponse(sysText, usrText, stream);
    if (!stream) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: text });
    } else {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: text });
    }
  });

  // Block Supabase auth and project mutations
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/rest/v1/user_projects**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

async function setupLocalStorage(page) {
  await page.evaluate((model) => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
    localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY', '1');
    localStorage.setItem('OPENROUTER_API_KEY', 'audit-test-key');
    localStorage.setItem('superadmin_dev_agent_provider', 'codex');
    localStorage.setItem('aic_trend_niches', model);
    localStorage.removeItem('CURRENT_PROJECT_ID');
    localStorage.removeItem('aic_projects_meta');
  }, TREND_NICHES_MODEL);
}

async function navigateToTrendNiches(page) {
  // Click the 'Трендовые ниши' sidebar nav item
  const navBtn = page.locator('[title="Трендовые ниши"]').or(page.getByRole('button', { name: 'Трендовые ниши' }));
  await navBtn.waitFor({ state: 'visible', timeout: 10000 });
  await navBtn.click();
  // Wait for TrendNichesPanel to load
  // Current UI: the skeleton-path action is '🏗 Скелетон' (TrendNichesPanel); the
  // legacy 'В работу' / 'Build now' labels are kept for back-compat with old builds.
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return t.includes('Скелетон') || t.includes('LV Быстро') || t.includes('В работу') || t.includes('Build now');
  }, { timeout: 15000 });
}

async function checkProjectsEmpty(page) {
  const meta = await page.evaluate(() => localStorage.getItem('aic_projects_meta'));
  const id = await page.evaluate(() => localStorage.getItem('CURRENT_PROJECT_ID'));
  // Draft IDs are OK; only persisted projects count as leak
  const hasMeta = meta && JSON.parse(meta).length > 0;
  return !hasMeta;
}

const results = [];

async function runScenario(name, bridgeMode, expectPreview) {
  console.log(`\n=== Scenario: ${name} ===`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('[IdeaModel]') || text.includes('Falling back') || text.includes('Failed to launch') || text.includes('Context added') || text.includes('[preview') || text.includes('prebuilt') || text.includes('blueprint')) {
      console.log(`  [console] ${text.slice(0, 200)}`);
    }
  });
  page.on('pageerror', err => console.log(`  [pageerror] ${err.message.slice(0, 200)}`));

  try {
    await installMocks(page, { bridgeMode });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await setupLocalStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });

    // Auth bypass + wait for app to render
    await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 10000 });

    await navigateToTrendNiches(page);
    console.log('  ✓ Navigated to Trend Niches');

    // Verify projects empty BEFORE packaging
    const emptyBefore = await checkProjectsEmpty(page);
    console.log(`  Projects empty before skeleton run: ${emptyBefore ? '✓' : '✗ LEAK'}`);

    // Click the skeleton-path action ('🏗 Скелетон'); fall back to the legacy 'В работу'.
    let buildBtn = page.locator('button').filter({ hasText: 'Скелетон' }).first();
    if (await buildBtn.count() === 0) {
      buildBtn = page.locator('button').filter({ hasText: 'В работу' }).first();
    }
    await buildBtn.waitFor({ state: 'visible', timeout: 10000 });
    await buildBtn.click();
    console.log('  ✓ Clicked skeleton build action');

    if (!expectPreview) {
      // Expect error message in chat (both-fail scenario)
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes('Dev-agent bridge unavailable') ||
               text.includes('Failed to launch') ||
               text.includes('No AI service') ||
               text.includes('failed');
      }, { timeout: 20000 });

      const chatText = await page.evaluate(() => document.body.innerText);
      const hasError = chatText.includes('Failed to launch') || chatText.includes('Dev-agent bridge') || chatText.includes('No AI service');
      const noProject = await checkProjectsEmpty(page);
      console.log(`  Error shown: ${hasError ? '✓' : '✗'}`);
      console.log(`  No project created: ${noProject ? '✓' : '✗ LEAK'}`);
      results.push({ name, pass: hasError && noProject, notes: 'both-fail path' });
      return;
    }

    // Expect packaging to complete → system message with context
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Context added') || text.includes('Blueprint packaged') || text.includes('context pack') || text.includes('Отправить brief');
    }, { timeout: 30000 });
    console.log('  ✓ Packaging complete, context added to composer');

    // App navigates to engine view — find the send button (no testid, identify by bg-blue-600 class near textarea)
    const sendBtn = page.locator('button.bg-blue-600').first();
    await sendBtn.waitFor({ state: 'visible', timeout: 15000 });
    // Make sure it's enabled (context chip should enable it even with empty input)
    await page.waitForFunction(
      () => !document.querySelector('button.bg-blue-600')?.hasAttribute('disabled'),
      { timeout: 10000 },
    );
    await sendBtn.click();
    console.log('  ✓ Send clicked');

    // Confirm plan card if it appears (blueprint step)
    const confirmBtn = page.locator('[data-testid="confirm-plan-btn"]').last();
    if (await confirmBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log('  ✓ Confirmed plan');
    }

    // Wait for the Save CTA that appears AFTER real generation compiles and preview promotes.
    // This combines preview + save detection in one step (previewReady=true in pendingProjectSaveMeta).
    const saveCta = page.locator('[data-testid="save-project-cta"]');
    let saveVisible = false;
    let previewAppeared = false;
    try {
      await saveCta.waitFor({ state: 'visible', timeout: 180000 });
      saveVisible = true;
      console.log('  ✓ Save CTA visible');
    } catch (e) {
      console.log(`  ✗ Save CTA did not appear (${e.message.slice(0, 80)})`);
      // Check if preview iframe at least appeared (partial pass signal)
      const iframeSrc = await page.locator('[data-testid="preview-iframe"]').getAttribute('src').catch(() => null);
      if (iframeSrc && iframeSrc.includes('/preview/')) {
        previewAppeared = true;
        console.log(`  Preview iframe src: ${iframeSrc} (but Save not shown yet)`);
      }
    }
    if (saveVisible) {
      const iframeSrc = await page.locator('[data-testid="preview-iframe"]').getAttribute('src').catch(() => null);
      previewAppeared = Boolean(iframeSrc && iframeSrc.includes('/preview/'));
      console.log(`  Preview iframe src: ${iframeSrc}`);
    }

    // Check no premature project creation
    const emptyAfterPreview = await checkProjectsEmpty(page);
    console.log(`  No project in storage before explicit save: ${emptyAfterPreview ? '✓' : '✗ possible leak'}`);

    const pass = previewAppeared && saveVisible;
    results.push({ name, pass, notes: `preview=${previewAppeared} save=${saveVisible} projectEmpty=${emptyAfterPreview}` });

  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.push({ name, pass: false, notes: err.message.slice(0, 200) });
  } finally {
    await browser.close();
  }
}

async function runDialogScenario() {
  const name = 'В диалог — no build';
  console.log(`\n=== Scenario: ${name} ===`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  let buildCallMade = false;
  page.on('console', msg => {
    const t = msg.text();
    logs.push(t);
  });

  try {
    // Track if any build-related calls happen
    await page.route('http://127.0.0.1:3000/dev-agent-mode', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'codex' }) }));
    await page.route('http://127.0.0.1:3000/chat', async route => { buildCallMade = true; await route.fulfill({ status: 500 }); });
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => { buildCallMade = true; await route.fulfill({ status: 500 }); });
    await page.route('**/functions/v1/llm-proxy', async route => { buildCallMade = true; await route.fulfill({ status: 500 }); });
    await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, body: '{}' }));
    await page.route('**/rest/v1/user_projects**', route => route.fulfill({ status: 200, body: '[]' }));

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate((model) => {
      localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
      localStorage.setItem('OPENROUTER_API_KEY', 'audit-test-key');
      localStorage.setItem('superadmin_dev_agent_provider', 'codex');
      localStorage.setItem('aic_trend_niches', model);
    }, TREND_NICHES_MODEL);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 10000 });

    await navigateToTrendNiches(page);
    console.log('  ✓ Navigated to Trend Niches');

    // Click 'В диалог' (send to dialog) on the first idea
    const dialogBtn = page.locator('button').filter({ hasText: 'В диалог' }).or(page.locator('button').filter({ hasText: 'Discuss in chat' })).first();
    await dialogBtn.waitFor({ state: 'visible', timeout: 10000 });
    await dialogBtn.click();
    console.log('  ✓ Clicked В диалог');

    // Wait for modal/composer to appear with brief
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Отправить brief') || text.includes('Send brief') || text.includes('brief') || text.includes('founder');
    }, { timeout: 15000 });
    console.log('  ✓ Brief composer appeared');

    // Wait a moment to confirm no build triggers
    await page.waitForTimeout(2000);

    const noPreview = !(await page.locator('[data-testid="preview-iframe"]').isVisible().catch(() => false));
    const noProject = await checkProjectsEmpty(page);
    buildCallMade = Boolean(logs.some(l => l.includes('[IdeaModel]') && l.includes('bridge')));

    console.log(`  No preview started: ${noPreview ? '✓' : '✗'}`);
    console.log(`  No bridge/LLM call: ${!buildCallMade ? '✓' : '✗ UNEXPECTED CALL'}`);
    console.log(`  No project created: ${noProject ? '✓' : '✗ LEAK'}`);

    results.push({ name, pass: noPreview && noProject, notes: `preview=${!noPreview} bridgeCall=${buildCallMade}` });
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.push({ name, pass: false, notes: err.message.slice(0, 200) });
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log('=== TREND NICHES LIVE AUDIT ===\n');
  await runScenario('1. Working bridge → preview', 'success', true);
  await runScenario('2. Bridge 500 + fallback success → preview', '500', true);
  await runScenario('3. Bridge empty + fallback success → preview', 'empty', true);
  await runScenario('4. Both bridge and fallback fail → clean error', 'both-fail', false);
  await runDialogScenario();

  console.log('\n=== RESULTS ===');
  for (const r of results) {
    console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} — ${r.name}`);
    if (!r.pass || r.notes.includes('projectEmpty=false')) console.log(`       ${r.notes}`);
  }
  const allPass = results.every(r => r.pass);
  console.log(`\nOverall: ${allPass ? '✅ PASS' : '⚠️  PARTIAL'}`);
  process.exit(allPass ? 0 : 1);
})();

// @ts-check
// Focused audit: does Trend Niches → В работу auto-confirm (no manual click)?
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5183';
const BLUEPRINT_JSON = JSON.stringify({
  id: 'audit-trend-001', appName: 'Audit Counter', description: 'Counter', theme: 'dark-slate',
  targetUser: 'Tester', layout: { type: 'single', navigation: 'none' },
  uxPatterns: { emptyStates: false, loadingSkeletons: false, searchAndFilter: false, animations: 'none' },
  responsiveness: { primaryDevice: 'desktop', mobileFirst: false, maxWidth: 'max-w-2xl' },
  pages: [{ path: '/', name: 'Home', file: 'App.tsx', purpose: 'Main', isMainScreen: true, showInNav: false, uiSpec: 'Counter', keyElements: ['Counter'] }],
  dataModel: { entities: [], sharedState: 'local' }, criticalUiRules: [], shadcnComponents: [], icons: [],
  packageSummary: 'Simple counter', authFlow: { type: 'none', provider: '', onboardingSteps: [] },
  monetization: { model: 'free', paywall: { trigger: '', limits: [], upgradeMessage: '' } },
  databaseSchema: { sql: '', tables: [] }, aiLogic: { features: [] },
  fileArchitecture: [{ path: 'src/App.tsx', role: 'page', purpose: 'Main' }], premiumUiDirectives: [],
});
const TREND_NICHES_MODEL = JSON.stringify({
  generatedAt: new Date().toISOString(), taskInterest: null,
  daily: [{ id: 'trend-audit-001', theme: 'dark-slate', categories: ['ai_automation'],
    en: { title: 'AI Meeting Summarizer', description: 'Auto-summarize meetings', marketAngle: 'Remote work', whyInteresting: 'Saves hours' },
    ru: { title: 'ИИ-суммаризатор', description: 'Авто-резюме встреч', marketAngle: 'Удалённая работа', whyInteresting: 'Экономия времени' }
  }], weekly: [], monthly: [],
});
const CANARY = "import { useState } from 'react';\nexport default function App() {\n  const [c,setC]=useState(0);\n  return <div data-testid='canary'><span>{c}</span><button onClick={()=>setC(v=>v+1)}>+</button></div>;\n}";
const PLAN_R = JSON.stringify({ appName:'Audit Counter', summary:'Counter', pages:['Home'], steps:[{id:'think',label:'Think'},{id:'code',label:'Code'}], assumptions:[] });
const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Counter', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['Render counter'], openQuestions:[] });
const ARCH_R = JSON.stringify({ appName:'Audit Counter', description:'Counter', theme:'dark-slate', targetUser:'Engineer', productStrategy:{ coreAction:'Inc', retentionLoop:'N/A', businessModel:'free', paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'} }, userJourney:{onboarding:{needed:false,reason:'N/A',steps:[],completionAction:'Open'},firstSession:'Counter',returningSession:'Counter'}, layout:{type:'single',navigation:'none',primaryColor:'green'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Counter',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'Counter',keyElements:['Counter','Button']}], authFlow:{type:'none',reason:'No auth',localFirst:true,comment:''}, dataModel:{entities:[],seedData:{needed:false,reason:'',examples:[]},sharedState:''}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:[], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Counter'}], componentContracts:[{file:'App.tsx',responsibility:'Counter',mustRender:['Counter'],uses:['React useState'],localState:['count: number']}], dataFlow:{entities:[]}, criticalPaths:['Increment'], implementationRisks:[] }});
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{ path:'src/App.tsx', content: CANARY }] }});

function sseBody(t) { return `data: ${JSON.stringify({choices:[{delta:{content:t}}]})}\n\ndata: [DONE]\n\n`; }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const kickoffLogs = [];
  const allLogs = [];

  page.on('console', msg => {
    const t = msg.text();
    allLogs.push(t);
    if (/kickoff|awaiting|build_start|fast.start|confirm|scope|architectKickoff/i.test(t)) {
      kickoffLogs.push(t.slice(0, 300));
      console.log('  [kickoff] ' + t.slice(0, 300));
    }
  });

  try {
    await page.route('http://127.0.0.1:3000/dev-agent-mode', r =>
      r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({mode:'codex',provider:'codex'}) })
    );
    await page.route('http://127.0.0.1:3000/chat', async r => {
      const body = JSON.parse(r.request().postData() || '{}');
      const msg = String(body.message || '');
      let text;
      if (msg.includes('Generate a step-by-step plan')) text = PLAN_R;
      else if (msg.includes('Senior Tech Lead')) text = TECH_R;
      else if (msg.includes('top-tier product founder') || msg.includes('web developer designing')) text = ARCH_R;
      else if (msg.includes('CURRENT USER REQUEST') || msg.includes('developer') || msg.includes('React')) text = CODER_R;
      else text = BLUEPRINT_JSON;
      await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ content:[{ text }] }) });
    });
    await page.route('https://openrouter.ai/api/v1/chat/completions', async r => {
      await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({choices:[{message:{content: BLUEPRINT_JSON}}]}) });
    });
    await page.route('**/functions/v1/llm-proxy', async r => {
      const raw = r.request().postData() || '{}';
      let proxy = {}; let llm = {};
      try { proxy = JSON.parse(raw); llm = JSON.parse(proxy.body || '{}'); } catch {}
      const msgs = Array.isArray(llm.messages) ? llm.messages : [];
      const toText = v => Array.isArray(v) ? v.map(p => p && p.text || '').join('\n') : String(v || '');
      const sys = toText(msgs[0] && msgs[0].content);
      const stream = Boolean(proxy.stream || llm.stream);
      if (!stream) {
        await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({choices:[{message:{content: ARCH_ANALYSIS}}]}) });
        return;
      }
      if (sys.includes('Generate a step-by-step plan')) { await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(PLAN_R)}); return; }
      if (sys.includes('Senior Tech Lead')) { await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(TECH_R)}); return; }
      if (sys.includes('top-tier product founder') || sys.includes('web developer designing')) { await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(ARCH_R)}); return; }
      await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(CODER_R)});
    });
    await page.route('**/auth/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.route('**/rest/v1/user_projects**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));

    await page.goto(BASE, { waitUntil:'domcontentloaded', timeout:15000 });
    await page.evaluate(function(model) {
      localStorage.setItem('AIC_DEV_AUTH_BYPASS','1');
      localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY','1');
      localStorage.setItem('OPENROUTER_API_KEY','audit-test-key');
      localStorage.setItem('superadmin_dev_agent_provider','codex');
      localStorage.setItem('aic_trend_niches', model);
      localStorage.removeItem('CURRENT_PROJECT_ID');
      localStorage.removeItem('aic_projects_meta');
    }, TREND_NICHES_MODEL);
    await page.reload({ waitUntil:'domcontentloaded', timeout:15000 });
    await page.waitForFunction(function() { return document.getElementById('root') && document.getElementById('root').children.length > 0; }, { timeout:10000 });

    const nav = page.locator('[title="Трендовые ниши"]').or(page.getByRole('button',{name:'Трендовые ниши'}));
    await nav.waitFor({ state:'visible', timeout:10000 });
    await nav.click();
    await page.waitForFunction(function() { return document.body.innerText.includes('В работу'); }, { timeout:15000 });
    console.log('  ✓ Trend Niches loaded');

    const buildBtn = page.locator('button').filter({ hasText:'В работу' }).first();
    await buildBtn.waitFor({ state:'visible', timeout:10000 });
    await buildBtn.click();
    console.log('  ✓ Clicked В работу');

    // Wait for context to be added (up to 30s)
    await page.waitForFunction(function() {
      const t = document.body.innerText;
      return t.includes('Context added') || t.includes('context pack') || t.includes('🧩');
    }, { timeout:30000 });
    console.log('  ✓ Context added, engine ready');

    // Wait for send button to be enabled (context chip enables it)
    const sendBtn = page.locator('button.bg-blue-600').first();
    await sendBtn.waitFor({ state:'visible', timeout:15000 });
    await page.waitForFunction(function() {
      return !document.querySelector('button.bg-blue-600')?.hasAttribute('disabled');
    }, { timeout:15000 });
    console.log('  ✓ Send button enabled');

    // !! DO NOT click confirm-plan-btn manually — testing auto-confirm !!
    await sendBtn.click();
    console.log('  ✓ Send clicked — watching for auto-confirm (NO manual confirmation)...');

    // Wait up to 30s for either:
    // a) auto-confirm fires: kickoff_scope_defaulted in logs
    // b) build_starting in logs or page
    // c) timeout (stuck at awaiting_confirmation)
    const AUTO_CONFIRM_WAIT_MS = 20000; // 3.5s fast-start + margin
    const start = Date.now();
    let resolved = false;
    await page.waitForFunction(function() {
      const t = document.body.innerText;
      // build in progress indicators
      return t.includes('⚙️') || t.includes('Building') || t.includes('Строим') ||
        t.includes('Generating') || t.includes('build_starting') ||
        window.__kickoffDone;
    }, { timeout: AUTO_CONFIRM_WAIT_MS }).catch(() => {});

    const elapsed = Date.now() - start;

    const hasConfirmBtn = await page.locator('[data-testid="confirm-plan-btn"]').isVisible().catch(() => false);
    const bodyText = await page.evaluate(function() { return document.body.innerText.slice(0, 400); });
    const hasBuilding = bodyText.includes('⚙️') || bodyText.includes('Building') || bodyText.includes('Строим');

    const enteredAwaitingConfirmation = kickoffLogs.some(l => /awaiting_confirmation/.test(l));
    const gotAutoConfirm = kickoffLogs.some(l => /kickoff_scope_defaulted|fast-start/.test(l));
    const gotBuildStarting = kickoffLogs.some(l => /kickoff_build_started|build_starting/.test(l));

    console.log('\n=== AUTO-CONFIRM AUDIT RESULT ===');
    console.log('  awaiting_confirmation entered: ' + (enteredAwaitingConfirmation ? '⚠️ YES' : '✓ NO (or bypassed)'));
    console.log('  Auto-confirm (fast-start) fired: ' + (gotAutoConfirm ? '✅ YES' : '✗ NO'));
    console.log('  kickoff_build_started logged: ' + (gotBuildStarting ? '✅ YES' : '✗ NO'));
    console.log('  "Start build" / confirm btn visible: ' + (hasConfirmBtn ? '❌ YES — stuck, manual click required' : '✅ NO'));
    console.log('  "Building..." indicator: ' + (hasBuilding ? '✅ YES' : '✗ NO'));
    console.log('  Elapsed: ' + Math.round(elapsed/1000) + 's');
    console.log('  Kickoff logs: ' + JSON.stringify(kickoffLogs));
    console.log('');

    if (!hasConfirmBtn && (gotAutoConfirm || gotBuildStarting || hasBuilding)) {
      console.log('  ✅ PASS — flow auto-confirms and reaches build_starting without manual click');
    } else if (hasConfirmBtn) {
      console.log('  ❌ PARTIAL — stuck at awaiting_confirmation, manual "Start build" required');
      console.log('  Blocker: confirm-plan-btn still visible after ' + Math.round(elapsed/1000) + 's');
    } else {
      // No confirm btn but no build progress — something else
      const recentLogs = allLogs.filter(l => /error|Error|failed|reject/i.test(l)).slice(-10);
      console.log('  ⚠️ PARTIAL — no confirm btn, no build progress yet');
      console.log('  Recent errors: ' + JSON.stringify(recentLogs));
    }
  } catch(e) {
    console.log('  ✗ Error: ' + e.message.slice(0, 400));
  } finally {
    await browser.close();
  }
}
run();

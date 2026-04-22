// @ts-check
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5183';

const TREND_NICHES_MODEL = JSON.stringify({
  generatedAt: new Date().toISOString(), taskInterest: null,
  daily: [{ id: 'trend-c1', theme: 'dark-slate', categories: ['ai_automation'],
    en: { title: 'AI Meeting Summarizer', description: 'Auto-summarize meetings', marketAngle: 'Async comms', whyInteresting: 'Saves hours' },
    ru: { title: 'ИИ-суммаризатор', description: 'Авто-резюме встреч', marketAngle: 'Асинхронно', whyInteresting: 'Экономия времени' },
  }], weekly: [], monthly: [],
});

const CANARY_APP = [
  "import { useState } from 'react';",
  "export default function App() {",
  "  const [c, setC] = useState(0);",
  "  return <div data-testid='canary'><span>{c}</span><button onClick={()=>setC(v=>v+1)}>+</button></div>;",
  "}",
].join('\n');

const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Summarizer', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['render'], openQuestions:[] });
const PLAN_R = JSON.stringify({ appName:'AuditApp', summary:'s', pages:['Home'], steps:[{id:'code',label:'Code'}], assumptions:[] });
const ARCH_R = JSON.stringify({ appName:'AuditApp', description:'d', theme:'dark-slate', targetUser:'eng', productStrategy:{coreAction:'a',retentionLoop:'n',businessModel:'free',paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'}}, userJourney:{onboarding:{needed:false,reason:'',steps:[],completionAction:''},firstSession:'',returningSession:''}, layout:{type:'single',navigation:'none',primaryColor:'blue'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'counter',keyElements:['counter']}], authFlow:{type:'none',reason:'',localFirst:true,comment:''}, dataModel:{entities:[],seedData:{needed:false,reason:'',examples:[]},sharedState:''}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:[], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Main'}], componentContracts:[{file:'App.tsx',responsibility:'counter',mustRender:['counter'],uses:['useState'],localState:['c:number']}], dataFlow:{entities:[]}, criticalPaths:['inc'], implementationRisks:[] }});
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{ path:'src/App.tsx', content: CANARY_APP }] }});

function sseBody(t) { return `data: ${JSON.stringify({choices:[{delta:{content:t}}]})}\n\ndata: [DONE]\n\n`; }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const kickoffLogs = [];
  const allLogs = [];

  page.on('console', msg => {
    const t = msg.text();
    allLogs.push(t);
    if (t.includes('[Kickoff]') || t.includes('kickoff') || t.includes('awaiting_confirmation') || t.includes('build_starting') || t.includes('fast-start')) {
      kickoffLogs.push(t);
      console.log(`  [kickoff] ${t.slice(0, 250)}`);
    }
  });
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message.slice(0,200)}`));

  try {
    // Mocks
    await page.route('http://127.0.0.1:3000/dev-agent-mode', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'codex', provider: 'codex' }) })
    );
    await page.route('http://127.0.0.1:3000/chat', async r => {
      const b = JSON.parse(r.request().postData() || '{}');
      const msg = String(b.message || '');
      let text;
      if (msg.includes('Generate a step-by-step plan')) text = PLAN_R;
      else if (msg.includes('Senior Tech Lead')) text = TECH_R;
      else if (msg.includes('top-tier product founder') || msg.includes('web developer designing')) text = ARCH_R;
      else if (msg.includes('CURRENT USER REQUEST') || msg.includes('React') || msg.includes('developer')) text = CODER_R;
      else text = JSON.stringify({ id:'idea-001', appName:'Summarizer', description:'Auto-summarize', theme:'dark-slate', targetUser:'eng', layout:{type:'single',navigation:'none'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'list',keyElements:['list']}], dataModel:{entities:[],sharedState:'local'}, criticalUiRules:[], shadcnComponents:[], icons:[], fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}], premiumUiDirectives:[], uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, authFlow:{type:'none',provider:'',onboardingSteps:[]}, monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}}, databaseSchema:{sql:'',tables:[]}, aiLogic:{features:[]}, packageSummary:'Simple' });
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ text }] }) });
    });
    await page.route('https://openrouter.ai/api/v1/chat/completions', async r => {
      const b = JSON.parse(r.request().postData() || '{}');
      if (!b.stream) await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ id:'pkg-001', appName:'Summarizer', description:'d', theme:'dark-slate', targetUser:'eng', layout:{type:'single',navigation:'none'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'s',keyElements:['s']}], dataModel:{entities:[],sharedState:'local'}, criticalUiRules:[], shadcnComponents:[], icons:[], fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}], premiumUiDirectives:[], uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, authFlow:{type:'none',provider:'',onboardingSteps:[]}, monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}}, databaseSchema:{sql:'',tables:[]}, aiLogic:{features:[]}, packageSummary:'s' }) } }] }) });
      else await r.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(CODER_R) });
    });
    await page.route('**/functions/v1/llm-proxy', async r => {
      const raw = r.request().postData() || '{}';
      let proxy = {}; let llm = {};
      try { proxy = JSON.parse(raw); llm = JSON.parse(proxy.body || '{}'); } catch {}
      const msgs = Array.isArray(llm.messages) ? llm.messages : [];
      const toText = v => Array.isArray(v) ? v.map(p => p?.text||'').join('\n') : String(v||'');
      const sys = toText(msgs[0]?.content);
      const usr = toText(msgs[msgs.length-1]?.content);
      const stream = Boolean(proxy.stream || llm.stream);
      if (!stream) { await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({choices:[{message:{content: ARCH_ANALYSIS}}]}) }); return; }
      if (sys.includes('Generate a step-by-step plan')) { await r.fulfill({ status:200, contentType:'text/event-stream', body: sseBody(PLAN_R) }); return; }
      if (sys.includes('Senior Tech Lead')) { await r.fulfill({ status:200, contentType:'text/event-stream', body: sseBody(TECH_R) }); return; }
      if (sys.includes('top-tier product founder') || sys.includes('web developer designing')) { await r.fulfill({ status:200, contentType:'text/event-stream', body: sseBody(ARCH_R) }); return; }
      await r.fulfill({ status:200, contentType:'text/event-stream', body: sseBody(CODER_R) });
    });
    await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
    await page.route('**/rest/v1/user_projects**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate((model) => {
      localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
      localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY', '1');
      localStorage.setItem('OPENROUTER_API_KEY', 'audit-key');
      localStorage.setItem('superadmin_dev_agent_provider', 'codex');
      localStorage.setItem('aic_trend_niches', model);
      localStorage.removeItem('CURRENT_PROJECT_ID');
      localStorage.removeItem('aic_projects_meta');
    }, TREND_NICHES_MODEL);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 10000 });

    // Navigate to Trend Niches
    const nav = page.locator('[title="Трендовые ниши"]').or(page.getByRole('button', { name: 'Трендовые ниши' }));
    await nav.waitFor({ state: 'visible', timeout: 10000 });
    await nav.click();
    await page.waitForFunction(() => document.body.innerText.includes('В работу'), { timeout: 15000 });
    console.log('  ✓ Trend Niches loaded');

    // Click В работу
    const buildBtn = page.locator('button').filter({ hasText: 'В работу' }).first();
    await buildBtn.click();
    console.log('  ✓ Clicked В работу');

    // Wait for packaging → context added → engine view
    await page.waitForFunction(() => document.body.innerText.includes('Context added') || document.body.innerText.includes('🧩'), { timeout: 30000 });
    console.log('  ✓ Packaging done, context added');

    // Click send (blue button)
    const sendBtn = page.locator('button.bg-blue-600').first();
    await page.waitForFunction(() => !document.querySelector('button.bg-blue-600')?.hasAttribute('disabled'), { timeout: 10000 });
    await sendBtn.click();
    console.log('  ✓ Send clicked — watching kickoff states (NO manual confirm)...');

    // Wait up to 30s for automatic build_starting WITHOUT clicking confirm
    // If awaiting_confirmation is entered but auto-confirm (fast-start) fires, build_starting should follow.
    // We give 30s total (3.5s fast-start grace + generation time).
    let enteredAwaitingConfirmation = false;
    let gotScopeDefaulted = false;
    let gotBuildStarting = false;

    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return t.includes('Building') || t.includes('⚙️') || t.includes('build_starting') ||
        window.__auditDone;
    }, { timeout: 30000 }).catch(() => {});

    // Check logs collected
    enteredAwaitingConfirmation = kickoffLogs.some(l => l.includes('kickoff_waiting_for_confirmation') || l.includes('awaiting_confirmation'));
    gotScopeDefaulted = kickoffLogs.some(l => l.includes('kickoff_scope_defaulted') || l.includes('fast-start'));
    gotBuildStarting = kickoffLogs.some(l => l.includes('kickoff_build_started') || l.includes('build_starting'));

    // Also check page text
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasBuilding = bodyText.includes('Building') || bodyText.includes('⚙️') || bodyText.includes('Строим');
    const hasStartBuildBtn = bodyText.includes('Start build') || bodyText.includes('Начать сборку') || bodyText.includes('Build now');

    console.log('\n=== KICKOFF AUDIT RESULT ===');
    console.log(`  awaiting_confirmation entered: ${enteredAwaitingConfirmation ? '⚠️ YES' : '✓ NO'}`);
    console.log(`  kickoff_scope_defaulted (auto): ${gotScopeDefaulted ? '✓ YES' : '✗ NO'}`);
    console.log(`  kickoff_build_started:          ${gotBuildStarting ? '✓ YES' : '✗ NO'}`);
    console.log(`  "Start build" btn visible:      ${hasStartBuildBtn ? '⚠️ YES — manual click required' : '✓ NOT visible'}`);
    console.log(`  "Building..." in page:          ${hasBuilding ? '✓ YES' : '✗ NO'}`);
    console.log('');
    console.log(`  All kickoff logs: ${JSON.stringify(kickoffLogs.slice(0, 20))}`);
    console.log('');

    const noManualConfirmNeeded = !hasStartBuildBtn && (gotBuildStarting || hasBuilding);
    const stuck = hasStartBuildBtn || (!gotBuildStarting && !hasBuilding);

    if (noManualConfirmNeeded) {
      console.log('  ✅ PASS — flow proceeds to build_starting automatically, no manual confirmation required');
    } else if (enteredAwaitingConfirmation && gotScopeDefaulted) {
      console.log('  ✅ PASS (with grace) — awaiting_confirmation entered but auto-confirmed via fast-start');
    } else if (stuck) {
      console.log(`  ❌ PARTIAL — stuck, manual confirmation still required. Next blocker: ${hasStartBuildBtn ? '"Start build" button' : 'unknown'}`);
    } else {
      console.log('  ⚠️ PARTIAL — unclear state');
    }

  } catch(e) {
    console.log(`  ✗ Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

run();

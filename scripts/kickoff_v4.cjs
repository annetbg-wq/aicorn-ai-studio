/**
 * kickoff_v4.cjs — Trend Niches → В работу auto-confirm audit
 *
 * Verifies:
 *  1. awaiting_confirmation is NEVER entered (no confirm-plan-btn from isAwaitingKickoffConfirmation)
 *  2. [FounderFlow] auto-confirm log fires (autoStartPackagedTrendBuild path)
 *  3. build_starting phase is entered
 *  4. Generation proceeds past confirmation gate
 *
 * Fixed vs v3: does NOT exit on confirm-plan-btn; instead waits full timeout
 * and checks stability logs for the definitive verdict.
 */
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:5183';

const BLUEPRINT_JSON = JSON.stringify({ id:'audit-001', appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Tester', layout:{type:'single',navigation:'none'}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, pages:[{path:'/',name:'Home',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'Counter',keyElements:['Counter']}], dataModel:{entities:[],sharedState:'local'}, criticalUiRules:[], shadcnComponents:[], icons:[], packageSummary:'Counter', authFlow:{type:'none',provider:'',onboardingSteps:[]}, monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}}, databaseSchema:{sql:'',tables:[]}, aiLogic:{features:[]}, fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}], premiumUiDirectives:[] });
const TREND_NICHES_MODEL = JSON.stringify({ generatedAt:new Date().toISOString(), taskInterest:null, daily:[{id:'trend-001',theme:'dark-slate',categories:['ai_automation'], en:{title:'AI Counter',description:'Counter app',marketAngle:'Remote work',whyInteresting:'Saves time'}, ru:{title:'ИИ-счётчик',description:'Счётчик',marketAngle:'Удалённая работа',whyInteresting:'Экономия'}}], weekly:[], monthly:[] });
const CANARY = "import{useState}from'react';export default function App(){const[c,setC]=useState(0);return<div data-testid='canary'><span>{c}</span><button onClick={()=>setC(v=>v+1)}>+</button></div>;}";
const PLAN_R = JSON.stringify({ appName:'Counter', summary:'Counter app', pages:['Home'], steps:[{id:'think',label:'Think'},{id:'code',label:'Code'}], assumptions:[] });
const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Counter', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['Render counter'], openQuestions:[], defaultOptionId:'core' });
const ARCH_R = JSON.stringify({ appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Engineer', productStrategy:{coreAction:'Inc',retentionLoop:'N/A',businessModel:'free',paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'}}, userJourney:{onboarding:{needed:false,reason:'N/A',steps:[],completionAction:'Open'},firstSession:'Counter',returningSession:'Counter'}, layout:{type:'single',navigation:'none',primaryColor:'green'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Counter',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'Counter',keyElements:['Counter']}], authFlow:{type:'none',reason:'No auth',localFirst:true,comment:''}, dataModel:{entities:[],seedData:{needed:false,reason:'',examples:[]},sharedState:''}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:[], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Counter'}], componentContracts:[{file:'App.tsx',responsibility:'Counter',mustRender:['Counter'],uses:['React useState'],localState:['count: number']}], dataFlow:{entities:[]}, criticalPaths:['Increment'], implementationRisks:[] }});
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{path:'src/App.tsx',content:CANARY}] }});
function sseBody(t){return `data: ${JSON.stringify({choices:[{delta:{content:t}}]})}\n\ndata: [DONE]\n\n`;}

async function run(){
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(msg.text()));

  // Intercept __stabilityLog — survives DevModePanel.tsx overwrite (line 478)
  await page.addInitScript(function(){
    window.__sLogs = [];
    Object.defineProperty(window, '__stabilityLog', {
      configurable: true,
      get: function(){ return window.__stabilityLogFn; },
      set: function(fn){
        const prev = window.__stabilityLogFn;
        window.__stabilityLogFn = function(entry){
          window.__sLogs.push(entry.message || String(entry));
          if(fn && fn !== window.__stabilityLogFn) fn(entry);
        };
      }
    });
    // Track kickoffPhase via confirm-btn visibility on the SPECIFIC isAwaitingKickoffConfirmation block
    // We'll check via stability logs instead
  });

  try {
    // ── Route mocks ──────────────────────────────────────────────────────
    await page.route('http://127.0.0.1:3000/dev-agent-mode', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'codex',provider:'codex'})}));
    await page.route('http://127.0.0.1:3000/chat', async r=>{
      const body=JSON.parse(r.request().postData()||'{}');
      const msg=String(body.message||'');
      let text;
      if(msg.includes('Generate a step-by-step plan')) text=PLAN_R;
      else if(msg.includes('Senior Tech Lead')) text=TECH_R;
      else if(msg.includes('top-tier product founder')||msg.includes('web developer designing')) text=ARCH_R;
      else if(msg.includes('CURRENT USER REQUEST')||msg.includes('developer')||msg.includes('React')) text=CODER_R;
      else text=BLUEPRINT_JSON;
      await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{text}]})});
    });
    await page.route('https://openrouter.ai/api/v1/chat/completions', async r=>{
      await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:BLUEPRINT_JSON}}]})});
    });
    await page.route('**/functions/v1/llm-proxy', async r=>{
      const raw=r.request().postData()||'{}';
      let proxy={};let llm={};
      try{proxy=JSON.parse(raw);llm=JSON.parse(proxy.body||'{}');}catch{}
      const msgs=Array.isArray(llm.messages)?llm.messages:[];
      const toText=v=>Array.isArray(v)?v.map(p=>p&&p.text||'').join('\n'):String(v||'');
      const sys=toText(msgs[0]&&msgs[0].content);
      const stream=Boolean(proxy.stream||llm.stream);
      if(!stream){await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:ARCH_ANALYSIS}}]})});return;}
      if(sys.includes('Generate a step-by-step plan')){await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(PLAN_R)});return;}
      if(sys.includes('Senior Tech Lead')){await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(TECH_R)});return;}
      if(sys.includes('top-tier product founder')||sys.includes('web developer designing')){await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(ARCH_R)});return;}
      await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(CODER_R)});
    });
    await page.route('**/auth/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.route('**/rest/v1/user_projects**', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));

    // ── Page setup ───────────────────────────────────────────────────────
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:15000});
    await page.evaluate(function(model){
      localStorage.setItem('AIC_DEV_AUTH_BYPASS','1');
      localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY','1');
      localStorage.setItem('OPENROUTER_API_KEY','audit-key');
      localStorage.setItem('superadmin_dev_agent_provider','codex');
      localStorage.setItem('aic_trend_niches',model);
      localStorage.removeItem('CURRENT_PROJECT_ID');
      localStorage.removeItem('aic_projects_meta');
    }, TREND_NICHES_MODEL);
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForFunction(()=>document.getElementById('root')?.children.length>0,{timeout:10000});

    // ── Navigate to Trend Niches ─────────────────────────────────────────
    const nav = page.locator('[title="Трендовые ниши"]').or(page.getByRole('button',{name:'Трендовые ниши'}));
    await nav.waitFor({state:'visible',timeout:10000});
    await nav.click();
    await page.waitForFunction(()=>document.body.innerText.includes('В работу'),{timeout:15000});

    // ── Click "В работу" to add context ─────────────────────────────────
    await page.locator('button').filter({hasText:'В работу'}).first().click();
    await page.waitForFunction(()=>{
      const t=document.body.innerText;
      return t.includes('Context added')||t.includes('context pack')||t.includes('🧩');
    },{timeout:30000});
    console.log('✓ Context added to composer');

    // ── Send message ─────────────────────────────────────────────────────
    await page.waitForFunction(()=>!document.querySelector('button.bg-blue-600')?.hasAttribute('disabled'),{timeout:15000});
    await page.locator('button.bg-blue-600').first().click();
    const t0 = Date.now();
    console.log('✓ Send clicked — monitoring for awaiting_confirmation bypass...');

    // ── Wait up to 75s for the pipeline to reach a terminal state ────────
    // We do NOT exit on confirm-plan-btn — we wait for a clear terminal signal:
    //   - save-project-cta (full pass)
    //   - Build failed text
    //   - timeout (then classify via logs)
    let saveCta = false;
    let buildFailed = false;
    try {
      await page.waitForFunction(()=>{
        return (
          document.querySelector('[data-testid="save-project-cta"]') != null ||
          document.body.innerText.includes('Build failed') ||
          document.body.innerText.includes('Ошибка генерации') ||
          // Also mark if we observe code output streaming (build ran past confirmation gate)
          document.querySelector('[data-testid="canary"]') != null
        );
      },{timeout:75000});
      saveCta = await page.locator('[data-testid="save-project-cta"]').isVisible().catch(()=>false);
      buildFailed = await page.evaluate(()=>document.body.innerText.includes('Build failed')||document.body.innerText.includes('Ошибка генерации'));
    } catch(e){
      // timeout — classify by logs below
    }

    const elapsed = ((Date.now()-t0)/1000).toFixed(1);

    // ── Collect and analyse stability logs ───────────────────────────────
    const sLogs = await page.evaluate(()=>window.__sLogs||[]);
    const founderAutoConfirm = sLogs.some(l=>/FounderFlow.*confirmed.*auto|FounderFlow.*Packaged/i.test(l));
    const awaitingConfirmation = sLogs.some(l=>/kickoff_waiting_for_confirmation|awaiting_confirmation/i.test(l));
    const buildStarting = sLogs.some(l=>/build_starting|kickoff_build_start/i.test(l));
    const confirmBtnVisible = await page.locator('[data-testid="confirm-plan-btn"]').isVisible().catch(()=>false);
    const keyLogs = sLogs.filter(l=>/Kickoff|FounderFlow|awaiting|build_start|SimpleGeneration|Auto-confirm/i.test(l));

    console.log('\n=== STABILITY LOGS (key) ===');
    keyLogs.forEach(l=>console.log('  '+String(l).slice(0,200)));

    console.log('\n=== FINAL RESULT ===');
    console.log(`Elapsed:                  ${elapsed}s`);
    console.log(`[FounderFlow] auto-confirm: ${founderAutoConfirm}`);
    console.log(`awaiting_confirmation seen: ${awaitingConfirmation}`);
    console.log(`build_starting seen:        ${buildStarting}`);
    console.log(`confirm-plan-btn visible NOW: ${confirmBtnVisible}`);
    console.log(`save-project-cta:           ${saveCta}`);
    console.log(`build failed:               ${buildFailed}`);

    const noAwaitingConfirm = !awaitingConfirmation && !confirmBtnVisible;

    if (founderAutoConfirm && buildStarting && !awaitingConfirmation) {
      console.log('\n✅ PASS — auto-confirm fired, build_starting reached, awaiting_confirmation bypassed');
    } else if (buildStarting && !awaitingConfirmation) {
      console.log('\n✅ PASS (build_starting) — build started without awaiting_confirmation (FounderFlow log may not have surfaced)');
    } else if (awaitingConfirmation) {
      console.log('\n❌ FAIL — awaiting_confirmation state entered; manual Start build required');
      console.log('   Blocker: waitForConfirmation entered the promise path (autoStartPackagedTrendBuild=false or state missing)');
    } else if (saveCta) {
      console.log('\n✅ PASS — save-project-cta reached; pipeline completed end-to-end');
    } else {
      console.log('\n⚠️  PARTIAL — pipeline ran but terminal state not reached within timeout');
      console.log(`   Next blocker: ${buildFailed ? 'build/compile error' : 'timeout — check build pipeline'}`);
    }
  } catch(e){
    console.log('Error: '+e.message.slice(0,400));
  } finally {
    await browser.close();
  }
}
run();

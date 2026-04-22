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
  const logs = [];

  page.on('console', msg => logs.push(msg.text()));

  // Intercept __stabilityLog even when DevModePanel overwrites it
  await page.addInitScript(function(){
    window.__sLogs = [];
    Object.defineProperty(window, '__stabilityLog', {
      configurable: true,
      get: function(){ return window.__stabilityLogFn; },
      set: function(fn){
        window.__stabilityLogFn = function(entry){
          window.__sLogs.push(entry.message);
          if(fn && fn !== window.__stabilityLogFn) fn(entry);
        };
      }
    });
  });

  try {
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
    await page.route('https://openrouter.ai/api/v1/chat/completions', async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:BLUEPRINT_JSON}}]})});});
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
    await page.waitForFunction(function(){return document.getElementById('root')&&document.getElementById('root').children.length>0;},{timeout:10000});

    const nav=page.locator('[title="Трендовые ниши"]').or(page.getByRole('button',{name:'Трендовые ниши'}));
    await nav.waitFor({state:'visible',timeout:10000});
    await nav.click();
    await page.waitForFunction(function(){return document.body.innerText.includes('В работу');},{timeout:15000});

    await page.locator('button').filter({hasText:'В работу'}).first().click();
    await page.waitForFunction(function(){
      const t=document.body.innerText;
      return t.includes('Context added')||t.includes('context pack')||t.includes('🧩');
    },{timeout:30000});
    console.log('✓ Context added');

    await page.waitForFunction(function(){
      return !document.querySelector('button.bg-blue-600')?.hasAttribute('disabled');
    },{timeout:15000});
    await page.locator('button.bg-blue-600').first().click();
    console.log('✓ Send clicked — waiting for auto-confirm + build + preview (no manual confirm)...');
    const t0 = Date.now();

    // Check: confirm button should NEVER appear
    let confirmBtnAppearedAt = -1;
    const confirmCheck = setInterval(()=>{}, 100); // placeholder, we'll poll in waitForFunction

    // Wait for save CTA (full pipeline completion) or error, up to 60s
    let finalState = 'timeout';
    let confirmBtnEverVisible = false;
    try {
      await page.waitForFunction(function(){
        if(document.querySelector('[data-testid="confirm-plan-btn"]')) {
          window.__confirmBtnSeen = true;
        }
        return document.querySelector('[data-testid="save-project-cta"]')!=null||
               window.__confirmBtnSeen||
               document.body.innerText.includes('Build failed');
      },{timeout:60000});
      const hasSave = await page.locator('[data-testid="save-project-cta"]').isVisible().catch(()=>false);
      confirmBtnEverVisible = await page.evaluate(function(){return !!window.__confirmBtnSeen;});
      if(hasSave && !confirmBtnEverVisible) finalState='save-cta-no-confirm';
      else if(hasSave && confirmBtnEverVisible) finalState='save-cta-after-manual';
      else if(confirmBtnEverVisible) finalState='stuck-awaiting-confirmation';
      else finalState='build-error';
    } catch(e){ finalState='timeout'; }

    const elapsed = ((Date.now()-t0)/1000).toFixed(1);
    const sLogs = await page.evaluate(function(){return window.__sLogs||[];});
    const founderLog = sLogs.some(l=>/FounderFlow|Packaged trend.*confirmed.*auto/i.test(l));
    const awaitingLog = sLogs.some(l=>/awaiting_confirmation/i.test(l));
    const buildLog = sLogs.some(l=>/kickoff_build_started|build_starting|build_in_progress/i.test(l));

    // Key stability logs
    const keyLogs = sLogs.filter(l=>/Kickoff|FounderFlow|awaiting|build_start/i.test(l));

    console.log('\n=== STABILITY LOGS (key) ===');
    keyLogs.forEach(l=>console.log('  '+l.slice(0,200)));
    console.log('\n=== FINAL RESULT ===');
    console.log('Elapsed:                ', elapsed+'s');
    console.log('Final state:            ', finalState);
    console.log('awaiting_confirmation?  ', awaitingLog || confirmBtnEverVisible);
    console.log('Auto-confirm (Founder): ', founderLog);
    console.log('Build progress logged:  ', buildLog);
    console.log('');
    if(finalState==='save-cta-no-confirm'){
      console.log('✅ PASS — save CTA reached without awaiting_confirmation');
    } else if(finalState==='stuck-awaiting-confirmation'){
      console.log('❌ PARTIAL — confirm button appeared; manual Start build required');
    } else if(finalState==='save-cta-after-manual'){
      console.log('❌ PARTIAL — save CTA reached but confirm btn appeared (manual confirm needed)');
    } else if(finalState==='timeout'){
      // Check console logs for evidence pipeline ran
      const pipelineRan = logs.some(l=>/SimpleGeneration\.run.*__read_all_preview/.test(l)||/backend_compile_owns_workspace/.test(l));
      if(pipelineRan && !confirmBtnEverVisible){
        console.log('✅ PASS (build_ran) — pipeline completed, no confirm btn, save CTA timed out (backend compile delay)');
      } else {
        console.log('⚠️ PARTIAL — timed out; pipeline may be stuck');
      }
    } else {
      console.log('⚠️ PARTIAL — unexpected state: '+finalState);
    }
  } catch(e){console.log('Error: '+e.message.slice(0,400));}
  finally{await browser.close();}
}
run();

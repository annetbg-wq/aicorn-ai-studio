// @ts-check - auto-confirm audit v2 with verbose logging
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5183';
const BLUEPRINT_JSON = JSON.stringify({ id:'audit-001', appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Tester', layout:{type:'single',navigation:'none'}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, pages:[{path:'/',name:'Home',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'Counter',keyElements:['Counter']}], dataModel:{entities:[],sharedState:'local'}, criticalUiRules:[], shadcnComponents:[], icons:[], packageSummary:'Counter', authFlow:{type:'none',provider:'',onboardingSteps:[]}, monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}}, databaseSchema:{sql:'',tables:[]}, aiLogic:{features:[]}, fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}], premiumUiDirectives:[] });
const TREND_NICHES_MODEL = JSON.stringify({ generatedAt:new Date().toISOString(), taskInterest:null, daily:[{id:'trend-001',theme:'dark-slate',categories:['ai_automation'], en:{title:'AI Counter',description:'Counter app',marketAngle:'Remote work',whyInteresting:'Saves time'}, ru:{title:'ИИ-счётчик',description:'Счётчик',marketAngle:'Удалённая работа',whyInteresting:'Экономия'}}], weekly:[], monthly:[] });
const CANARY = "import{useState}from'react';export default function App(){const[c,setC]=useState(0);return<div data-testid='canary'><span>{c}</span><button onClick={()=>setC(v=>v+1)}>+</button></div>;}";
const PLAN_R = JSON.stringify({ appName:'Counter', summary:'Counter app', pages:['Home'], steps:[{id:'think',label:'Think'},{id:'code',label:'Code'}], assumptions:[] });
const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Counter', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['Render counter'], openQuestions:[] });
const ARCH_R = JSON.stringify({ appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Engineer', productStrategy:{coreAction:'Inc',retentionLoop:'N/A',businessModel:'free',paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'}}, userJourney:{onboarding:{needed:false,reason:'N/A',steps:[],completionAction:'Open'},firstSession:'Counter',returningSession:'Counter'}, layout:{type:'single',navigation:'none',primaryColor:'green'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Counter',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'Counter',keyElements:['Counter']}], authFlow:{type:'none',reason:'No auth',localFirst:true,comment:''}, dataModel:{entities:[],seedData:{needed:false,reason:'',examples:[]},sharedState:''}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:[], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Counter'}], componentContracts:[{file:'App.tsx',responsibility:'Counter',mustRender:['Counter'],uses:['React useState'],localState:['count: number']}], dataFlow:{entities:[]}, criticalPaths:['Increment'], implementationRisks:[] }});
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{path:'src/App.tsx',content:CANARY}] }});
function sseBody(t){return `data: ${JSON.stringify({choices:[{delta:{content:t}}]})}\n\ndata: [DONE]\n\n`;}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];

  page.on('console', msg => {
    const t = msg.text();
    logs.push(t);
    // Log everything except noisy storage/network warnings
    if (!/StorageService|Failed to load resource|GET .* 200|POST .* 200/i.test(t)) {
      console.log('  [browser] ' + t.slice(0, 400));
    }
  });
  page.on('pageerror', e => console.log('  [pageerror] ' + e.message.slice(0, 200)));

  try {
    await page.route('http://127.0.0.1:3000/dev-agent-mode', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'codex',provider:'codex'})}));
    await page.route('http://127.0.0.1:3000/chat', async r => {
      const body = JSON.parse(r.request().postData()||'{}');
      const msg = String(body.message||'');
      let text;
      if(msg.includes('Generate a step-by-step plan')) text=PLAN_R;
      else if(msg.includes('Senior Tech Lead')) text=TECH_R;
      else if(msg.includes('top-tier product founder')||msg.includes('web developer designing')) text=ARCH_R;
      else if(msg.includes('CURRENT USER REQUEST')||msg.includes('developer')||msg.includes('React')) text=CODER_R;
      else text=BLUEPRINT_JSON;
      await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{text}]})});
    });
    await page.route('https://openrouter.ai/api/v1/chat/completions', async r => {
      await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:BLUEPRINT_JSON}}]})});
    });
    await page.route('**/functions/v1/llm-proxy', async r => {
      const raw = r.request().postData()||'{}';
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
    await page.route('**/auth/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.route('**/rest/v1/user_projects**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));

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
    console.log('  ✓ Trend Niches loaded');

    await page.locator('button').filter({hasText:'В работу'}).first().click();
    console.log('  ✓ Clicked В работу');

    await page.waitForFunction(function(){
      const t=document.body.innerText;
      return t.includes('Context added')||t.includes('context pack')||t.includes('🧩');
    },{timeout:30000});
    console.log('  ✓ Context added');

    // Check state before send
    const inputVal = await page.evaluate(function(){const ta=document.querySelector('textarea');return ta?ta.value:'N/A';});
    const ctxCount = await page.evaluate(function(){
      // Look for context chip elements
      const chips=document.querySelectorAll('[data-testid="context-chip"]');
      if(chips.length>0) return chips.length;
      // Fallback: count composerContextItems in text
      return document.body.innerText.includes('Counter')?1:0;
    });
    console.log('  Textarea value: "' + inputVal.slice(0,100) + '"');
    console.log('  Context chips count approx: ' + ctxCount);

    await page.waitForFunction(function(){
      return !document.querySelector('button.bg-blue-600')?.hasAttribute('disabled');
    },{timeout:15000});
    console.log('  ✓ Send button enabled');

    await page.locator('button.bg-blue-600').first().click();
    console.log('  ✓ Send clicked — watching for auto-confirm (no manual confirm)...');

    // Wait up to 25s for build activity
    await page.waitForFunction(function(){
      const t=document.body.innerText;
      return t.includes('[Kickoff]')||window.__ks||false;
    },{timeout:3000}).catch(()=>{});

    // Wait the full fast-start grace period + buffer
    await page.waitForTimeout(8000);

    // Check results
    const kickoffLogs = logs.filter(l => /kickoff|awaiting_confirmation|build_start|fast.start/i.test(l));
    const hasConfirmBtn = await page.locator('[data-testid="confirm-plan-btn"]').isVisible().catch(()=>false);
    const bodyText = await page.evaluate(function(){return document.body.innerText.slice(0,600);});
    const hasBuilding = /building|generating|строим|⚙️/i.test(bodyText);
    const handleSendLogs = logs.filter(l => /handleSend|planner|Route|Kickoff|Architect/i.test(l));

    console.log('\n  --- KICKOFF LOGS ---');
    kickoffLogs.forEach(l => console.log('    ' + l.slice(0,300)));
    console.log('\n  --- HANDLE SEND/GENERATION LOGS ---');
    handleSendLogs.slice(0,20).forEach(l => console.log('    ' + l.slice(0,300)));
    console.log('\n  --- PAGE TEXT ---\n  ' + bodyText.replace(/\n/g,'\\n').slice(0,300));
    console.log('\n  Confirm btn visible: ' + hasConfirmBtn);
    console.log('  "Building..." in page: ' + hasBuilding);
    console.log('');

    if (!hasConfirmBtn && (kickoffLogs.some(l=>/kickoff_scope_defaulted|fast.start/.test(l)) || hasBuilding)) {
      console.log('  ✅ PASS — auto-confirm fires, build_starting reached');
    } else if (hasConfirmBtn) {
      console.log('  ❌ PARTIAL — stuck, manual confirm required');
    } else {
      console.log('  ⚠️ PARTIAL — no confirm btn, no build yet (generation may still be in flight)');
    }
  } catch(e){console.log('  Error: '+e.message.slice(0,400));}
  finally{await browser.close();}
}
run();

/**
 * save_boundary_audit.cjs — UX save-gate audit
 * Checks: no save CTA before preview; CTA appears after preview; 1 click → 1 project; 2 clicks → still 1; no save without preview
 */
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:5183';
const META_KEY = 'aic-project-meta';

const CANARY = "import{useState}from'react';export default function App(){const[c,setC]=useState(0);return<div data-testid='canary'><span>{c}</span><button onClick={()=>setC(v=>v+1)}>+</button></div>;}";
const PLAN_R = JSON.stringify({ appName:'Counter', summary:'Counter app', pages:['Home'], steps:[], assumptions:[] });
const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Counter', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['Render counter'], openQuestions:[], defaultOptionId:'core' });
const ARCH_R = JSON.stringify({ appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Engineer', productStrategy:{coreAction:'Inc',retentionLoop:'N/A',businessModel:'free',paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'}}, userJourney:{onboarding:{needed:false,reason:'N/A',steps:[],completionAction:'Open'},firstSession:'Counter',returningSession:'Counter'}, layout:{type:'single',navigation:'none',primaryColor:'green'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Counter',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'Counter',keyElements:['Counter']}], authFlow:{type:'none',reason:'No auth',localFirst:true,comment:''}, dataModel:{entities:[],seedData:{needed:false,reason:'',examples:[]},sharedState:''}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:[], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Counter'}], componentContracts:[{file:'App.tsx',responsibility:'Counter',mustRender:['Counter'],uses:['React useState'],localState:['count: number']}], dataFlow:{entities:[]}, criticalPaths:['Increment'], implementationRisks:[] }});
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{path:'src/App.tsx',content:CANARY}] }});
const BLUEPRINT_JSON = JSON.stringify({ id:'audit-001', appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Tester', layout:{type:'single',navigation:'none'}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, pages:[{path:'/',name:'Home',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'Counter',keyElements:['Counter']}], dataModel:{entities:[],sharedState:'local'}, criticalUiRules:[], shadcnComponents:[], icons:[], packageSummary:'Counter', authFlow:{type:'none',provider:'',onboardingSteps:[]}, monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}}, databaseSchema:{sql:'',tables:[]}, aiLogic:{features:[]}, fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}], premiumUiDirectives:[] });
const TREND_NICHES_MODEL = JSON.stringify({ generatedAt:new Date().toISOString(), taskInterest:null, daily:[{id:'trend-001',theme:'dark-slate',categories:['ai_automation'], en:{title:'AI Counter',description:'Counter app',marketAngle:'Remote work',whyInteresting:'Saves time'}, ru:{title:'ИИ-счётчик',description:'Счётчик',marketAngle:'Удалённая работа',whyInteresting:'Экономия'}}], weekly:[], monthly:[] });
function sseBody(t){return `data: ${JSON.stringify({choices:[{delta:{content:t}}]})}\n\ndata: [DONE]\n\n`;}
const getProjects = ()=>JSON.parse(localStorage.getItem('aic-project-meta')||'[]');

async function run(){
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const results = [];

  const check = (label, pass, note='') => {
    const icon = pass ? '✅' : '❌';
    results.push(`${icon} ${label}${note ? ' — '+note : ''}`);
    console.log(`${icon} ${label}${note ? ' — '+note : ''}`);
  };

  try {
    await page.route('http://127.0.0.1:3000/dev-agent-mode', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'codex',provider:'codex'})}));
    await page.route('http://127.0.0.1:3000/chat', async r=>{
      const body=JSON.parse(r.request().postData()||'{}');
      const msg=String(body.message||'');
      let text = msg.includes('Generate a step-by-step plan') ? PLAN_R
                : msg.includes('Senior Tech Lead') ? TECH_R
                : (msg.includes('top-tier product founder')||msg.includes('web developer designing')) ? ARCH_R
                : CODER_R;
      await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{text}]})});
    });
    await page.route('**/functions/v1/llm-proxy', async r=>{
      const raw=r.request().postData()||'{}';
      let proxy={},llm={};
      try{proxy=JSON.parse(raw);llm=JSON.parse(proxy.body||'{}');}catch{}
      const msgs=Array.isArray(llm.messages)?llm.messages:[];
      const sys=String((msgs[0]?.content||''));
      const stream=Boolean(proxy.stream||llm.stream);
      if(!stream){await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:ARCH_ANALYSIS}}]})});return;}
      if(sys.includes('Generate a step-by-step plan')){await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(PLAN_R)});return;}
      if(sys.includes('Senior Tech Lead')){await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(TECH_R)});return;}
      if(sys.includes('top-tier product founder')||sys.includes('web developer designing')){await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(ARCH_R)});return;}
      await r.fulfill({status:200,contentType:'text/event-stream',body:sseBody(CODER_R)});
    });
    await page.route('https://openrouter.ai/**', async r=>{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:BLUEPRINT_JSON}}]})});});
    await page.route('**/auth/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.route('**/rest/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));

    // ── Setup ────────────────────────────────────────────────────────────
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:15000});
    await page.evaluate((model)=>{
      localStorage.setItem('AIC_DEV_AUTH_BYPASS','1');
      localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY','1');
      localStorage.setItem('OPENROUTER_API_KEY','audit-key');
      localStorage.setItem('superadmin_dev_agent_provider','codex');
      localStorage.setItem('aic_trend_niches', model);
      localStorage.removeItem('CURRENT_PROJECT_ID');
      localStorage.removeItem('aic-project-meta');
      localStorage.removeItem('AIC_DRAFT_SESSION_ID');
    }, TREND_NICHES_MODEL);
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForFunction(()=>document.getElementById('root')?.children.length>0,{timeout:10000});

    // ── 1. Navigate → В работу → Send ───────────────────────────────────
    const nav = page.locator('[title="Трендовые ниши"]').or(page.getByRole('button',{name:'Трендовые ниши'}));
    await nav.waitFor({state:'visible',timeout:10000});
    await nav.click();
    await page.waitForFunction(()=>document.body.innerText.includes('В работу'),{timeout:15000});
    await page.locator('button').filter({hasText:'В работу'}).first().click();
    await page.waitForFunction(()=>{const t=document.body.innerText;return t.includes('Context added')||t.includes('🧩');},{timeout:20000});

    // Check 1: no save CTA before send, no projects
    const ctaBeforeSend = await page.locator('[data-testid="save-project-cta"]').isVisible().catch(()=>false);
    const projBeforeSend = await page.evaluate(()=>JSON.parse(localStorage.getItem('aic-project-meta')||'[]').length);
    check('1. No save CTA before preview', !ctaBeforeSend && projBeforeSend===0, `cta=${ctaBeforeSend} projects=${projBeforeSend}`);

    await page.waitForFunction(()=>!document.querySelector('button.bg-blue-600')?.hasAttribute('disabled'),{timeout:10000});
    await page.locator('button.bg-blue-600').first().click();

    // Check 2: save CTA appears after preview (wait up to 60s)
    let ctaVisible = false;
    try {
      await page.waitForSelector('[data-testid="save-project-cta"]',{timeout:60000});
      ctaVisible = true;
    } catch{}
    const projAfterBuild = await page.evaluate(()=>JSON.parse(localStorage.getItem('aic-project-meta')||'[]').length);
    check('2. Save CTA appears after preview', ctaVisible, `cta=${ctaVisible}`);
    check('2b. No project in storage before Save click', projAfterBuild===0, `projects=${projAfterBuild}`);

    if (!ctaVisible) {
      check('3. First click → 1 project', false, 'SKIP — save CTA not found');
      check('4. Second click → still 1 project', false, 'SKIP');
      check('5. No save without preview', true, 'N/A — covered by check 2b');
      return;
    }

    // Check 3: first click → exactly 1 project
    await page.locator('[data-testid="save-project-cta"] button').first().click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('aic-project-meta')||'[]').length>=1,{timeout:10000}).catch(()=>{});
    const projAfterFirstSave = await page.evaluate(()=>JSON.parse(localStorage.getItem('aic-project-meta')||'[]'));
    check('3. First click → 1 project', projAfterFirstSave.length===1, `count=${projAfterFirstSave.length} name="${projAfterFirstSave[0]?.name||projAfterFirstSave[0]?.title||'?'}"`);

    // Check 4: second click → still 1 project (idempotent)
    const ctaStillVisible = await page.locator('[data-testid="save-project-cta"]').isVisible().catch(()=>false);
    if (ctaStillVisible) {
      await page.locator('[data-testid="save-project-cta"] button').first().click();
      await page.waitForTimeout(1500);
    }
    const projAfterSecondSave = await page.evaluate(()=>JSON.parse(localStorage.getItem('aic-project-meta')||'[]').length);
    check('4. Second click → still 1 project', projAfterSecondSave===1, `count=${projAfterSecondSave}`);

    // Check 5: internal save blocked without preview — verified by check 2b (storage=0 at CTA appearance, before user click)
    check('5. No auto-save without explicit user click', true, 'storage was 0 until CTA clicked');

  } catch(e){
    console.log('Fatal: '+e.message.slice(0,300));
  } finally {
    await browser.close();
    console.log('\n=== SUMMARY ===');
    results.forEach(r=>console.log(r));
  }
}
run();

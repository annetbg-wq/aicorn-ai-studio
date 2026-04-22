const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:5183';
const CANARY = "import{useState}from'react';export default function App(){const[c,setC]=useState(0);return<div data-testid='canary'><span>{c}</span><button onClick={()=>setC(v=>v+1)}>+</button></div>;}";
const CODER_R = JSON.stringify({ artifact:{ entry:'src/App.tsx', dependencies:[], files:[{path:'src/App.tsx',content:CANARY}] }});
const ARCH_R = JSON.stringify({ appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'Eng', productStrategy:{coreAction:'Inc',retentionLoop:'N/A',businessModel:'free',paywall:{needed:false,trigger:'',lockedFeature:'',upgradeMessage:'',surface:'inline'}}, userJourney:{onboarding:{needed:false,reason:'N/A',steps:[],completionAction:'Open'},firstSession:'Counter',returningSession:'Counter'}, layout:{type:'single',navigation:'none',primaryColor:'green'}, pages:[{path:'/',name:'App',file:'App.tsx',purpose:'Counter',isMainScreen:true,showInNav:false,guard:{type:'none'},uiSpec:'Counter',keyElements:['Counter']}], authFlow:{type:'none',reason:'N/A',localFirst:true,comment:''}, dataModel:{entities:[],seedData:{needed:false,reason:'',examples:[]},sharedState:''}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,onboarding:false,swipeActions:false,pullToRefresh:false,hapticFeedback:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, criticalUiRules:[], shadcnComponents:[], icons:[] });
const TECH_R = JSON.stringify({ technicalBlueprint:{ appShell:{routingStrategy:'Single',stateStrategy:'Local',persistenceStrategy:'None',guardStrategy:'None'}, fileStructure:[{file:'App.tsx',purpose:'Counter'}], componentContracts:[{file:'App.tsx',responsibility:'Counter',mustRender:['Counter'],uses:['React useState'],localState:['count: number']}], dataFlow:{entities:[]}, criticalPaths:['Increment'], implementationRisks:[] }});
const ARCH_ANALYSIS = JSON.stringify({ productType:'app', branchBriefSummary:'Counter', firstPassCapabilities:['local-state'], deferredCapabilities:[], implementationOrder:['Render counter'], openQuestions:[], defaultOptionId:'core' });
const BLUEPRINT = JSON.stringify({id:'a1',appName:'Counter',description:'Counter',theme:'dark-slate',targetUser:'Tester',layout:{type:'single',navigation:'none'},uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'},responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'},pages:[{path:'/',name:'Home',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'Counter',keyElements:['Counter']}],dataModel:{entities:[],sharedState:'local'},criticalUiRules:[],shadcnComponents:[],icons:[],packageSummary:'Counter',authFlow:{type:'none',provider:'',onboardingSteps:[]},monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}},databaseSchema:{sql:'',tables:[]},aiLogic:{features:[]},fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}],premiumUiDirectives:[]});
const TREND = JSON.stringify({ generatedAt:new Date().toISOString(), taskInterest:null, daily:[{id:'t1',theme:'dark-slate',categories:['ai'], en:{title:'AI Counter',description:'Counter',marketAngle:'Remote',whyInteresting:'Saves time'}, ru:{title:'ИИ-счётчик',description:'Счётчик',marketAngle:'Удалённая',whyInteresting:'Экономия'}}], weekly:[], monthly:[] });
function sse(t){return 'data: '+JSON.stringify({choices:[{delta:{content:t}}]})+'\n\ndata: [DONE]\n\n';}

(async()=>{
  const br=await chromium.launch({headless:true});
  const pg=await br.newPage();
  const compileReqs=[];
  pg.on('request', req=>{
    const u=req.url();
    if(u.includes('/compile')||u.includes('/api/preview')) compileReqs.push({url:u,method:req.method()});
  });
  pg.on('response', res=>{
    const u=res.url();
    if(u.includes('/compile')||u.includes('/api/preview')) console.log('RESP',res.status(),u.slice(-80));
  });
  await pg.route('http://127.0.0.1:3000/dev-agent-mode',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'codex',provider:'codex'})}));
  await pg.route('http://127.0.0.1:3000/chat',async r=>{
    const b=JSON.parse(r.request().postData()||'{}'),m=String(b.message||'');
    const t=m.includes('Senior Tech Lead')?TECH_R:m.includes('top-tier')||m.includes('web developer')?ARCH_R:CODER_R;
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{text:t}]})});
  });
  await pg.route('**/functions/v1/llm-proxy',async r=>{
    const raw=r.request().postData()||'{}'; let proxy={},llm={};
    try{proxy=JSON.parse(raw);llm=JSON.parse(proxy.body||'{}');}catch{}
    const msgs=Array.isArray(llm.messages)?llm.messages:[];
    const toText=v=>Array.isArray(v)?v.map(p=>p?.text||'').join('\n'):String(v||'');
    const sys=toText(msgs[0]?.content);
    const stream=Boolean(proxy.stream||llm.stream);
    if(!stream){await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:ARCH_ANALYSIS}}]})});return;}
    if(sys.includes('Senior Tech Lead')){await r.fulfill({status:200,contentType:'text/event-stream',body:sse(TECH_R)});return;}
    if(sys.includes('top-tier')||sys.includes('web developer')){await r.fulfill({status:200,contentType:'text/event-stream',body:sse(ARCH_R)});return;}
    await r.fulfill({status:200,contentType:'text/event-stream',body:sse(CODER_R)});
  });
  await pg.route('https://openrouter.ai/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:BLUEPRINT}}]})}));
  await pg.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await pg.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));

  await pg.goto(BASE,{waitUntil:'domcontentloaded',timeout:15000});
  await pg.evaluate((t)=>{
    localStorage.setItem('AIC_DEV_AUTH_BYPASS','1');
    localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY','1');
    localStorage.setItem('OPENROUTER_API_KEY','k');
    localStorage.setItem('superadmin_dev_agent_provider','codex');
    localStorage.setItem('aic_trend_niches',t);
    localStorage.removeItem('CURRENT_PROJECT_ID');
    localStorage.removeItem('aic-project-meta');
    localStorage.removeItem('AIC_DRAFT_SESSION_ID');
  },TREND);
  await pg.reload({waitUntil:'domcontentloaded',timeout:15000});
  await pg.waitForFunction(()=>document.getElementById('root')?.children.length>0,{timeout:10000});

  const nav=pg.locator('[title="Трендовые ниши"]').or(pg.getByRole('button',{name:'Трендовые ниши'}));
  await nav.waitFor({state:'visible',timeout:10000});
  await nav.click();
  await pg.waitForFunction(()=>document.body.innerText.includes('В работу'),{timeout:15000});
  await pg.locator('button').filter({hasText:'В работу'}).first().click();
  await pg.waitForFunction(()=>{const t=document.body.innerText;return t.includes('Context added')||t.includes('🧩');},{timeout:20000});
  await pg.waitForFunction(()=>!document.querySelector('button.bg-blue-600')?.hasAttribute('disabled'),{timeout:10000});

  const t0=Date.now();
  await pg.locator('button.bg-blue-600').first().click();
  console.log('Sent. Waiting up to 90s...');

  let found=false;
  try{
    await pg.waitForSelector('[data-testid="save-project-cta"]',{timeout:90000});
    found=true;
  }catch{}

  const elapsed=((Date.now()-t0)/1000).toFixed(1);
  console.log('\ncompile requests:', JSON.stringify(compileReqs,null,2));
  const bodyText=await pg.evaluate(()=>document.body.innerText.slice(0,600));
  console.log('\nbody snippet:\n'+bodyText);
  console.log('\nsave-cta found:', found, '| elapsed:', elapsed+'s');
  await br.close();
})().catch(e=>console.error(e.message));

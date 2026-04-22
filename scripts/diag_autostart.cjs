const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:5183';
const BLUEPRINT = JSON.stringify({ id:'a', appName:'Counter', description:'Counter', theme:'dark-slate', targetUser:'T', layout:{type:'single',navigation:'none'}, uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:'none'}, responsiveness:{primaryDevice:'desktop',mobileFirst:false,maxWidth:'max-w-2xl'}, pages:[{path:'/',name:'Home',file:'App.tsx',purpose:'Main',isMainScreen:true,showInNav:false,uiSpec:'C',keyElements:['C']}], dataModel:{entities:[],sharedState:'local'}, criticalUiRules:[], shadcnComponents:[], icons:[], packageSummary:'C', authFlow:{type:'none',provider:'',onboardingSteps:[]}, monetization:{model:'free',paywall:{trigger:'',limits:[],upgradeMessage:''}}, databaseSchema:{sql:'',tables:[]}, aiLogic:{features:[]}, fileArchitecture:[{path:'src/App.tsx',role:'page',purpose:'Main'}], premiumUiDirectives:[] });
const MODEL = JSON.stringify({ generatedAt:new Date().toISOString(), taskInterest:null, daily:[{id:'t1',theme:'dark-slate',categories:['ai'], en:{title:'Counter',description:'Counter',marketAngle:'RM',whyInteresting:'S'}, ru:{title:'Счётчик',description:'Счётчик',marketAngle:'У',whyInteresting:'Э'}}], weekly:[], monthly:[] });

async function run(){
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => { const t = msg.text(); logs.push(t); if(t.includes('_sendImpl]')) console.log('DIAG:', t.slice(0,500)); });
  try {
    await page.route('http://127.0.0.1:3000/dev-agent-mode', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'codex',provider:'codex'})}));
    await page.route('http://127.0.0.1:3000/chat', async r=>{ await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{text:BLUEPRINT}]})}); });
    await page.route('https://openrouter.ai/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.route('**/functions/v1/llm-proxy', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'{}'}}]})}));
    await page.route('**/auth/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.route('**/rest/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:15000});
    await page.evaluate(function(m){ localStorage.setItem('AIC_DEV_AUTH_BYPASS','1'); localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY','1'); localStorage.setItem('OPENROUTER_API_KEY','k'); localStorage.setItem('superadmin_dev_agent_provider','codex'); localStorage.setItem('aic_trend_niches',m); localStorage.removeItem('CURRENT_PROJECT_ID'); localStorage.removeItem('aic_projects_meta'); }, MODEL);
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForFunction(function(){return document.getElementById('root')&&document.getElementById('root').children.length>0;},{timeout:10000});
    const nav=page.locator('[title="Трендовые ниши"]').or(page.getByRole('button',{name:'Трендовые ниши'}));
    await nav.waitFor({state:'visible',timeout:10000});
    await nav.click();
    await page.waitForFunction(function(){return document.body.innerText.includes('В работу');},{timeout:15000});
    await page.locator('button').filter({hasText:'В работу'}).first().click();
    await page.waitForFunction(function(){const t=document.body.innerText;return t.includes('Context added')||t.includes('🧩');},{timeout:30000});
    console.log('Context added visible');
    // Read state before clicking send
    const beforeState = await page.evaluate(function(){
      const ta = document.querySelector('textarea');
      const chips = document.querySelectorAll('[data-testid="context-chip"]');
      return { input: ta ? ta.value.slice(0,80) : 'N/A', chips: chips.length };
    });
    console.log('Before send — input:', beforeState.input, '| chips:', beforeState.chips);
    await page.waitForFunction(function(){return !document.querySelector('button.bg-blue-600')?.hasAttribute('disabled');},{timeout:10000});
    await page.locator('button.bg-blue-600').first().click();
    // Wait 1s for the diagnostic log
    await page.waitForTimeout(2000);
    const diagLogs = logs.filter(l=>l.includes('_sendImpl]'));
    console.log('Diagnostic logs:', diagLogs.length);
    diagLogs.forEach(l=>console.log(' ', l.slice(0,400)));
  } catch(e){console.log('Error:',e.message);}
  finally{await browser.close();}
}
run();

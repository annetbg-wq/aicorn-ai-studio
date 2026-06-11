// Cashflow Guard Gemini diagnostic observation run
// Key injected via process.env.GEMINI_KEY_TMP — never written to any file
// Usage: GEMINI_KEY_TMP=<key> node scripts/gemini-cashflow-obs.mjs

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const GEMINI_KEY = process.env.GEMINI_KEY_TMP || '';
if (!GEMINI_KEY) { console.error('GEMINI_KEY_TMP not set — aborting'); process.exit(1); }

const BASE_URL    = 'http://localhost:5183';
const BACKEND_LOG = resolve('backend.log');
const SCREENSHOTS_DIR = resolve('cashflow-obs/gemini-run');
const TELEMETRY_OUT   = resolve('cashflow-obs/gemini-run-telemetry.json');

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const log = (...args) => {
  // Never log the key value
  const safe = args.map(a => {
    const s = typeof a === 'string' ? a : JSON.stringify(a);
    return s.replace(new RegExp(GEMINI_KEY.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'), '[REDACTED]');
  });
  console.log(new Date().toISOString(), ...safe);
};

function getBackendLogSize() { try { return readFileSync(BACKEND_LOG,'utf8').length; } catch { return 0; } }
function getBackendLogNew(pos) { try { return readFileSync(BACKEND_LOG,'utf8').slice(pos); } catch { return ''; } }

function extractTelemetry(logContent) {
  const lines = logContent.split('\n');
  const tel = {
    packagingReached:false, architectReached:false, architectCompleted:false,
    skeletonSelected:null,  skeletonContract:false, productIdentityContract:false,
    coderStarted:false,     coderCompleted:false,   http546:false,
    promptBlockSizes:null,  qualityGateRan:false,   repairRan:false,
    previewCompile:null,    buildCompleted:false,   llmRouteLog:null,
    navMode:null,
  };
  for (const line of lines) {
    if (line.includes('[llm_route]')) tel.llmRouteLog = line.slice(-400);
    if (line.includes('Skeleton') && line.includes('installed')) {
      const m = line.match(/Skeleton ([a-z\-]+) installed/); if (m) tel.skeletonSelected = m[1];
    }
    if (line.includes('SkeletonContract') || line.includes('skeleton_contract')) tel.skeletonContract = true;
    if (line.includes('ProductIdentity') || line.includes('product_identity') || line.includes('PRODUCT IDENTITY')) tel.productIdentityContract = true;
    if (line.includes('nav_mode') || line.includes('navMode')) tel.navMode = line.trim().slice(-200);
    if (line.includes('packaging') || line.includes('blueprint') || line.includes('pack_brief')) tel.packagingReached = true;
    if (line.includes('llm_call_step: architect') || line.includes('[architect]')) tel.architectReached = true;
    if (line.includes('architect') && line.includes('success')) tel.architectCompleted = true;
    if (line.includes('runCoder') || line.includes('[coder]') || line.includes('llm_call_step: coder')) tel.coderStarted = true;
    if (line.includes('coder_prompt_block_sizes') || line.includes('[coder_prompt_block_sizes]')) tel.promptBlockSizes = line.trim().slice(-400);
    if (line.includes('HTTP 546') || (line.includes('546') && line.includes('proxy'))) tel.http546 = true;
    if (line.includes('quality_gate') || line.includes('quality gate')) tel.qualityGateRan = true;
    if (line.includes('repair') || line.includes('agent_fix') || line.includes('llm_call_step: repair')) tel.repairRan = true;
    if (line.includes('build complete') || line.includes('preview_compile') || line.includes('preview compile')) { tel.previewCompile = line.trim().slice(-300); tel.buildCompleted = true; }
    if (line.includes('generation complete') || line.includes('coder complete') || (line.includes('coder') && line.includes('response_time_ms'))) tel.coderCompleted = true;
  }
  return tel;
}

function inspectWorkspace() {
  const GENERIC = ['Pipeline','Records','Leads','Accounts','Tasks','Revenue','Conversion','Activity','Workflow','Team'];
  const CASHFLOW = ['cashflow','cash flow','фриланс','freelan','invoice','инвойс','payment','платеж','client','клиент','earnings','доход','overdue','просроч','guard'];
  const result = { filesInspected:[],firstViewportClarity:false,kpiLabels:[],navigationLabels:[],genericLabelsFound:[],cashflowTermsFound:[],productTokens:[],emptyArrays:[],missingImports:[],rawSamples:{} };
  const wsBase = resolve('preview-workspace/src');
  for (const f of ['App.tsx','pages/Dashboard.tsx','pages/Records.tsx','pages/Invoices.tsx','pages/Clients.tsx','pages/Cashflow.tsx','components/Sidebar.tsx','components/KPICard.tsx']) {
    const fp = `${wsBase}/${f}`; if (!existsSync(fp)) continue;
    result.filesInspected.push(f);
    const content = readFileSync(fp,'utf8');
    result.rawSamples[f] = content.substring(0,600);
    const pt = content.match(/\bPRODUCT[_A-Z]*\b/g); if (pt) result.productTokens.push(...pt.map(t=>`${f}:${t}`));
    const ea = content.match(/=\s*\[\s*\]/g); if (ea) result.emptyArrays.push(`${f}:${ea.length} empty`);
    for (const label of GENERIC) { if (new RegExp(`["'\`]${label}["'\`]|>${label}<`,'i').test(content)) result.genericLabelsFound.push(`${f}:${label}`); }
    for (const term of CASHFLOW) { if (new RegExp(term,'i').test(content)) { result.cashflowTermsFound.push(`${f}:${term}`); break; } }
  }
  const dashPath = `${wsBase}/pages/Dashboard.tsx`;
  if (existsSync(dashPath)) {
    const dash = readFileSync(dashPath,'utf8').toLowerCase();
    result.firstViewportClarity = CASHFLOW.some(t=>dash.includes(t));
    result.kpiLabels = (dash.match(/label[:\s=]+['"`]([^'"`]+)['"`]/g)||[]).slice(0,10);
  }
  for (const p of [`${wsBase}/components/Sidebar.tsx`,`${wsBase}/App.tsx`]) {
    if (!existsSync(p)) continue;
    const nm = readFileSync(p,'utf8').match(/(?:label|name|title)[:\s=]+['"`]([^'"`]+)['"`]/gi)||[];
    result.navigationLabels.push(...nm.slice(0,8).map(m=>`${p.split('/').pop()}:${m}`));
  }
  return result;
}

async function screenshotStep(page, name) {
  const p = `${SCREENSHOTS_DIR}/${name}.png`;
  try { await page.screenshot({ path:p, fullPage:false, timeout:6000 }); } catch {}
}

async function main() {
  log('=== Cashflow Guard Gemini diagnostic run ===');
  log('provider=google modelId=google/gemini-2.5-flash sourceAuthority=user_set');

  const browser = await chromium.launch({ headless:false, slowMo:120 });
  const ctx = await browser.newContext({ viewport:{ width:1400, height:900 } });
  const page = await ctx.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text().replace(new RegExp(GEMINI_KEY.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'[REDACTED]');
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (/llm_route|coder_prompt|skeleton|product_identity|RouteAuth|llm_call/i.test(text)) log('BROWSER:', text.substring(0,200));
  });

  const networkLog = [];
  page.on('response', resp => {
    const u = resp.url(); const s = resp.status();
    if (/\/chat|\/compile|\/preview|\/api\/|\/agent-config|googleapis/.test(u)) {
      networkLog.push({ url:u.replace(/AIza[^"& ]*/g,'[REDACTED]'), status:s, ts:new Date().toISOString() });
      if (s >= 400 || u.includes('/chat')) log(`NET: ${s} ${u.substring(0,100)}`);
    }
  });

  try {
    log('Navigating to', BASE_URL);
    await page.goto(BASE_URL, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(4000);

    // Inject route config and key (key only in memory, never logged)
    await page.evaluate((key) => {
      localStorage.setItem('GOOGLE_API_KEY', key);
      localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({ provider:'google', modelId:'google/gemini-2.5-flash' }));
      localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
    }, GEMINI_KEY);
    log('Route config injected: provider=google modelId=google/gemini-2.5-flash source=user_set GOOGLE_API_KEY=set');

    // Reload to pick up new config
    await page.reload({ waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(3000);
    await screenshotStep(page, '01-loaded');

    // Login if needed
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0,500));
    log('Initial page text:', bodyText.substring(0,200));
    if (/sign in|test login|localhost/i.test(bodyText)) {
      log('Login screen — looking for Test Login button');
      for (const btn of await page.locator('button').all()) {
        const txt = await btn.innerText().catch(()=>'');
        if (/test|localhost|🧪/i.test(txt)) {
          await btn.click(); log('Clicked:', txt.substring(0,60));
          await page.waitForTimeout(3000); break;
        }
      }
    }
    await page.waitForTimeout(2000);
    await screenshotStep(page, '02-after-login');

    // Verify route still set after login/reload
    const routeCheck = await page.evaluate(() => ({
      agentBuildCfg: localStorage.getItem('AGENT_CONFIG_agent_build'),
      agentBuildSrc: localStorage.getItem('AGENT_CONFIG_agent_build__source'),
      googleKeySet: !!localStorage.getItem('GOOGLE_API_KEY'),
    }));
    log('Route after login:', JSON.stringify(routeCheck));

    // Navigate to Trending niches
    log('Looking for Trending niches...');
    for (const btn of await page.locator('button').all()) {
      const txt = await btn.innerText().catch(()=>'');
      if (/трендовые|trending|ниши/i.test(txt)) { await btn.click(); log('Clicked Trending:', txt.substring(0,40)); break; }
    }
    await page.waitForTimeout(2500);
    await screenshotStep(page, '03-trending-panel');

    // Find Cashflow Guard
    let pageText = await page.evaluate(() => document.body.innerText);
    let cashflowFound = /cashflow/i.test(pageText);
    if (!cashflowFound) {
      for (const btn of await page.locator('button, [role="tab"]').all()) {
        const txt = await btn.innerText().catch(()=>'');
        if (/банк идей|idea bank/i.test(txt)) { await btn.click(); log('Clicked Idea Bank:', txt.substring(0,30)); await page.waitForTimeout(2500); break; }
      }
      pageText = await page.evaluate(() => document.body.innerText);
      cashflowFound = /cashflow/i.test(pageText);
    }
    log(`Cashflow Guard found: ${cashflowFound}`);
    if (!cashflowFound) {
      const heads = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3,h4,[class*=title],[class*=card]')).map(e=>e.innerText.trim()).filter(t=>t.length>2&&t.length<100).slice(0,20).join(' | '));
      log('Available cards:', heads);
    }

    await screenshotStep(page, '04-before-launch');
    const logPosBefore = getBackendLogSize();

    // Click В работу on Cashflow Guard card
    const clicked = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = walker.nextNode())) if (n.textContent?.toLowerCase().includes('cashflow')) break;
      if (!n) return false;
      let el = n.parentElement;
      for (let i=0; i<14; i++) {
        if (!el) break;
        for (const btn of el.querySelectorAll('button')) {
          if (btn.innerText?.includes('В работу')) { btn.scrollIntoView({block:'center'}); btn.click(); return true; }
        }
        el = el.parentElement;
      }
      return false;
    });

    if (!clicked) {
      log('Cashflow card В работу not found — trying first В работу button');
      const fb = page.getByRole('button',{name:/В работу/i}).first();
      if (await fb.count()>0) { await fb.click(); log('Clicked fallback В работу'); }
      else { log('ERROR: No launch button found'); await screenshotStep(page,'ERROR-no-btn'); await browser.close(); return; }
    } else { log('Clicked В работу on Cashflow Guard card'); }

    const launchTime = Date.now();
    await page.waitForTimeout(5000);
    await screenshotStep(page, '05-packaging-started');

    // Wait for engine
    for (let i=0; i<30; i++) {
      const t = await page.evaluate(()=>document.body.innerText.substring(0,2000));
      if (/Идет первый проход|Live generation|Packaging|Архитектура|Дизайн-пак/i.test(t)) { log(`Engine opened after ~${i*2}s`); break; }
      await page.waitForTimeout(2000);
    }
    await screenshotStep(page,'06-engine-opened');

    // 11-minute observation loop
    const OBSERVE_MS = 660000;
    const startObs = Date.now();
    let finalStatus = 'timeout';
    let lastSnap = -99;
    let snapCount = 0;

    while (Date.now()-startObs < OBSERVE_MS) {
      await page.waitForTimeout(15000);
      const elapsed = Math.round((Date.now()-startObs)/1000);
      const txt = await page.evaluate(()=>document.body.innerText.substring(0,3000));
      const pcts = txt.match(/(\d+)%/g);
      if (pcts) log(`[${elapsed}s] Progress: ${pcts.join(', ')}`);
      const stages = txt.match(/[✓⚡○●] ?(Дизайн-пак|Архитектура|Кодирование|Финальная сборка|Превью|Packaging|Architect|Coder|Quality|Preview)/g);
      if (stages) log(`[${elapsed}s] Stages: ${stages.join(', ')}`);

      if (/Превью готово|Preview ready/i.test(txt) || (txt.includes('Финальная сборка') && !txt.includes('⚡'))) { finalStatus='success'; log(`[${elapsed}s] SUCCESS`); break; }
      if (/Quality gate failed after repair|generation_failed|Ошибка генерации|Current run failed/i.test(txt)) { finalStatus='fail_quality_gate'; log(`[${elapsed}s] FAIL quality gate`); break; }
      if (/Превью временно недоступно|Preview temporarily unavailable/i.test(txt)) { finalStatus='fail_preview_unavailable'; log(`[${elapsed}s] FAIL preview unavailable`); break; }
      if (consoleLogs.some(l=>l.includes('546'))) { finalStatus='fail_http_546'; log(`[${elapsed}s] HTTP 546 detected`); break; }

      if (elapsed-lastSnap>=55 && snapCount<14) {
        snapCount++; lastSnap=elapsed;
        await screenshotStep(page, `obs-${String(elapsed).padStart(4,'0')}s`);
        const newLog = getBackendLogNew(logPosBefore);
        const interesting = newLog.split('\n').filter(l=>/skeleton|coder|quality|preview|repair|546|block_size|contract|product_identity|identity|nav_mode/.test(l)).slice(-6);
        if (interesting.length>0) log(`[${elapsed}s] Backend:`, interesting.join(' | ').substring(0,400));
      }
    }

    log(`Final status: ${finalStatus}`);
    await screenshotStep(page, `FINAL-${finalStatus}`);

    const newLogContent = getBackendLogNew(logPosBefore);
    const telemetry = extractTelemetry(newLogContent);
    const workspaceInspection = inspectWorkspace();

    // Remove key from localStorage
    await page.evaluate(() => { localStorage.removeItem('GOOGLE_API_KEY'); });
    const keyGone = await page.evaluate(() => !localStorage.getItem('GOOGLE_API_KEY'));
    log(`GOOGLE_API_KEY removed from localStorage: ${keyGone}`);

    const result = {
      timestamp: new Date().toISOString(),
      branch: 'p2/coder-product-identity-substitution',
      provider: 'google',
      modelId: 'google/gemini-2.5-flash',
      sourceAuthority: 'user_set',
      endpointKind: 'direct_provider',
      finalStatus,
      observationDurationMs: Date.now()-launchTime,
      keyRemovedAfterRun: keyGone,
      telemetry,
      workspaceInspection,
      consoleLogs: consoleLogs.filter(l=>!l.includes('[REDACTED]')).slice(-200),
      networkLog: networkLog.slice(-50),
      logTailSnippet: newLogContent.split('\n').filter(l=>/skeleton|coder|quality|preview|repair|546|block_size|contract|product_identity|nav_mode/.test(l)).slice(-60),
    };

    writeFileSync(TELEMETRY_OUT, JSON.stringify(result,null,2));
    log('Telemetry written →', TELEMETRY_OUT);
    log('telemetry summary:', JSON.stringify(telemetry,null,2));
    log('workspace summary:', JSON.stringify({filesInspected:workspaceInspection.filesInspected,firstViewportClarity:workspaceInspection.firstViewportClarity,cashflowTermsFound:workspaceInspection.cashflowTermsFound.length,genericLabelsFound:workspaceInspection.genericLabelsFound,productTokens:workspaceInspection.productTokens,emptyArrays:workspaceInspection.emptyArrays},null,2));

    await browser.close();
    delete process.env.GEMINI_KEY_TMP;
    log('=== RUN COMPLETE ===');

  } catch (err) {
    log('ERROR:', err.message);
    try { await page.screenshot({ path:`${SCREENSHOTS_DIR}/ERROR.png` }); } catch {}
    await browser.close();
    delete process.env.GEMINI_KEY_TMP;
    throw err;
  }
}

main().catch(e=>{ console.error('Fatal:', e.message); process.exit(1); });

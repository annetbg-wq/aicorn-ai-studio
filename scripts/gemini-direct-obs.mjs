// Gemini Cashflow Guard diagnostic — direct engine launch path
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const GEMINI_KEY = process.env.GEMINI_KEY_TMP || '';
if (!GEMINI_KEY) { console.error('GEMINI_KEY_TMP not set'); process.exit(1); }

const BASE_URL = 'http://localhost:5183';
const BACKEND_LOG = resolve('backend.log');
const SCREENSHOTS_DIR = resolve('cashflow-obs/gemini-direct');
const TELEMETRY_OUT = resolve('cashflow-obs/gemini-direct-telemetry.json');
const IDEA_TEXT = 'Cashflow Guard для фрилансеров';

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const log = (...args) => {
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
    skeletonSelected:null, skeletonContract:false, productIdentityContract:false,
    coderStarted:false, coderCompleted:false, http546:false,
    promptBlockSizes:null, qualityGateRan:false, repairRan:false,
    previewCompile:null, buildCompleted:false, llmRouteLog:null, navMode:null,
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
    if (line.includes('coder_prompt_block_sizes')) tel.promptBlockSizes = line.trim().slice(-400);
    if (line.includes('HTTP 546') || (line.includes('546') && line.includes('proxy'))) tel.http546 = true;
    if (line.includes('quality_gate') || line.includes('quality gate')) tel.qualityGateRan = true;
    if (line.includes('repair') || line.includes('agent_fix') || line.includes('llm_call_step: repair')) tel.repairRan = true;
    if (line.includes('build complete') || line.includes('preview_compile')) { tel.previewCompile = line.trim().slice(-300); tel.buildCompleted = true; }
    if (line.includes('generation complete') || line.includes('coder complete') || (line.includes('coder') && line.includes('response_time_ms'))) tel.coderCompleted = true;
  }
  return tel;
}

function inspectWorkspace() {
  const GENERIC = ['Pipeline','Records','Leads','Accounts','Tasks','Revenue','Conversion','Activity','Workflow','Team'];
  const CASHFLOW = ['cashflow','cash flow','фриланс','freelan','invoice','инвойс','payment','платеж','client','клиент','earnings','доход','overdue','просроч','guard'];
  const result = { filesInspected:[],firstViewportClarity:false,kpiLabels:[],navigationLabels:[],genericLabelsFound:[],cashflowTermsFound:[],productTokens:[],emptyArrays:[] };
  const wsBase = resolve('preview-workspace/src');
  for (const f of ['App.tsx','pages/Dashboard.tsx','pages/Records.tsx','pages/Invoices.tsx','pages/Clients.tsx','pages/Cashflow.tsx','components/Sidebar.tsx','components/KPICard.tsx']) {
    const fp = `${wsBase}/${f}`; if (!existsSync(fp)) continue;
    result.filesInspected.push(f);
    const content = readFileSync(fp,'utf8');
    const pt = content.match(/\bPRODUCT[_A-Z]*\b/g); if (pt) result.productTokens.push(...pt.map(t=>`${f}:${t}`));
    const ea = content.match(/=\s*\[\s*\]/g); if (ea) result.emptyArrays.push(`${f}:${ea.length}x`);
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

async function snap(page, name) {
  try { await page.screenshot({ path:`${SCREENSHOTS_DIR}/${name}.png`, fullPage:false, timeout:6000 }); } catch {}
}

async function main() {
  log('=== Gemini Cashflow Guard direct engine run ===');
  log('provider=google modelId=google/gemini-2.5-flash sourceAuthority=user_set');
  log('Idea:', IDEA_TEXT);

  const browser = await chromium.launch({ headless:false, slowMo:100 });
  const ctx = await browser.newContext({ viewport:{ width:1400, height:900 } });
  const page = await ctx.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text().replace(new RegExp(GEMINI_KEY.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'[REDACTED]');
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (/llm_route|coder_prompt|skeleton|product_identity|RouteAuth|llm_call|generation_started|preview_compile|quality|repair/i.test(text)) log('BROWSER:', text.substring(0,250));
  });

  const networkLog = [];
  page.on('response', resp => {
    const u = resp.url(); const s = resp.status();
    if (/\/chat|\/compile|\/preview|\/api\/|\/agent-config|googleapis/.test(u)) {
      networkLog.push({ url:u.replace(/AIza[^"& ]*/g,'[REDACTED]'), status:s });
      if (s >= 400 || u.includes('/chat')) log(`NET: ${s} ${u.substring(0,100)}`);
    }
  });

  try {
    log('Navigating to', BASE_URL);
    await page.goto(BASE_URL, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(4000);

    // Inject route config
    await page.evaluate((key) => {
      localStorage.setItem('GOOGLE_API_KEY', key);
      localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({ provider:'google', modelId:'google/gemini-2.5-flash' }));
      localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
    }, GEMINI_KEY);
    log('Route injected: google/gemini-2.5-flash + user_set');

    // Reload
    await page.reload({ waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(3000);
    await snap(page, '01-loaded');

    // Login if needed
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0,500));
    if (/sign in|test login|localhost/i.test(bodyText)) {
      log('Login screen detected');
      for (const btn of await page.locator('button').all()) {
        const txt = await btn.innerText().catch(()=>'');
        if (/test|localhost|🧪/i.test(txt)) {
          await btn.click(); log('Clicked:', txt.substring(0,50));
          await page.waitForTimeout(3000); break;
        }
      }
    }
    await page.waitForTimeout(2000);
    await snap(page, '02-logged-in');

    // Click System Engine / New Project
    log('Looking for System Engine or New Project button');
    for (const btn of await page.locator('button').all()) {
      const txt = await btn.innerText().catch(()=>'');
      if (/system engine|новый проект|new project/i.test(txt)) {
        await btn.click(); log('Clicked:', txt.substring(0,50));
        await page.waitForTimeout(3000); break;
      }
    }
    await snap(page, '03-engine-opened');

    // Find textarea/input for project brief
    log('Looking for textarea/input for project idea');
    const textarea = page.locator('textarea, input[type="text"][placeholder*="idea"], input[placeholder*="проект"], input[placeholder*="brief"], [contenteditable="true"]').first();
    if (await textarea.count() > 0) {
      await textarea.click();
      await textarea.fill(IDEA_TEXT);
      log('Entered idea:', IDEA_TEXT);
      await page.waitForTimeout(1000);
    } else {
      log('WARNING: No textarea found — trying to paste anyway');
      await page.keyboard.type(IDEA_TEXT);
    }
    await snap(page, '04-idea-entered');

    const logPosBefore = getBackendLogSize();

    // Submit (Enter or Send button)
    log('Submitting project — pressing Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Try Send button if Enter didn't work
    const sendBtn = page.getByRole('button', {name:/send|отправить|submit|в работу|старт|launch/i}).first();
    if (await sendBtn.isVisible({timeout:2000}).catch(()=>false)) {
      await sendBtn.click(); log('Clicked Send button');
    }

    const launchTime = Date.now();
    await page.waitForTimeout(5000);
    await snap(page, '05-submitted');

    // Wait for generation to start
    for (let i=0; i<30; i++) {
      const t = await page.evaluate(()=>document.body.innerText.substring(0,2000));
      if (/Идет первый проход|Live generation|Packaging|Архитектура|Дизайн-пак|packaging|architect/i.test(t)) { log(`Generation started after ~${i*2}s`); break; }
      await page.waitForTimeout(2000);
    }
    await snap(page, '06-generation-started');

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
      if (pcts && pcts.length > 0) log(`[${elapsed}s] Progress: ${pcts.join(', ')}`);

      if (/Превью готово|Preview ready/i.test(txt) || (txt.includes('Финальная сборка') && !txt.includes('⚡'))) { finalStatus='success'; log(`[${elapsed}s] SUCCESS`); break; }
      if (/Quality gate failed|generation_failed|Ошибка генерации|Current run failed/i.test(txt)) { finalStatus='fail_quality_gate'; log(`[${elapsed}s] FAIL quality gate`); break; }
      if (/Превью временно недоступно|Preview temporarily unavailable/i.test(txt)) { finalStatus='fail_preview_unavailable'; log(`[${elapsed}s] FAIL preview unavailable`); break; }
      if (consoleLogs.some(l=>l.includes('546'))) { finalStatus='fail_http_546'; log(`[${elapsed}s] HTTP 546`); break; }

      if (elapsed-lastSnap>=55 && snapCount<14) {
        snapCount++; lastSnap=elapsed;
        await snap(page, `obs-${String(elapsed).padStart(4,'0')}s`);
        const newLog = getBackendLogNew(logPosBefore);
        const interesting = newLog.split('\n').filter(l=>/skeleton|coder|quality|preview|repair|546|contract|product_identity/.test(l)).slice(-5);
        if (interesting.length>0) log(`[${elapsed}s]`, interesting.join(' | ').substring(0,350));
      }
    }

    log(`Final status: ${finalStatus}`);
    await snap(page, `FINAL-${finalStatus}`);

    const newLogContent = getBackendLogNew(logPosBefore);
    const telemetry = extractTelemetry(newLogContent);
    const workspaceInspection = inspectWorkspace();

    // Remove key
    await page.evaluate(() => { localStorage.removeItem('GOOGLE_API_KEY'); });
    const keyGone = await page.evaluate(() => !localStorage.getItem('GOOGLE_API_KEY'));
    log(`GOOGLE_API_KEY removed: ${keyGone}`);

    const result = {
      timestamp: new Date().toISOString(),
      branch: 'p2/coder-product-identity-substitution',
      provider: 'google',
      modelId: 'google/gemini-2.5-flash',
      sourceAuthority: 'user_set',
      idea: IDEA_TEXT,
      finalStatus,
      observationDurationMs: Date.now()-launchTime,
      keyRemovedAfterRun: keyGone,
      telemetry,
      workspaceInspection,
      consoleLogs: consoleLogs.filter(l=>!l.includes('[REDACTED]')).slice(-200),
      networkLog: networkLog.slice(-50),
      logTailSnippet: newLogContent.split('\n').filter(l=>/skeleton|coder|quality|preview|repair|546|contract|product_identity/.test(l)).slice(-60),
    };

    writeFileSync(TELEMETRY_OUT, JSON.stringify(result,null,2));
    log('Telemetry →', TELEMETRY_OUT);
    log('Telemetry summary:', JSON.stringify({...telemetry, wsFilesInspected:workspaceInspection.filesInspected.length, wsFirstViewportClarity:workspaceInspection.firstViewportClarity, wsCashflowTerms:workspaceInspection.cashflowTermsFound.length, wsGenericLabels:workspaceInspection.genericLabelsFound.length, wsProductTokens:workspaceInspection.productTokens.length},null,2));

    await browser.close();
    delete process.env.GEMINI_KEY_TMP;
    log('=== COMPLETE ===');

  } catch (err) {
    log('ERROR:', err.message);
    try { await page.screenshot({ path:`${SCREENSHOTS_DIR}/ERROR.png` }); } catch {}
    await browser.close();
    delete process.env.GEMINI_KEY_TMP;
    throw err;
  }
}

main().catch(e=>{ console.error('Fatal:', e.message); process.exit(1); });

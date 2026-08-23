// Cashflow Guard Gemini diagnostic observation run
// Branch: p2/coder-product-identity-substitution
// Usage: node scripts/cashflow-gemini-obs.mjs
// Requires: GEMINI_DIAGNOSTIC_KEY env var set in calling process
// LOCAL ONLY — key injected into browser localStorage only, removed after run

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = 'http://localhost:5183';
const BACKEND_LOG = resolve('backend.log');
const SCREENSHOTS_DIR = resolve('cashflow-obs/gemini-run');
const TELEMETRY_OUT = resolve('cashflow-obs/gemini-telemetry.json');

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const log = (...args) => console.log(new Date().toISOString(), ...args);

// Verify key is available before starting — fail fast
const geminiKey = (process.env.GEMINI_DIAGNOSTIC_KEY || '').trim();
if (!geminiKey) {
  console.error('[FATAL] GEMINI_DIAGNOSTIC_KEY env var is missing or empty. Aborting.');
  process.exit(1);
}
// Log presence only — never log the key value
log('GEMINI_DIAGNOSTIC_KEY=set (length=' + geminiKey.length + ')');

function getBackendLogSize() {
  try { return readFileSync(BACKEND_LOG, 'utf8').length; } catch { return 0; }
}

function getBackendLogNewContent(positionBefore) {
  try {
    const content = readFileSync(BACKEND_LOG, 'utf8');
    return content.slice(positionBefore);
  } catch { return ''; }
}

function extractTelemetry(logContent) {
  const lines = logContent.split('\n');
  const tel = {
    skeletonSelected: null,
    skeletonContract: false,
    productIdentityContract: false,
    coderStarted: false,
    coderCompleted: false,
    http546: false,
    promptBlockSizes: null,
    qualityGateRan: false,
    repairRan: false,
    previewCompile: null,
    buildCompleted: false,
    packagingReached: false,
    architectReached: false,
    architectCompleted: false,
    llmRoute: null,
  };
  for (const line of lines) {
    if (line.includes('Skeleton') && line.includes('installed')) {
      const m = line.match(/Skeleton ([a-z\-]+) installed/);
      if (m) tel.skeletonSelected = m[1];
    }
    if (line.includes('skeleton_contract') || line.includes('SkeletonContract')) tel.skeletonContract = true;
    if (line.includes('ProductIdentitySubstitution') || line.includes('product_identity') ||
        line.includes('PRODUCT IDENTITY')) tel.productIdentityContract = true;
    if (line.includes('packaging') || line.includes('blueprint') || line.includes('pack_brief')) tel.packagingReached = true;
    if (line.includes('llm_call_step: architect') || line.includes('[architect]')) tel.architectReached = true;
    if (line.includes('architect') && line.includes('success')) tel.architectCompleted = true;
    if (line.includes('runCoder') || line.includes('[coder]') || line.includes('agent_build') ||
        line.includes('llm_call_step: coder')) tel.coderStarted = true;
    if (line.includes('coder_prompt_block_sizes')) tel.promptBlockSizes = line.trim();
    if (line.includes('HTTP 546') || (line.includes('546') && line.includes('proxy'))) tel.http546 = true;
    if (line.includes('quality_gate') || line.includes('qualityGate')) tel.qualityGateRan = true;
    if (line.includes('repair') || line.includes('agent_fix') || line.includes('llm_call_step: repair')) tel.repairRan = true;
    if (line.includes('build complete') || line.includes('preview_compile') || line.includes('preview compile')) {
      tel.previewCompile = line.trim();
      tel.buildCompleted = true;
    }
    if (line.includes('generation complete') || line.includes('coder complete') ||
        (line.includes('coder') && line.includes('response_time_ms'))) tel.coderCompleted = true;
    if (line.includes('[llm_route]')) tel.llmRoute = line.trim();
  }
  return tel;
}

function inspectWorkspace() {
  const GENERIC_LABELS = ['Pipeline', 'Records', 'Leads', 'Accounts', 'Tasks', 'Revenue', 'Conversion', 'Activity', 'Workflow', 'Team'];
  const CASHFLOW_TERMS = ['cashflow', 'cash flow', 'фриланс', 'freelan', 'invoice', 'инвойс', 'payment', 'платеж', 'client', 'клиент', 'earnings', 'доход', 'overdue', 'просроч', 'guard'];
  const SRC = resolve('preview-workspace/src');

  const result = {
    filesInspected: [],
    firstViewportClarity: false,
    kpiLabels: [],
    navigationLabels: [],
    genericLabelsFound: [],
    cashflowTermsFound: [],
    productTokens: [],
    emptyArrays: [],
    missingImports: [],
    appName: null,
  };

  const candidates = [
    'config/app.ts', 'config/navigation.ts', 'data/seed.ts',
    'screens/HomeScreen.tsx', 'screens/DashboardScreen.tsx',
    'App.tsx', 'app.tsx',
  ];

  for (const rel of candidates) {
    const full = `${SRC}/${rel}`;
    try {
      const content = readFileSync(full, 'utf8');
      result.filesInspected.push(rel);

      // App name
      const nameM = content.match(/name\s*[:=]\s*['"]([^'"]{2,40})['"]/i);
      if (nameM && !result.appName) result.appName = nameM[1];

      // PRODUCT tokens
      const productTokens = content.match(/PRODUCT_[A-Z_]+|{{PRODUCT[^}]*}}/g) || [];
      result.productTokens.push(...productTokens);

      // Empty arrays
      const emptyArrays = content.match(/=\s*\[\s*\]/g) || [];
      if (emptyArrays.length > 3) result.emptyArrays.push(`${rel}: ${emptyArrays.length} empty arrays`);

      // Generic labels
      for (const label of GENERIC_LABELS) {
        if (content.includes(`'${label}'`) || content.includes(`"${label}"`)) {
          result.genericLabelsFound.push(`${rel}:${label}`);
        }
      }

      // Cashflow terms
      for (const term of CASHFLOW_TERMS) {
        if (content.toLowerCase().includes(term)) {
          result.cashflowTermsFound.push(`${rel}:${term}`);
        }
      }

      // KPI/nav labels
      const kpiM = content.match(/label\s*[:=]\s*['"]([^'"]{3,40})['"]/gi) || [];
      result.kpiLabels.push(...kpiM.slice(0, 5).map(m => `${rel}:${m}`));

      const navM = content.match(/(?:title|name|label)\s*:\s*['"]([^'"]{2,30})['"]/g) || [];
      result.navigationLabels.push(...navM.slice(0, 5).map(m => `${rel}:${m}`));

      // Missing imports
      const importedComponents = (content.match(/from ['"][./]/g) || []).length;
      if (importedComponents === 0 && content.includes('React')) {
        result.missingImports.push(`${rel}: no relative imports but uses React`);
      }
    } catch {
      // file not present
    }
  }

  result.firstViewportClarity = result.cashflowTermsFound.length > 2;
  return result;
}

async function screenshotStep(page, name) {
  const path = `${SCREENSHOTS_DIR}/${name}.png`;
  try {
    await page.screenshot({ path, fullPage: false, timeout: 6000 });
    log(`Screenshot: ${name}`);
  } catch (e) {
    log(`Screenshot SKIPPED (${name}): ${e.message.substring(0, 80)}`);
  }
}

async function main() {
  log('=== Cashflow Guard GEMINI diagnostic observation run ===');
  log('Branch: p2/coder-product-identity-substitution');
  log('Provider: google / gemini-2.5-flash / user_set authority');

  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = `[browser][${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    const t = msg.text();
    if (t.includes('llm_route') || t.includes('coder_prompt_block_sizes') ||
        t.includes('skeleton') || t.includes('product_identity') ||
        t.includes('RouteAuthority') || t.includes('llm_call_diag') ||
        t.includes('agent_build') || t.includes('GOOGLE')) {
      // Log key-related diagnostics but never the key value itself
      if (!t.includes('AIza')) {
        log('BROWSER:', text.substring(0, 200));
      }
    }
  });

  const networkLog = [];
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (url.includes('/chat') || url.includes('/compile') || url.includes('/preview') ||
        url.includes('/api/') || url.includes('/agent-config') || url.includes('googleapis.com')) {
      networkLog.push({ url: url.substring(0, 120), status, timestamp: new Date().toISOString() });
      if (status >= 400 || url.includes('/chat') || url.includes('googleapis.com')) {
        log(`NET: ${status} ${url.substring(0, 120)}`);
      }
    }
  });

  let keyCleanedUp = false;

  try {
    log('Navigating to', BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await screenshotStep(page, '01-loaded');

    // Login if needed
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    log('Initial page text:', bodyText.substring(0, 200));
    if (bodyText.includes('Sign in') || bodyText.includes('Test Login') || bodyText.includes('localhost')) {
      log('Login screen — clicking Test Login');
      const loginBtns = await page.locator('button').all();
      for (const btn of loginBtns) {
        const txt = await btn.innerText().catch(() => '');
        if (txt.includes('Test') || txt.includes('localhost') || txt.includes('🧪')) {
          await btn.click();
          log('Clicked:', txt.substring(0, 60));
          await page.waitForTimeout(3000);
          break;
        }
      }
    }
    await page.waitForTimeout(2000);
    await screenshotStep(page, '02-after-login');

    // Inject GOOGLE_API_KEY + google agent_build config into localStorage
    // Key injected directly — not via ConfigService (which would POST to backend .env)
    // Key value is passed as argument to evaluate() — never concatenated into script string
    await page.evaluate(([key]) => {
      localStorage.setItem('GOOGLE_API_KEY', key);
      localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({
        provider: 'google',
        modelId: 'google/gemini-2.5-flash',
        maxTokens: {
          coder_superapp: 45256,
          coder_app: 35256,
          coder_landing: 10256,
        },
      }));
      localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
    }, [geminiKey]);
    log('Injected GOOGLE_API_KEY + google agent_build config into localStorage (user_set authority)');

    // Verify injection (presence check only)
    const configInjected = await page.evaluate(() => {
      const cfg = localStorage.getItem('AGENT_CONFIG_agent_build');
      const keyPresent = !!localStorage.getItem('GOOGLE_API_KEY');
      const src = localStorage.getItem('AGENT_CONFIG_agent_build__source');
      return { cfg, keyPresent, src };
    });
    log('Config injection verified:', JSON.stringify({
      provider: JSON.parse(configInjected.cfg || '{}').provider,
      modelId: JSON.parse(configInjected.cfg || '{}').modelId,
      keyPresent: configInjected.keyPresent,
      source: configInjected.src,
    }));

    await screenshotStep(page, '03-config-injected');

    // Navigate to Trending niches
    log('Looking for Trending niches button...');
    const trendBtn = page.getByRole('button', { name: /Трендовые ниши|Trending/i });
    if (await trendBtn.count() > 0) {
      await trendBtn.first().click();
      log('Clicked Trending niches');
    } else {
      const allBtns = await page.locator('button').all();
      for (const btn of allBtns) {
        const txt = await btn.innerText().catch(() => '');
        if (txt.includes('Трендовые') || txt.includes('Trending') || txt.includes('ниши')) {
          await btn.click();
          log('Clicked Trending:', txt.substring(0, 40));
          break;
        }
      }
    }
    await page.waitForTimeout(2500);
    await screenshotStep(page, '04-trending-panel');

    let pageText = await page.evaluate(() => document.body.innerText);
    let cashflowFound = pageText.toLowerCase().includes('cashflow');

    if (!cashflowFound) {
      const ideaBankBtn = page.getByRole('button', { name: /Банк идей|Idea Bank/i })
        .or(page.getByRole('tab', { name: /Банк идей|Idea Bank/i }));
      if (await ideaBankBtn.count() > 0) {
        await ideaBankBtn.first().click();
        log('Clicked Idea Bank');
        await page.waitForTimeout(2500);
        await screenshotStep(page, '05-idea-bank');
        pageText = await page.evaluate(() => document.body.innerText);
        cashflowFound = pageText.toLowerCase().includes('cashflow');
      }
    }

    log(`Cashflow Guard found in UI: ${cashflowFound}`);
    await screenshotStep(page, '06-before-launch');

    const logPositionBefore = getBackendLogSize();

    // Click В работу for Cashflow Guard
    const cashflowBtnResult = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while ((textNode = walker.nextNode())) {
        if (textNode.textContent && textNode.textContent.toLowerCase().includes('cashflow')) break;
      }
      if (!textNode) return { found: false, reason: 'cashflow text not found' };
      let el = textNode.parentElement;
      for (let i = 0; i < 14; i++) {
        if (!el) break;
        for (const btn of el.querySelectorAll('button')) {
          if (btn.innerText && btn.innerText.includes('В работу')) {
            btn.scrollIntoView({ block: 'center' });
            return { found: true, depth: i, cardText: el.innerText.substring(0, 120) };
          }
        }
        el = el.parentElement;
      }
      return { found: false, reason: 'В работу not found near cashflow' };
    });

    log('Cashflow DOM search:', JSON.stringify(cashflowBtnResult));

    if (cashflowBtnResult.found) {
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let textNode = null;
        while ((textNode = walker.nextNode())) {
          if (textNode.textContent && textNode.textContent.toLowerCase().includes('cashflow')) break;
        }
        if (!textNode) return;
        let el = textNode.parentElement;
        for (let i = 0; i < 14; i++) {
          if (!el) break;
          for (const btn of el.querySelectorAll('button')) {
            if (btn.innerText && btn.innerText.includes('В работу')) { btn.click(); return; }
          }
          el = el.parentElement;
        }
      });
      log('Clicked В работу (Cashflow Guard)');
    } else {
      log('WARNING: Cashflow Guard not found — using first В работу fallback');
      const fallbackBtn = page.getByRole('button', { name: /В работу/i }).first();
      if (await fallbackBtn.count() > 0) {
        await fallbackBtn.click();
        log('Clicked fallback В работу');
      } else {
        log('ERROR: No В работу button found');
        await screenshotStep(page, 'ERROR-no-launch');
        await browser.close();
        return;
      }
    }

    const launchTime = Date.now();
    log('Launch clicked at', new Date().toISOString());
    await page.waitForTimeout(5000);
    await screenshotStep(page, '07-packaging-started');

    // Wait for engine to open
    for (let i = 0; i < 30; i++) {
      const txt = await page.evaluate(() => document.body.innerText.substring(0, 2000));
      if (txt.includes('Идет первый проход') || txt.includes('Live generation') ||
          txt.includes('Дизайн-пак') || txt.includes('Packaging') || txt.includes('Архитектура')) {
        log(`Engine opened after ~${i * 2}s`);
        break;
      }
      await page.waitForTimeout(2000);
    }
    await screenshotStep(page, '08-engine-opened');

    // Observe up to 10 minutes
    const OBSERVE_MS = 590000;
    const startObs = Date.now();
    let finalStatus = 'timeout';

    while (Date.now() - startObs < OBSERVE_MS) {
      await page.waitForTimeout(15000);
      const elapsed = Math.round((Date.now() - startObs) / 1000);
      const txt = await page.evaluate(() => document.body.innerText.substring(0, 3000));

      const pcts = txt.match(/(\d+)%/g);
      if (pcts) log(`[${elapsed}s] Progress: ${pcts.join(', ')}`);

      const stages = txt.match(/[✓⚡○●] ?(Дизайн-пак|Архитектура|Кодирование|Финальная сборка|Превью|Packaging|Architect|Coder|Quality|Preview)/g);
      if (stages) log(`[${elapsed}s] Stages: ${stages.join(', ')}`);

      if (txt.includes('Quality gate failed after repair') || txt.includes('generation_failed') ||
          txt.includes('Current run failed') || txt.includes('Ошибка генерации')) {
        finalStatus = 'fail_quality_gate';
        log(`[${elapsed}s] FAIL: Quality gate failed`);
        break;
      }
      if (txt.includes('Превью готово') || txt.includes('Preview ready') || txt.includes('Live Preview')) {
        finalStatus = 'success';
        log(`[${elapsed}s] SUCCESS: Preview ready`);
        break;
      }
      if (txt.includes('fail_preview_unavailable') || txt.includes('preview_unavailable')) {
        finalStatus = 'fail_preview_unavailable';
        log(`[${elapsed}s] FAIL: Preview unavailable`);
        break;
      }
      if (txt.includes('Typed successfully') || txt.includes('TypeScript: 0 errors')) {
        finalStatus = 'success';
        log(`[${elapsed}s] SUCCESS: Typed/compiled`);
        break;
      }

      if (elapsed % 60 < 15) {
        await screenshotStep(page, `obs-${String(elapsed).padStart(4, '0')}s`);
      }
    }

    log(`Final status: ${finalStatus} after ${Math.round((Date.now() - launchTime) / 1000)}s`);
    await screenshotStep(page, 'FINAL');

    // ── Cleanup: remove GOOGLE_API_KEY from localStorage ──────────────────
    await page.evaluate(() => {
      localStorage.removeItem('GOOGLE_API_KEY');
    });
    keyCleanedUp = true;
    log('GOOGLE_API_KEY removed from browser localStorage ✓');

    // Verify removal
    const keyGone = await page.evaluate(() => !localStorage.getItem('GOOGLE_API_KEY'));
    log(`Key removal verified: ${keyGone}`);

    // ── Collect telemetry ─────────────────────────────────────────────────
    const newLogContent = getBackendLogNewContent(logPositionBefore);
    const tel = extractTelemetry(newLogContent);

    // Route authority from browser localStorage
    const routeInfo = await page.evaluate(() => {
      const cfg = localStorage.getItem('AGENT_CONFIG_agent_build');
      const src = localStorage.getItem('AGENT_CONFIG_agent_build__source');
      return { cfg, src };
    });
    const parsedCfg = JSON.parse(routeInfo.cfg || '{}');

    // Workspace inspection
    const workspace = inspectWorkspace();

    const telemetry = {
      runId: 'gemini-diagnostic-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-'),
      finalStatus,
      elapsedSecs: Math.round((Date.now() - launchTime) / 1000),
      provider: parsedCfg.provider || 'google',
      modelId: parsedCfg.modelId || 'google/gemini-2.5-flash',
      sourceAuthority: routeInfo.src || 'user_set',
      keyPresentAfterCleanup: !keyGone,
      pipelineTelemetry: tel,
      workspace,
      consoleSample: consoleLogs.slice(-30),
      networkSample: networkLog.slice(-20),
    };

    writeFileSync(TELEMETRY_OUT, JSON.stringify(telemetry, null, 2));
    log('Telemetry written to', TELEMETRY_OUT);

    // ── Summary ───────────────────────────────────────────────────────────
    log('\n===== RUN SUMMARY =====');
    log('Provider/model:', telemetry.provider, '/', telemetry.modelId);
    log('Authority:', telemetry.sourceAuthority);
    log('Final status:', finalStatus);
    log('Coder completed:', tel.coderCompleted);
    log('HTTP 546:', tel.http546);
    log('Preview compile:', tel.previewCompile || 'not reached');
    log('Product Identity Contract in prompt:', tel.productIdentityContract);
    log('Skeleton:', tel.skeletonSelected);
    log('Workspace appName:', workspace.appName);
    log('Generic labels found:', workspace.genericLabelsFound.length, workspace.genericLabelsFound.slice(0, 5));
    log('Cashflow terms found:', workspace.cashflowTermsFound.length, workspace.cashflowTermsFound.slice(0, 5));
    log('PRODUCT tokens:', workspace.productTokens.length, workspace.productTokens.slice(0, 5));
    log('Empty arrays:', workspace.emptyArrays);
    log('GOOGLE_API_KEY cleaned up:', keyCleanedUp);
    log('======================');

  } catch (err) {
    log('ERROR:', err.message);
    if (!keyCleanedUp) {
      try {
        await page.evaluate(() => localStorage.removeItem('GOOGLE_API_KEY'));
        log('GOOGLE_API_KEY removed from localStorage (error cleanup) ✓');
      } catch {}
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

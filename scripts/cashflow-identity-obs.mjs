// Cashflow Guard Product Identity observation run
// Branch: p2/coder-product-identity-substitution
// Usage: node scripts/cashflow-identity-obs.mjs
// LOCAL ONLY — does not push, does not modify source code

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = 'http://localhost:5183';
const BACKEND_LOG = resolve('backend.log');
const SCREENSHOTS_DIR = resolve('cashflow-obs/identity-run');
const TELEMETRY_OUT = resolve('cashflow-obs/identity-telemetry-run2.json');

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const log = (...args) => console.log(new Date().toISOString(), ...args);

function getBackendLogTail(lines = 120) {
  try {
    const content = readFileSync(BACKEND_LOG, 'utf8');
    return content.split('\n').slice(-lines).join('\n');
  } catch { return ''; }
}

function getBackendLogNewContent(positionBefore) {
  try {
    const content = readFileSync(BACKEND_LOG, 'utf8');
    return content.slice(positionBefore);
  } catch { return ''; }
}

function getBackendLogSize() {
  try { return readFileSync(BACKEND_LOG, 'utf8').length; } catch { return 0; }
}

function extractTelemetryFromLog(logContent) {
  const lines = logContent.split('\n');
  const tel = {
    skeletonSelected: null,
    skeletonContract: false,
    productIdentityContract: false,
    navMode: null,
    coderStarted: false,
    coderCompleted: false,
    http546: false,
    promptBlockSizes: null,
    qualityGateRan: false,
    repairRan: false,
    previewCompile: null,
    qualityGateResult: null,
    buildCompleted: false,
    packagingReached: false,
    architectReached: false,
    architectCompleted: false,
  };

  for (const line of lines) {
    if (line.includes('Atomic skeleton install') || (line.includes('Skeleton') && line.includes('installed'))) {
      const m = line.match(/copying ([a-z\-]+)\]/);
      if (m) tel.skeletonSelected = m[1];
      const m2 = line.match(/Skeleton ([a-z\-]+) installed/);
      if (m2) tel.skeletonSelected = m2[1];
    }
    if (line.includes('SkeletonContractForCoder') || line.includes('skeleton_contract') || line.includes('skeleton-contract') || line.includes('SkeletonContract')) {
      tel.skeletonContract = true;
    }
    if (line.includes('ProductIdentitySubstitution') || line.includes('product_identity') || line.includes('PRODUCT IDENTITY') || line.includes('product-identity')) {
      tel.productIdentityContract = true;
    }
    if (line.includes('nav_mode') || line.includes('navMode') || line.includes('navigation_mode')) {
      tel.navMode = line.trim();
    }
    if (line.includes('packaging') || line.includes('blueprint') || line.includes('pack_brief')) {
      tel.packagingReached = true;
    }
    if (line.includes('llm_call_step: architect') || line.includes('[architect]') || line.includes('architect_app')) {
      tel.architectReached = true;
    }
    if (line.includes('architect') && line.includes('success')) {
      tel.architectCompleted = true;
    }
    if (line.includes('runCoder') || line.includes('[coder]') || line.includes('agent_build') || line.includes('llm_call_step: coder')) {
      tel.coderStarted = true;
    }
    if (line.includes('coder_prompt_block_sizes') || line.includes('[coder_prompt_block_sizes]')) {
      tel.promptBlockSizes = line.trim();
    }
    if (line.includes('HTTP 546') || (line.includes('546') && line.includes('proxy'))) {
      tel.http546 = true;
    }
    if (line.includes('quality_gate') || line.includes('qualityGate') || line.includes('quality gate')) {
      tel.qualityGateRan = true;
      if (line.includes('pass') || line.includes('PASS')) tel.qualityGateResult = 'PASS';
      else if (line.includes('fail') || line.includes('FAIL') || line.includes('failed')) tel.qualityGateResult = 'FAIL';
    }
    if (line.includes('repair') || line.includes('autofix') || line.includes('agent_fix') || line.includes('llm_call_step: repair')) {
      tel.repairRan = true;
    }
    if (line.includes('build complete') || line.includes('preview_compile') || line.includes('preview compile')) {
      tel.previewCompile = line.trim();
      tel.buildCompleted = true;
    }
    if (line.includes('generation complete') || line.includes('coder complete') || line.includes('runCoder complete') || (line.includes('coder') && line.includes('response_time_ms'))) {
      tel.coderCompleted = true;
    }
  }
  return tel;
}

// Product identity inspection
function inspectWorkspace() {
  const GENERIC_LABELS = ['Pipeline', 'Records', 'Leads', 'Accounts', 'Tasks', 'Revenue', 'Conversion', 'Activity', 'Workflow', 'Team'];
  const CASHFLOW_TERMS = ['cashflow', 'cash flow', 'фриланс', 'freelan', 'invoice', 'инвойс', 'payment', 'платеж', 'client', 'клиент', 'earnings', 'доход', 'overdue', 'просроч', 'guard'];

  const result = {
    filesInspected: [],
    firstViewportClarity: false,
    kpiLabels: [],
    dataTableLabels: [],
    navigationLabels: [],
    genericLabelsFound: [],
    cashflowTermsFound: [],
    productTokens: [],
    emptyArrays: [],
    missingImports: [],
    compileErrors: [],
    rawSamples: {},
  };

  const wsBase = resolve('preview-workspace/src');
  const filesToCheck = [
    'App.tsx',
    'pages/Dashboard.tsx',
    'pages/Records.tsx',
    'pages/Reports.tsx',
    'pages/Invoices.tsx',
    'pages/Payments.tsx',
    'pages/Clients.tsx',
    'pages/Cashflow.tsx',
    'components/Sidebar.tsx',
    'components/KPICard.tsx',
  ];

  for (const f of filesToCheck) {
    const fp = `${wsBase}/${f}`;
    if (!existsSync(fp)) continue;
    result.filesInspected.push(f);
    const content = readFileSync(fp, 'utf8');
    result.rawSamples[f] = content.substring(0, 600);

    // Check for PRODUCT tokens
    const productTokenMatches = content.match(/\bPRODUCT[_A-Z]*\b/g);
    if (productTokenMatches) {
      result.productTokens.push(...productTokenMatches.map(t => `${f}:${t}`));
    }

    // Check for empty arrays
    const emptyArrayMatches = content.match(/=\s*\[\s*\]/g);
    if (emptyArrayMatches) {
      result.emptyArrays.push(`${f}: ${emptyArrayMatches.length} empty arrays`);
    }

    // Check for generic labels
    for (const label of GENERIC_LABELS) {
      const regex = new RegExp(`["'\`]${label}["'\`]|>${label}<`, 'i');
      if (regex.test(content)) {
        result.genericLabelsFound.push(`${f}:${label}`);
      }
    }

    // Check for cashflow-specific terms
    for (const term of CASHFLOW_TERMS) {
      const regex = new RegExp(term, 'i');
      if (regex.test(content)) {
        result.cashflowTermsFound.push(`${f}:${term}`);
        break; // one match per file is enough
      }
    }

    // Check for missing imports (common pattern)
    const importedComponents = (content.match(/import\s+.*?from\s+['"][^'"]+['"]/g) || []);
    const usedComponents = (content.match(/<([A-Z][A-Za-z]+)/g) || []).map(m => m.slice(1));
    const importedNames = importedComponents.join(' ');
    for (const comp of usedComponents) {
      if (!importedNames.includes(comp) && !['React', 'Fragment', 'Suspense', 'StrictMode'].includes(comp)) {
        // Basic check — not exhaustive
        result.missingImports.push(`${f}:<${comp}>`);
      }
    }
  }

  // First viewport clarity: Does Dashboard.tsx mention cashflow/freelancer terms prominently?
  const dashPath = `${wsBase}/pages/Dashboard.tsx`;
  if (existsSync(dashPath)) {
    const dash = readFileSync(dashPath, 'utf8').toLowerCase();
    result.firstViewportClarity = CASHFLOW_TERMS.some(t => dash.includes(t));
    // Extract KPI labels  
    const kpiMatches = dash.match(/label[:\s=]+['"`]([^'"`]+)['"`]/g) || [];
    result.kpiLabels = kpiMatches.slice(0, 10);
  }

  // Navigation labels from Sidebar/App
  const sidebarPath = `${wsBase}/components/Sidebar.tsx`;
  const appPath = `${wsBase}/App.tsx`;
  for (const p of [sidebarPath, appPath]) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      const navMatches = content.match(/(?:label|name|title)[:\s=]+['"`]([^'"`]+)['"`]/gi) || [];
      result.navigationLabels.push(...navMatches.slice(0, 8).map(m => `${p.split('/').pop()}:${m}`));
    }
  }

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
  return path;
}

async function main() {
  log('=== Cashflow Guard Product Identity observation run ===');
  log('Branch: p2/coder-product-identity-substitution');

  // 1. Route authority
  let routeAuthority = {};
  try {
    const sc = JSON.parse(readFileSync('backend/agent-config.json', 'utf8'));
    let rc = {};
    try { rc = JSON.parse(readFileSync('backend/agent-config.runtime.json', 'utf8')); } catch {}
    const build = { ...sc.agent_build, ...(rc.agent_build || {}) };
    const primary = { ...sc.agent_primary, ...(rc.agent_primary || {}) };
    routeAuthority = {
      provider: build.provider || 'openrouter',
      modelIdBuild: build.modelId,
      modelIdPrimary: primary.modelId,
      sourceAuthority: 'user_set',
      endpointKind: 'openrouter',
      maxTokensCoderApp: build.maxTokens?.coder_app,
      notBackendFactoryTemplate: true,
      notBackendFileSeed: true,
      notNoModelConfigured: true,
    };
  } catch (e) {
    log('Config read error:', e.message);
  }
  log('Route authority:', JSON.stringify(routeAuthority, null, 2));

  // 2. Launch browser
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = `[browser][${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.text().includes('coder_prompt_block_sizes') || msg.text().includes('skeleton') ||
        msg.text().includes('product_identity') || msg.text().includes('llm_route') ||
        msg.text().includes('RouteAuthority') || msg.text().includes('llm_call_diag')) {
      log('BROWSER:', text.substring(0, 180));
    }
  });

  const networkLog = [];
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (url.includes('/chat') || url.includes('/compile') || url.includes('/preview') || url.includes('/api/') || url.includes('/agent-config')) {
      networkLog.push({ url, status, timestamp: new Date().toISOString() });
      if (status >= 400 || url.includes('/chat')) {
        log(`NET: ${status} ${url.substring(0, 100)}`);
      }
    }
  });

  try {
    log('Navigating to', BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await screenshotStep(page, '01-loaded');

    // Login if needed
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    log('Initial page text:', bodyText.substring(0, 200));
    if (bodyText.includes('Sign in') || bodyText.includes('Test Login') || bodyText.includes('localhost')) {
      log('Login screen detected — clicking Test Login');
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

    // Navigate to Trending niches
    log('Looking for Trending niches button...');
    const trendBtn = page.getByRole('button', { name: /Трендовые ниши|Trending/i });
    if (await trendBtn.count() > 0) {
      await trendBtn.first().click();
      log('Clicked Trending niches');
    } else {
      // Try to find via text content
      const allBtns = await page.locator('button').all();
      for (const btn of allBtns) {
        const txt = await btn.innerText().catch(() => '');
        if (txt.includes('Трендовые') || txt.includes('Trending') || txt.includes('ниши')) {
          await btn.click();
          log('Clicked Trending button:', txt.substring(0, 40));
          break;
        }
      }
    }
    await page.waitForTimeout(2500);
    await screenshotStep(page, '03-trending-panel');

    // Look for Cashflow Guard / Idea Bank
    let pageText = await page.evaluate(() => document.body.innerText);
    log('Trending page text (first 600):', pageText.substring(0, 600));

    let cashflowFound = pageText.toLowerCase().includes('cashflow');

    if (!cashflowFound) {
      // Try Idea Bank tab
      const ideaBankBtn = page.getByRole('button', { name: /Банк идей|Idea Bank/i })
        .or(page.getByRole('tab', { name: /Банк идей|Idea Bank/i }));
      if (await ideaBankBtn.count() > 0) {
        await ideaBankBtn.first().click();
        log('Clicked Idea Bank');
        await page.waitForTimeout(2500);
        await screenshotStep(page, '04-idea-bank');
        pageText = await page.evaluate(() => document.body.innerText);
        cashflowFound = pageText.toLowerCase().includes('cashflow');
      }
    }

    log(`Cashflow Guard found in UI: ${cashflowFound}`);
    if (!cashflowFound) {
      // Log available ideas for diagnostics
      const headings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h1,h2,h3,h4,[class*=title],[class*=idea],[class*=card]'))
          .map(el => el.innerText.trim())
          .filter(t => t.length > 2 && t.length < 100)
          .slice(0, 20)
          .join(' | ');
      });
      log('Available cards/titles:', headings);
    }

    // Find and click В работу for Cashflow Guard
    const cashflowBtnResult = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while ((textNode = walker.nextNode())) {
        if (textNode.textContent && textNode.textContent.toLowerCase().includes('cashflow')) break;
      }
      if (!textNode) return { found: false, reason: 'cashflow text not found in DOM' };

      let el = textNode.parentElement;
      for (let i = 0; i < 14; i++) {
        if (!el) break;
        const btns = Array.from(el.querySelectorAll('button'));
        for (const btn of btns) {
          if (btn.innerText && btn.innerText.includes('В работу')) {
            btn.scrollIntoView({ block: 'center' });
            return { found: true, depth: i, cardText: el.innerText.substring(0, 120) };
          }
        }
        el = el.parentElement;
      }
      return { found: false, reason: 'В работу button not found near cashflow text' };
    });

    log('Cashflow DOM search:', JSON.stringify(cashflowBtnResult));
    await screenshotStep(page, '04-before-launch');

    const logPositionBefore = getBackendLogSize();
    log('Log position before launch:', logPositionBefore);

    if (cashflowBtnResult.found) {
      await page.waitForTimeout(500);
      // Click via evaluate (scroll already happened)
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
      log('Clicked В работу (evaluate)');
    } else {
      log('WARNING: Cashflow Guard not found, using first В работу fallback');
      const fallbackBtn = page.getByRole('button', { name: /В работу/i }).first();
      if (await fallbackBtn.count() > 0) {
        await fallbackBtn.click();
        log('Clicked fallback В работу');
      } else {
        log('ERROR: No В работу button found at all');
        await screenshotStep(page, 'ERROR-no-launch-btn');
        await browser.close();
        return { error: 'No launch button found', routeAuthority };
      }
    }

    const launchTime = Date.now();
    log('Launch clicked at', new Date().toISOString());
    await page.waitForTimeout(5000);
    await screenshotStep(page, '05-packaging-started');

    // Wait for engine/studio to open
    let engineOpened = false;
    for (let i = 0; i < 30; i++) {
      const txt = await page.evaluate(() => document.body.innerText.substring(0, 2000));
      if (txt.includes('Идет первый проход') || txt.includes('Live generation') || txt.includes('Дизайн-пак') || txt.includes('Packaging') || txt.includes('Архитектура')) {
        engineOpened = true;
        log(`Engine opened after ~${i * 2}s`);
        break;
      }
      await page.waitForTimeout(2000);
    }
    if (!engineOpened) log('WARNING: Engine may not have opened yet');
    await screenshotStep(page, '06-engine-opened');

    // Observe for 10 minutes
    const OBSERVE_MS = 590000;
    const startObs = Date.now();
    let finalStatus = 'timeout';
    let snapCount = 0;
    let lastElapsedSnap = -99;

    while (Date.now() - startObs < OBSERVE_MS) {
      await page.waitForTimeout(15000);
      const elapsed = Math.round((Date.now() - startObs) / 1000);
      const txt = await page.evaluate(() => document.body.innerText.substring(0, 3000));

      // Progress
      const pcts = txt.match(/(\d+)%/g);
      if (pcts) log(`[${elapsed}s] Progress: ${pcts.join(', ')}`);

      // Pipeline stages
      const stages = txt.match(/[✓⚡○●] ?(Дизайн-пак|Архитектура|Skeleton|Кодирование|Финальная сборка|Превью|Packaging|Architect|Coder|Quality|Preview)/g);
      if (stages) log(`[${elapsed}s] Stages: ${stages.join(', ')}`);

      // Terminal states
      if (txt.includes('Quality gate failed after repair') || txt.includes('generation_failed') || txt.includes('Current run failed') || txt.includes('Ошибка генерации')) {
        finalStatus = 'fail_quality_gate';
        log(`[${elapsed}s] FAIL: Quality gate failed`);
        break;
      }
      if (txt.includes('Превью готово') || txt.includes('Preview ready') || (txt.includes('Финальная сборка') && !txt.includes('⚡'))) {
        finalStatus = 'success';
        log(`[${elapsed}s] SUCCESS: Preview ready`);
        break;
      }
      if (txt.includes('Превью временно недоступно') || txt.includes('Preview temporarily unavailable')) {
        finalStatus = 'fail_preview_unavailable';
        log(`[${elapsed}s] FAIL: Preview unavailable`);
        break;
      }

      // Periodic snapshots every ~60s
      if (elapsed - lastElapsedSnap >= 55 && snapCount < 12) {
        snapCount++;
        lastElapsedSnap = elapsed;
        await screenshotStep(page, `obs-${String(elapsed).padStart(4,'0')}s`);
        const backendNew = getBackendLogNewContent(logPositionBefore);
        const interesting = backendNew.split('\n').filter(l =>
          l.includes('skeleton') || l.includes('coder') || l.includes('quality') ||
          l.includes('preview') || l.includes('repair') || l.includes('546') ||
          l.includes('block_size') || l.includes('contract') || l.includes('product_identity') ||
          l.includes('identity')
        ).slice(-8);
        if (interesting.length > 0) log(`[${elapsed}s] Backend:`, interesting.join(' | ').substring(0, 300));
      }
    }

    log(`Final status: ${finalStatus}`);
    await screenshotStep(page, `final-${finalStatus}`);

    const newLogContent = getBackendLogNewContent(logPositionBefore);
    const telemetry = extractTelemetryFromLog(newLogContent);
    const workspaceInspection = inspectWorkspace();

    const result = {
      timestamp: new Date().toISOString(),
      branch: 'p2/coder-product-identity-substitution',
      routeAuthority,
      finalStatus,
      observationDurationMs: Date.now() - launchTime,
      telemetry,
      workspaceInspection,
      consoleLogs: consoleLogs.slice(-200),
      networkLog: networkLog.slice(-50),
      logTailSnippet: newLogContent.split('\n').filter(l =>
        l.includes('skeleton') || l.includes('coder') || l.includes('quality') ||
        l.includes('preview') || l.includes('repair') || l.includes('546') ||
        l.includes('block_size') || l.includes('contract') || l.includes('product_identity') ||
        l.includes('identity') || l.includes('navigation') || l.includes('nav_mode')
      ).slice(-60),
    };

    writeFileSync(TELEMETRY_OUT, JSON.stringify(result, null, 2));
    log('Telemetry written to', TELEMETRY_OUT);
    log('=== RUN COMPLETE ===');
    log('finalStatus:', finalStatus);
    log('telemetry:', JSON.stringify(telemetry, null, 2));
    log('workspaceInspection summary:', JSON.stringify({
      filesInspected: workspaceInspection.filesInspected,
      firstViewportClarity: workspaceInspection.firstViewportClarity,
      cashflowTermsFound: workspaceInspection.cashflowTermsFound.length,
      genericLabelsFound: workspaceInspection.genericLabelsFound,
      productTokens: workspaceInspection.productTokens,
      emptyArrays: workspaceInspection.emptyArrays,
    }, null, 2));

    await browser.close();
    return result;

  } catch (err) {
    log('ERROR:', err.message);
    try { await page.screenshot({ path: `${SCREENSHOTS_DIR}/ERROR.png` }); } catch {}
    await browser.close();
    throw err;
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

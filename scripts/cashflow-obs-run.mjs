// Cashflow Guard generation observer — skeleton context contract run
// Usage: node scripts/cashflow-obs-run.mjs
// LOCAL ONLY — does not push, does not modify source code

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = 'http://localhost:5183';
const BACKEND_LOG = resolve('backend.log');
const SCREENSHOTS_DIR = resolve('artifacts/quality-snapshots/screenshots/cashflow-guard-contract');
const TELEMETRY_OUT = resolve('cashflow-obs/cashflow-contract-telemetry.json');

mkdirSync(SCREENSHOTS_DIR, { recursive: true });
mkdirSync(resolve('cashflow-obs'), { recursive: true });

const log = (...args) => console.log(new Date().toISOString(), ...args);

function getBackendLogTail(lines = 80) {
  try {
    const content = readFileSync(BACKEND_LOG, 'utf8');
    return content.split('\n').slice(-lines).join('\n');
  } catch { return ''; }
}

function extractTelemetryFromLog(logContent) {
  const lines = logContent.split('\n');
  const tel = {
    skeletonSelected: null,
    skeletonContract: [],
    navMode: null,
    mobileNavRules: false,
    saasNavRules: false,
    coderStarted: false,
    coderCompleted: false,
    http546: false,
    proxyResourceLimit: false,
    promptBlockSizes: null,
    qualityGateRan: false,
    repairRan: false,
    previewCompile: null,
    qualityGateResult: null,
    buildCompleted: false,
  };

  for (const line of lines) {
    if (line.includes('Atomic skeleton install') || line.includes('Skeleton') && line.includes('installed')) {
      const m = line.match(/copying ([a-z\-]+)\]/);
      if (m) tel.skeletonSelected = m[1];
      const m2 = line.match(/Skeleton ([a-z\-]+) installed/);
      if (m2) tel.skeletonSelected = m2[1];
    }
    if (line.includes('SkeletonContractForCoder') || line.includes('skeleton_contract') || line.includes('skeleton-contract')) {
      tel.skeletonContract.push(line.trim());
    }
    if (line.includes('nav_mode') || line.includes('navMode') || line.includes('navigation_mode')) {
      tel.navMode = line.trim();
    }
    if (line.includes('BOTTOM_TABS') || line.includes('BottomTab') && line.includes('mobile')) {
      tel.mobileNavRules = true;
    }
    if (line.includes('sidebar') || line.includes('SIDEBAR') || line.includes('saas-dashboard')) {
      tel.saasNavRules = true;
    }
    if (line.includes('runCoder') || line.includes('[coder]') || line.includes('agent_build')) {
      tel.coderStarted = true;
    }
    if (line.includes('coder_prompt_block_sizes') || line.includes('[coder_prompt_block_sizes]')) {
      tel.promptBlockSizes = line.trim();
    }
    if (line.includes('HTTP 546') || line.includes('546')) {
      tel.http546 = true;
    }
    if (line.includes('proxy_resource_limit') || line.includes('resource_limit')) {
      tel.proxyResourceLimit = true;
    }
    if (line.includes('quality_gate') || line.includes('qualityGate') || line.includes('quality gate')) {
      tel.qualityGateRan = true;
      if (line.includes('pass') || line.includes('PASS')) tel.qualityGateResult = 'PASS';
      else if (line.includes('fail') || line.includes('FAIL') || line.includes('failed')) tel.qualityGateResult = 'FAIL';
    }
    if (line.includes('repair') || line.includes('autofix') || line.includes('agent_fix')) {
      tel.repairRan = true;
    }
    if (line.includes('build complete') || line.includes('preview_compile') || line.includes('preview compile')) {
      tel.previewCompile = line.trim();
      tel.buildCompleted = true;
    }
    if (line.includes('generation complete') || line.includes('coder complete') || line.includes('runCoder complete')) {
      tel.coderCompleted = true;
    }
  }
  return tel;
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

function getBackendLogNewContent(positionBefore) {
  try {
    const content = readFileSync(BACKEND_LOG, 'utf8');
    return content.slice(positionBefore);
  } catch { return ''; }
}

function getBackendLogSize() {
  try { return readFileSync(BACKEND_LOG, 'utf8').length; } catch { return 0; }
}

async function main() {
  log('=== Cashflow Guard skeleton contract observation run ===');

  // 1. Route authority from agent-config files
  let routeAuthority = {};
  try {
    const rc = JSON.parse(readFileSync('backend/agent-config.runtime.json', 'utf8'));
    const sc = JSON.parse(readFileSync('backend/agent-config.json', 'utf8'));
    const buildRuntime = rc.agent_build || {};
    const buildStatic = sc.agent_build || {};
    routeAuthority = {
      provider: buildRuntime.provider || buildStatic.provider,
      modelId: buildRuntime.modelId || buildStatic.modelId,
      sourceAuthority: buildRuntime.sourceAuthority || buildStatic.sourceAuthority || 'user_set',
      endpointKind: buildRuntime.endpointKind || buildStatic.endpointKind || 'openrouter',
      maxTokensCoder: buildRuntime.maxTokens?.coder_app || buildStatic.maxTokens?.coder_app,
      runtimeOverrideModelId: buildRuntime.modelId,
      staticModelId: buildStatic.modelId,
    };
  } catch (e) {
    log('Config read error:', e.message);
  }
  log('Route authority:', JSON.stringify(routeAuthority, null, 2));

  // 2. Launch browser
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = `[browser][${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.text().includes('coder_prompt_block_sizes') || msg.text().includes('skeleton') || msg.text().includes('SkeletonContract')) {
      log('BROWSER LOG:', text);
    }
  });

  // Capture network requests
  const networkLog = [];
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (url.includes('/chat') || url.includes('/compile') || url.includes('/preview') || url.includes('/api/')) {
      networkLog.push({ url, status, timestamp: new Date().toISOString() });
      if (status >= 400 || url.includes('/chat')) {
        log(`NETWORK: ${status} ${url}`);
      }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await screenshotStep(page, '01-app-loaded');

    // Handle login if needed
    const pageTextLogin = await page.evaluate(() => document.body.innerText.substring(0, 300));
    if (pageTextLogin.includes('Sign in') || pageTextLogin.includes('Test Login') || pageTextLogin.includes('Continue with Google')) {
      log('Login page detected, clicking Test Login...');
      const testLoginBtn = page.getByRole('button', { name: /Test Login|localhost/i });
      if (await testLoginBtn.count() > 0) {
        await testLoginBtn.first().click();
        log('Clicked Test Login');
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      } else {
        // Try text-based approach
        const loginBtns = await page.locator('button').all();
        for (const btn of loginBtns) {
          const txt = await btn.innerText().catch(() => '');
          if (txt.includes('Test') || txt.includes('localhost') || txt.includes('\uD83E\uDDEA')) {
            await btn.click();
            log('Clicked test login button:', txt.substring(0, 40));
            await page.waitForTimeout(3000);
            break;
          }
        }
      }
      await screenshotStep(page, '01b-after-login');
    }

    await page.waitForTimeout(2000);

    // Navigate to Trending niches
    const trendBtn = page.getByRole('button', { name: /Трендовые ниши/i });
    if (await trendBtn.count() > 0) {
      await trendBtn.first().click();
      log('Clicked Trending niches');
    } else {
      // Try sidebar nav
      const sidebar = page.locator('nav, [role="navigation"]');
      log('Trend btn not found, trying sidebar navigation');
    }
    await page.waitForTimeout(2000);
    await screenshotStep(page, '02-trend-panel');

    // Check for Idea Bank tab and Cashflow Guard
    const ideaBankBtn = page.getByRole('button', { name: /Банк идей/i });
    let cashflowCardFound = false;
    let cardRef = null;

    // First check daily/weekly ideas
    const allText = await page.evaluate(() => document.body.innerText);
    log('Page text preview:', allText.substring(0, 500));

    if (allText.includes('Cashflow Guard') || allText.toLowerCase().includes('cashflow')) {
      log('Found Cashflow Guard in current view');
      cashflowCardFound = true;
    } else if (await ideaBankBtn.count() > 0) {
      await ideaBankBtn.first().click();
      log('Clicked Idea Bank');
      await page.waitForTimeout(2000);
      await screenshotStep(page, '03-idea-bank');
      const bankText = await page.evaluate(() => document.body.innerText);
      if (bankText.includes('Cashflow Guard') || bankText.toLowerCase().includes('cashflow')) {
        log('Found Cashflow Guard in Idea Bank');
        cashflowCardFound = true;
      }
    }

    if (!cashflowCardFound) {
      log('Cashflow Guard not found in panel — will use closest financial/freelancer idea or check Идеи дня');
      await screenshotStep(page, '03-no-cashflow-card');
      // Get list of available ideas
      const ideasText = await page.evaluate(() => {
        const h3s = Array.from(document.querySelectorAll('h3, h2, [class*="title"], [class*="idea"]'));
        return h3s.map(el => el.innerText).join(' | ');
      });
      log('Available ideas/headings:', ideasText.substring(0, 1000));
    }

    // Find "В работу" button for Cashflow Guard or best match
    let inWorkBtn = null;

    // Use DOM evaluation to find Cashflow Guard and its "В работу" button
    const cashflowBtnInfo = await page.evaluate(() => {
      // Find the text node containing Cashflow Guard
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while ((textNode = walker.nextNode())) {
        if (textNode.textContent && textNode.textContent.toLowerCase().includes('cashflow')) {
          break;
        }
      }
      if (!textNode) return { found: false, reason: 'cashflow text not found' };
      
      // Walk up ancestors looking for a container with "В работу" button
      let el = textNode.parentElement;
      for (let i = 0; i < 12; i++) {
        if (!el) break;
        const btns = el.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.innerText && btn.innerText.includes('В работу')) {
            btn.scrollIntoView({ block: 'center' });
            return { found: true, depth: i, cardText: el.innerText.substring(0, 120) };
          }
        }
        el = el.parentElement;
      }
      return { found: false, reason: 'В работу button not found within 12 ancestors' };
    });

    log('Cashflow Guard DOM search:', JSON.stringify(cashflowBtnInfo));

    if (cashflowBtnInfo.found) {
      // Small delay after scroll into view, then click the button via DOM
      await page.waitForTimeout(500);
      inWorkBtn = page.locator('button:has-text("В работу")').filter({
        has: page.locator(`xpath=ancestor::*[contains(., 'Cashflow Guard') or contains(., 'cashflow')]`)
      }).first();
      if (!(await inWorkBtn.count() > 0)) {
        // Fallback: click via evaluate
        log('Locator approach failed, clicking via evaluate');
        await page.evaluate(() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let textNode = null;
          while ((textNode = walker.nextNode())) {
            if (textNode.textContent && textNode.textContent.toLowerCase().includes('cashflow')) break;
          }
          if (!textNode) return;
          let el = textNode.parentElement;
          for (let i = 0; i < 12; i++) {
            if (!el) break;
            const btns = el.querySelectorAll('button');
            for (const btn of btns) {
              if (btn.innerText && btn.innerText.includes('В работу')) { btn.click(); return; }
            }
            el = el.parentElement;
          }
        });
        inWorkBtn = null; // Will detect generation started via page text change
      }
      log('Found Cashflow Guard В работу button via DOM walk');
    } else {
      log('WARNING:', cashflowBtnInfo.reason, '— using first В работу as fallback');
      // Last resort: try Банк идей tab
      const ideaBankBtn2 = page.getByRole('tab', { name: /банк идей/i })
        .or(page.getByRole('button', { name: /банк идей/i }));
      if (await ideaBankBtn2.count() > 0) {
        await ideaBankBtn2.first().click();
        await page.waitForTimeout(2000);
        const bankText2 = await page.evaluate(() => document.body.innerText);
        if (bankText2.toLowerCase().includes('cashflow')) {
          log('Found Cashflow in Idea Bank');
          cashflowCardFound = true;
        }
      }
      inWorkBtn = page.getByRole('button', { name: /В работу/i }).first();
    }

    if (!cashflowBtnInfo.found && !(await inWorkBtn?.count() > 0)) {
      log('ERROR: No В работу button found, cannot launch generation');
      await screenshotStep(page, 'ERROR-no-launch-btn');
      await browser.close();
      return { error: 'No launch button found' };
    }

    await screenshotStep(page, '04-before-launch');
    const logPositionBefore = getBackendLogSize();
    log('Backend log position before launch:', logPositionBefore);

    log('Clicking В работу...');
    if (inWorkBtn) {
      await inWorkBtn.click();
    }
    // (evaluate-based click already executed above if inWorkBtn is null)
    const launchTime = Date.now();
    log('Clicked В работу at', new Date().toISOString());

    await page.waitForTimeout(5000);
    await screenshotStep(page, '05-packaging-started');

    // Wait for engine to open (up to 30s)
    let engineOpened = false;
    for (let i = 0; i < 30; i++) {
      const text = await page.evaluate(() => document.body.innerText);
      if (text.includes('Идет первый проход') || text.includes('Live generation') || text.includes('Дизайн-пак')) {
        engineOpened = true;
        log(`Engine opened after ${i * 2}s`);
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (!engineOpened) {
      log('WARNING: Engine may not have opened, checking UI...');
    }

    await screenshotStep(page, '06-engine-opened');

    // Monitor generation for up to 10 minutes (600s)
    const OBSERVE_DURATION = 580000; // ~10 min
    const startObs = Date.now();
    let lastPercent = 0;
    let finalStatus = 'timeout';
    let snapCount = 0;

    while (Date.now() - startObs < OBSERVE_DURATION) {
      await page.waitForTimeout(15000); // check every 15s
      const elapsed = Math.round((Date.now() - startObs) / 1000);

      const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      
      // Extract percentage
      const pctMatch = pageText.match(/(\d+)%/g);
      const pct = pctMatch ? pctMatch[pctMatch.length - 1] : null;
      if (pct && pct !== lastPercent + '%') {
        log(`[${elapsed}s] Progress: ${pct}`);
        lastPercent = parseInt(pct);
      }

      // Check for terminal states
      if (pageText.includes('Quality gate failed after repair') || 
          pageText.includes('generation_failed') ||
          pageText.includes('Current run failed') ||
          pageText.includes('Генерация завершилась') ||
          pageText.includes('Ошибка генерации')) {
        finalStatus = 'fail_quality_gate';
        log(`[${elapsed}s] FAIL: Quality gate failed`);
        break;
      }
      if (pageText.includes('Превью готово') || pageText.includes('Preview ready') || 
          (pageText.includes('Финальная сборка') && !pageText.includes('⚡'))) {
        finalStatus = 'success';
        log(`[${elapsed}s] SUCCESS: Preview ready`);
        break;
      }
      if (pageText.includes('Превью временно недоступно')) {
        finalStatus = 'fail_preview_unavailable';
        log(`[${elapsed}s] FAIL: Preview temporarily unavailable`);
        break;
      }

      // Take periodic snapshots
      if (elapsed % 60 < 15 && snapCount < 20) {
        snapCount++;
        const snapName = `obs-${String(elapsed).padStart(4,'0')}s`;
        await screenshotStep(page, snapName);

        // Log backend progress
        const backendNew = getBackendLogNewContent(logPositionBefore);
        const interesting = backendNew.split('\n').filter(l => 
          l.includes('skeleton') || l.includes('coder') || l.includes('quality') || 
          l.includes('preview') || l.includes('repair') || l.includes('546') ||
          l.includes('block_size') || l.includes('contract')
        ).slice(-5);
        if (interesting.length > 0) log('Backend:', interesting.join(' | '));
      }

      // Check for pipeline stage indicators
      const stageText = pageText.match(/[✓⚡○] (Дизайн-пак|Архитектура|Выбор skeleton|Кодирование|Финальная сборка|Превью)/g);
      if (stageText) log(`[${elapsed}s] Stages:`, stageText.join(', '));
    }

    log(`Final status: ${finalStatus}`);
    await screenshotStep(page, `final-${finalStatus}`);

    // Get new backend log content since launch
    const newLogContent = getBackendLogNewContent(logPositionBefore);

    // Extract telemetry
    const telemetry = extractTelemetryFromLog(newLogContent);

    // Get workspace inspection
    let workspaceInfo = {};
    try {
      const dashTsx = readFileSync('preview-workspace/src/pages/Dashboard.tsx', 'utf8');
      workspaceInfo.dashboardExists = true;
      workspaceInfo.hasProduct = dashTsx.includes('PRODUCT') && !dashTsx.includes('PRODUCT_NAME') && !dashTsx.includes('yourProduct');
      workspaceInfo.hasBottomTabs = dashTsx.includes('BottomTabs') || dashTsx.includes('BOTTOM_TABS');
      workspaceInfo.hasSidebar = dashTsx.includes('Sidebar') || dashTsx.includes('sidebar') || dashTsx.includes('SIDEBAR');
      workspaceInfo.hasEmptyArrays = /=\s*\[\s*\]/.test(dashTsx);
      workspaceInfo.dashboardLineCount = dashTsx.split('\n').length;
      log('Dashboard.tsx lines:', workspaceInfo.dashboardLineCount);
      log('Has PRODUCT token:', workspaceInfo.hasProduct);
      log('Has BottomTabs:', workspaceInfo.hasBottomTabs);
      log('Has Sidebar:', workspaceInfo.hasSidebar);
    } catch {
      workspaceInfo.dashboardExists = false;
      log('Dashboard.tsx not found in workspace');
    }

    // Check for BottomTabs.tsx in workspace
    try {
      readFileSync('preview-workspace/src/components/BottomTabs.tsx', 'utf8');
      workspaceInfo.bottomTabsExists = true;
      log('BottomTabs.tsx exists in workspace');
    } catch {
      workspaceInfo.bottomTabsExists = false;
    }

    // Try to get App.tsx navigation structure
    try {
      const appTsx = readFileSync('preview-workspace/src/App.tsx', 'utf8');
      workspaceInfo.appUsesBottomTabs = appTsx.includes('BottomTabs') || appTsx.includes('BOTTOM_TABS');
      workspaceInfo.appUsesSidebar = appTsx.includes('Sidebar') || appTsx.includes('sidebar');
      workspaceInfo.appLineCount = appTsx.split('\n').length;
    } catch { workspaceInfo.appTsxMissing = true; }

    const result = {
      timestamp: new Date().toISOString(),
      routeAuthority,
      finalStatus,
      telemetry,
      workspaceInfo,
      consoleLogs: consoleLogs.slice(-50),
      networkLog: networkLog.slice(-50),
      logTailSnippet: newLogContent.split('\n').filter(l => 
        l.includes('skeleton') || l.includes('coder') || l.includes('quality') ||
        l.includes('preview') || l.includes('repair') || l.includes('546') ||
        l.includes('block_size') || l.includes('contract') || l.includes('mobile') ||
        l.includes('navigation') || l.includes('nav_mode')
      ).slice(-50),
    };

    writeFileSync(TELEMETRY_OUT, JSON.stringify(result, null, 2));
    log('Telemetry written to', TELEMETRY_OUT);
    log('=== RUN COMPLETE ===');
    log(JSON.stringify({ finalStatus, telemetry, workspaceInfo }, null, 2));

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

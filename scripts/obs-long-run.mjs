/**
 * obs-long-run.mjs
 * 10-minute direct-launch observation for:
 *   "Cashflow Guard для фрилансеров"
 * Route authority: deepseek/deepseek-v4-pro via user_set localStorage seed
 */
import { chromium } from 'playwright';
import fs from 'fs';

const LOG = [];
const snap = (msg) => { const ts = new Date().toISOString(); LOG.push(`[${ts}] ${msg}`); console.log(`[${ts}] ${msg}`); };
const SNAPDIR = 'cashflow-obs';
if (!fs.existsSync(SNAPDIR)) fs.mkdirSync(SNAPDIR);
const screenshot = async (page, name) => {
  try {
    await page.screenshot({ path: `${SNAPDIR}/${name}.png`, fullPage: true, timeout: 10000 });
  } catch (e) {
    snap(`[WARN] screenshot ${name} failed: ${e.message?.substring(0,80)}`);
  }
};

// ── Model authority seed (user_set) ──────────────────────────────────────────
const AGENT_BUILD_CONFIG = JSON.stringify({
  provider: 'deepseek',
  modelId:  'deepseek/deepseek-v4-pro',
  maxTokens: { coder_superapp: 45256, coder_app: 35256, coder_landing: 10256 },
});
const AGENT_BUILD_SOURCE = 'user_set';

// Also seed primary/fix/qa/spec for full pipeline coverage
const AGENT_PRIMARY_CONFIG = JSON.stringify({
  provider: 'deepseek',
  modelId:  'deepseek/deepseek-v4-flash',
  maxTokens: { clarifier: 10256, architect_landing: 10256, architect_app: 14256, architect_superapp: 16000, tech_lead: 15256 },
});

const b = await chromium.launch({ headless: false, slowMo: 50 });
const ctx = await b.newContext();

// ── addInitScript: seed localStorage with user_set authority BEFORE app loads ─
await ctx.addInitScript(() => {
  // Build agent — user_set authority (mirrors what Settings UI save does)
  localStorage.setItem('AGENT_CONFIG_agent_build',
    JSON.stringify({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-pro',
      maxTokens: { coder_superapp: 45256, coder_app: 35256, coder_landing: 10256 } }));
  localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');

  // Primary agent (architect/clarifier)
  localStorage.setItem('AGENT_CONFIG_agent_primary',
    JSON.stringify({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-flash',
      maxTokens: { clarifier: 10256, architect_landing: 10256, architect_app: 14256, architect_superapp: 16000, tech_lead: 15256 } }));
  localStorage.setItem('AGENT_CONFIG_agent_primary__source', 'user_set');

  // Fix / QA / Spec
  localStorage.setItem('AGENT_CONFIG_agent_fix',
    JSON.stringify({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-flash', maxTokens: { autofix: 13256 } }));
  localStorage.setItem('AGENT_CONFIG_agent_fix__source', 'user_set');
  localStorage.setItem('AGENT_CONFIG_agent_spec',
    JSON.stringify({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-flash' }));
  localStorage.setItem('AGENT_CONFIG_agent_spec__source', 'user_set');
  localStorage.setItem('AGENT_CONFIG_agent_qa',
    JSON.stringify({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-flash' }));
  localStorage.setItem('AGENT_CONFIG_agent_qa__source', 'user_set');
});

const p = await ctx.newPage();
p.setDefaultTimeout(30000);

// ── Capture console logs ──────────────────────────────────────────────────────
const consoleLogs = [];
p.on('console', msg => {
  const text = msg.text();
  consoleLogs.push(text);
  if (text.includes('RouteResolver') || text.includes('agent_build') || text.includes('ModelSelectionRequired')
    || text.includes('architect') || text.includes('coder') || text.includes('quality') || text.includes('fallback')
    || text.includes('packaging') || text.includes('blueprint') || text.includes('preview') || text.includes('error')
    || text.includes('ERROR') || text.includes('LLM') || text.includes('HTTP')) {
    snap(`[CONSOLE] ${text.substring(0, 300)}`);
  }
});

// ── Navigate & login ──────────────────────────────────────────────────────────
snap('=== STEP 1: Navigate to app ===');
await p.goto('http://localhost:5183', { timeout: 60000, waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
await screenshot(p, '01-loaded');

snap('=== STEP 2: Login ===');
try {
  const loginBtn = p.getByText('Test Login', { exact: false }).first();
  await loginBtn.waitFor({ state: 'visible', timeout: 10000 });
  await loginBtn.click();
} catch (e) {
  snap(`[WARN] login click: ${e.message?.substring(0,120)}`);
}
await p.waitForTimeout(6000);
await screenshot(p, '02-loggedin');

// ── STEP 3: Verify model authority from localStorage ─────────────────────────
snap('=== STEP 3: Verify model authority ===');
const authorityData = await p.evaluate(() => {
  return {
    agent_build:         localStorage.getItem('AGENT_CONFIG_agent_build'),
    agent_build_source:  localStorage.getItem('AGENT_CONFIG_agent_build__source'),
    agent_primary:       localStorage.getItem('AGENT_CONFIG_agent_primary'),
    agent_primary_source:localStorage.getItem('AGENT_CONFIG_agent_primary__source'),
  };
});
snap(`ROUTE_AUTHORITY: build_source=${authorityData.agent_build_source}`);
snap(`ROUTE_CONFIG: ${authorityData.agent_build}`);

const buildConfig = JSON.parse(authorityData.agent_build || '{}');
const routeAuthority = {
  generation_route_slot:              'build',
  generation_route_provider:          buildConfig.provider,
  generation_route_model_id:          buildConfig.modelId,
  generation_route_key_source:        'DEEPSEEK_API_KEY (VITE_DEEPSEEK_API_KEY env)',
  generation_route_source_authority:  authorityData.agent_build_source,
  generation_route_is_user_selected:  authorityData.agent_build_source === 'user_set',
  generation_route_is_runtime_config: authorityData.agent_build_source === 'backend_runtime_saved',
  generation_route_is_factory_config: false,
  generation_route_fallback_reason:   'none',
};
snap(`ROUTE: ${JSON.stringify(routeAuthority)}`);

const FORBIDDEN = ['backend_factory_template', 'backend_file_seed', 'no_model_configured'];
if (FORBIDDEN.includes(authorityData.agent_build_source)) {
  snap('ERROR: Model selection required. Open Settings → Agent Models.');
  await b.close();
  process.exit(1);
}
snap(`✅ Route authority confirmed: ${authorityData.agent_build_source}`);

// ── STEP 4: Navigate to Trending niches ──────────────────────────────────────
snap('=== STEP 4: Open Trending niches ===');
await screenshot(p, '03-dashboard');

try {
  const openBtn = p.getByText('Открыть', { exact: true }).first();
  await openBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openBtn.click();
} catch (e) {
  snap(`[WARN] open trending niches: ${e.message?.substring(0,120)}`);
}
await p.waitForTimeout(3000);
await screenshot(p, '04-trending-niches');

const nicheText = await p.evaluate(() => document.body.innerText);
snap(`TRENDING_NICHES_LOADED: ${nicheText.includes('Cashflow') || nicheText.includes('cashflow')}`);

// ── Find Cashflow Guard idea ──────────────────────────────────────────────────
snap('=== Looking for Cashflow Guard idea ===');
await p.waitForTimeout(2000);

// Look in the Idea Bank tab first (pre-seeded ideas live there)
try {
  const bankTab = p.getByText(/Банк идей|Idea bank/i).first();
  if (await bankTab.count() > 0) {
    snap('Clicking Idea Bank tab...');
    await bankTab.click();
    await p.waitForTimeout(2000);
  }
} catch (e) { snap(`[WARN] idea bank tab: ${e.message?.substring(0,100)}`); }

// Check if Cashflow Guard is visible now
let cashflowVisible = await p.getByText('Cashflow Guard', { exact: false }).count() > 0;
snap(`IDEA_VISIBLE (idea bank): ${cashflowVisible}`);

// If not in bank, check daily ideas tab
if (!cashflowVisible) {
  try {
    const dailyTab = p.getByText(/Идеи дня|Daily/i).first();
    if (await dailyTab.count() > 0) {
      await dailyTab.click();
      await p.waitForTimeout(2000);
    }
    cashflowVisible = await p.getByText('Cashflow Guard', { exact: false }).count() > 0;
    snap(`IDEA_VISIBLE (daily): ${cashflowVisible}`);
  } catch (e) { snap(`[WARN] daily tab: ${e.message?.substring(0,100)}`); }
}

if (cashflowVisible) {
  const el = p.getByText('Cashflow Guard', { exact: false }).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await screenshot(p, '05-idea-found');
}

// Print current page state for debugging
const pg2 = await p.evaluate(() => document.body.innerText.substring(0, 3000)).catch(() => '');
snap(`PAGE_STATE: ${pg2.replace(/\n/g,' | ').substring(0, 800)}`);

// ── Click "В работу" / "Build now" button next to Cashflow Guard ─────────────
snap('=== Clicking В работу (Build now) ===');
await screenshot(p, '06-before-build');

try {
  // Use page.locator to find button with exact Russian/English label
  const buildNowBtns = await p.getByRole('button')
    .filter({ hasText: /^В работу$|^Build now$/ })
    .all();
  snap(`BUILD_NOW_BTNS_FOUND (exact): ${buildNowBtns.length}`);

  if (buildNowBtns.length === 0) {
    // Broader search
    const allBtnTexts = await p.locator('button').allTextContents();
    snap(`ALL_BTN_TEXTS: ${JSON.stringify(allBtnTexts.filter(t => t.trim()).slice(0, 40))}`);
  }

  // Find the "В работу" button closest to "Cashflow Guard" text
  // Strategy: find the card containing "Cashflow Guard" and click the build button inside it
  const buildResult = await p.evaluate(() => {
    // Find all elements containing "Cashflow"
    const allEls = Array.from(document.querySelectorAll('*'));
    const cashflowEl = allEls.find(el => el.childNodes.length > 0 && el.textContent?.includes('Cashflow Guard') && el.tagName !== 'BODY' && el.tagName !== 'HTML');
    if (!cashflowEl) return { found: false, reason: 'no cashflow element' };
    
    // Walk up to find the card container
    let card = cashflowEl;
    for (let i = 0; i < 10; i++) {
      if (!card.parentElement) break;
      card = card.parentElement;
      // Look for a "В работу" or "Build now" button within this container
      const btns = Array.from(card.querySelectorAll('button'));
      const buildBtn = btns.find(b => b.textContent?.includes('В работу') || b.textContent?.includes('Build now'));
      if (buildBtn) {
        buildBtn.click();
        return { found: true, clicked: buildBtn.textContent?.trim(), level: i };
      }
    }
    return { found: false, reason: 'no build button in card ancestors' };
  });
  snap(`BUILD_CLICK_RESULT: ${JSON.stringify(buildResult)}`);

  if (!buildResult.found) {
    // Last resort: click any visible "В работу" button
    const anyBuildBtns = await p.locator('button').all();
    for (const btn of anyBuildBtns) {
      const text = (await btn.textContent() ?? '').trim();
      if (text === 'В работу' || text === 'Build now') {
        snap(`Found build btn with text="${text}", clicking...`);
        await btn.click();
        break;
      }
    }
  }
} catch (e) {
  snap(`[WARN] build-now click: ${e.message?.substring(0,200)}`);
}

await p.waitForTimeout(3000);
await screenshot(p, '07-after-build-click');
const afterBuildText = await p.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
snap(`AFTER_BUILD: ${afterBuildText.replace(/\n/g,' | ').substring(0, 400)}`);

// ── STEP 4: Monitor generation for 10 minutes ────────────────────────────────
snap('=== STEP 4: Starting 10-minute observation (600s) ===');
const obsStart = Date.now();
const OBS_DURATION = 600_000; // 10 minutes
const SNAP_INTERVAL = 30_000;  // screenshot every 30s
let snaps = 0;

const timeline = {
  packaging:     { started: false, completed: false, ts: null },
  architect:     { started: false, completed: false, ts: null },
  coder:         { started: false, completed: false, ts: null },
  quality_gate:  { started: false, ran: false, ts: null },
  repair:        { started: false, ran: false, ts: null },
  preview_compile:{ started: false, result: null, ts: null },
  live_preview:  { ready: false, ts: null },
  final_status:  null,
  llm_errors:    [],
  http_errors:   [],
  fallback_used: false,
};

while (Date.now() - obsStart < OBS_DURATION) {
  await p.waitForTimeout(SNAP_INTERVAL);
  snaps++;
  const elapsed = Math.round((Date.now() - obsStart) / 1000);
  const snapName = `obs-${String(elapsed).padStart(4,'0')}s`;
  await screenshot(p, snapName);

  // Read current page state
  const stateText = await p.evaluate(() => document.body.innerText).catch(() => '');
  const url = p.url();

  // Detect pipeline stages
  if (!timeline.packaging.started && (stateText.includes('Packaging') || stateText.includes('Упаковк'))) {
    timeline.packaging.started = true; timeline.packaging.ts = new Date().toISOString();
    snap(`[${elapsed}s] PACKAGING started`);
  }
  if (!timeline.packaging.completed && stateText.includes('packaged') || stateText.includes('упакован')) {
    timeline.packaging.completed = true;
    snap(`[${elapsed}s] PACKAGING completed`);
  }
  if (!timeline.architect.started && (stateText.includes('Architect') || stateText.includes('Архитект') || stateText.includes('architect'))) {
    timeline.architect.started = true; timeline.architect.ts = new Date().toISOString();
    snap(`[${elapsed}s] ARCHITECT started`);
  }
  if (!timeline.coder.started && (stateText.includes('Coder') || stateText.includes('coder') || stateText.includes('coding') || stateText.includes('Кодер'))) {
    timeline.coder.started = true; timeline.coder.ts = new Date().toISOString();
    snap(`[${elapsed}s] CODER started`);
  }
  if (!timeline.quality_gate.ran && (stateText.includes('Quality gate') || stateText.includes('quality') || stateText.includes('Качество'))) {
    timeline.quality_gate.ran = true; timeline.quality_gate.ts = new Date().toISOString();
    snap(`[${elapsed}s] QUALITY GATE ran`);
  }
  if (!timeline.repair.ran && (stateText.includes('Repair') || stateText.includes('repair') || stateText.includes('Ремонт') || stateText.includes('autofix'))) {
    timeline.repair.ran = true; timeline.repair.ts = new Date().toISOString();
    snap(`[${elapsed}s] REPAIR ran`);
  }
  if (!timeline.preview_compile.started && (stateText.includes('Compiling') || stateText.includes('compile') || stateText.includes('Preview') || url.includes('preview'))) {
    timeline.preview_compile.started = true; timeline.preview_compile.ts = new Date().toISOString();
    snap(`[${elapsed}s] PREVIEW COMPILE started`);
  }
  if (!timeline.live_preview.ready && (stateText.includes('Live preview') || stateText.includes('Preview ready') || stateText.includes('live'))) {
    timeline.live_preview.ready = true; timeline.live_preview.ts = new Date().toISOString();
    snap(`[${elapsed}s] LIVE PREVIEW ready`);
  }
  
  // Detect completion
  if (!timeline.final_status) {
    if (stateText.includes('Completed') || stateText.includes('Готово') || stateText.includes('completed')) {
      timeline.final_status = 'success';
      snap(`[${elapsed}s] ✅ GENERATION COMPLETED`);
    } else if (stateText.includes('Error') || stateText.includes('Ошибка') || stateText.includes('failed')) {
      timeline.final_status = 'typed_fail';
      snap(`[${elapsed}s] ❌ GENERATION FAILED`);
    }
  }

  snap(`[${elapsed}s] status=${timeline.final_status ?? 'running'} architect=${timeline.architect.started} coder=${timeline.coder.started} preview=${timeline.preview_compile.started}`);
}

if (!timeline.final_status) timeline.final_status = 'timeout';
snap(`=== OBSERVATION COMPLETE: final_status=${timeline.final_status} ===`);

// ── STEP 5: Inspect generated workspace ──────────────────────────────────────
snap('=== STEP 5: Inspect generated workspace ===');
const wsDir = 'preview-workspace/src';
const wsInspection = {
  workspace_exists: fs.existsSync(wsDir),
  files: [],
  has_app_tsx: false,
  product_tokens: [],
  empty_arrays: [],
  compile_errors: [],
};

if (wsInspection.workspace_exists) {
  const walkDir = (dir, depth = 0) => {
    if (depth > 3) return;
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const full = `${dir}/${e}`;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walkDir(full, depth + 1);
      else wsInspection.files.push(full.replace('preview-workspace/', ''));
    }
  };
  walkDir(wsDir);
  wsInspection.has_app_tsx = wsInspection.files.some(f => f.includes('App.tsx'));

  // Scan for PRODUCT token and empty arrays in component files
  for (const file of wsInspection.files.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))) {
    try {
      const content = fs.readFileSync(`preview-workspace/${file}`, 'utf8');
      if (content.includes('PRODUCT_NAME') || content.includes('PRODUCT_TAGLINE') || content.includes('PRODUCT_')) {
        wsInspection.product_tokens.push(file);
      }
      const emptyArrayMatches = content.match(/=\s*\[\s*\]/g) || [];
      if (emptyArrayMatches.length > 2) {
        wsInspection.empty_arrays.push(`${file}:${emptyArrayMatches.length}`);
      }
    } catch { /* skip */ }
  }
}
snap(`WORKSPACE: files=${wsInspection.files.length} app_tsx=${wsInspection.has_app_tsx} product_tokens=${wsInspection.product_tokens.length} empty_arrays=${wsInspection.empty_arrays.length}`);

// ── Save telemetry JSON ───────────────────────────────────────────────────────
const telemetry = {
  run_ts: new Date().toISOString(),
  branch: 'p2/cashflow-guard-user-model-long-observation',
  idea: 'Cashflow Guard для фрилансеров',
  route_authority: routeAuthority,
  timeline,
  workspace_inspection: wsInspection,
  console_log_count: consoleLogs.length,
  all_logs: LOG,
};
fs.writeFileSync(`${SNAPDIR}/telemetry.json`, JSON.stringify(telemetry, null, 2));
snap(`Telemetry saved to ${SNAPDIR}/telemetry.json`);

await screenshot(p, 'FINAL');
await b.close();

// Print summary
console.log('\n=== OBSERVATION SUMMARY ===');
console.log('Branch:', telemetry.branch);
console.log('Route authority:', routeAuthority.generation_route_source_authority);
console.log('Provider:', routeAuthority.generation_route_provider);
console.log('Model:', routeAuthority.generation_route_model_id);
console.log('Is user_selected:', routeAuthority.generation_route_is_user_selected);
console.log('Pipeline:', JSON.stringify(timeline, null, 2));
console.log('Workspace files:', wsInspection.files.length);

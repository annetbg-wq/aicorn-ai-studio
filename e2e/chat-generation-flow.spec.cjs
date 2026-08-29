// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const BASE_URL     = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;
const LIVE_CANARY_PROMPT = 'landing page for a simple counter product';
const WATCHDOG_WINDOW_MS = readWatchdogWindowMs();
const WATCHDOG_STABLE_TIMEOUT_MS = Math.max(
  WATCHDOG_WINDOW_MS * 3,
  WATCHDOG_WINDOW_MS + (process.env.CI ? 45_000 : 20_000),
);
const LIVE_FLOW_TIMEOUT = Math.max(300_000, WATCHDOG_STABLE_TIMEOUT_MS + 90_000);

const PREVIEW_FILES = {
  'src/App.tsx': [
    "import { useState } from 'react';",
    '',
    'export default function App() {',
    '  const [count, setCount] = useState(0);',
    '  return (',
    '    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>',
    '      <section style={{ display: "grid", gap: 12, textAlign: "center" }}>',
    '        <h1 style={{ margin: 0 }}>Todo</h1>',
    '        <p style={{ margin: 0, opacity: 0.8 }}>Seeded Playwright preview</p>',
    '        <p data-testid="count-value" style={{ margin: 0, fontSize: 32 }}>{count}</p>',
    '        <button onClick={() => setCount(value => value + 1)} style={{ padding: "12px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "#22c55e", color: "#052e16", fontWeight: 700 }}>',
    '          Add task',
    '        </button>',
    '      </section>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
};

const LIVE_CANARY_APP_TSX = [
  "import { useState } from 'react';",
  '',
  'export default function App() {',
  '  const [count, setCount] = useState(0);',
  '  return (',
  '    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#111827", color: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>',
  '      <section data-testid="live-canary-surface" style={{ width: "min(560px, 100%)", display: "grid", gap: 16 }}>',
  '        <p style={{ margin: 0, color: "#93c5fd", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>Live preview canary</p>',
  '        <h1 style={{ margin: 0, fontSize: 42, lineHeight: 1.05 }}>Counter ready</h1>',
  '        <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>This surface was generated through the real candidate, compile, final check, and promotion path.</p>',
  '        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>',
  '          <strong data-testid="count-value" style={{ fontSize: 36 }}>{count}</strong>',
  '          <button type="button" onClick={() => setCount(value => value + 1)} style={{ padding: "12px 16px", borderRadius: 8, border: "0", background: "#22c55e", color: "#052e16", fontWeight: 800, cursor: "pointer" }}>Increment</button>',
  '        </div>',
  '        <ul style={{ margin: 0, paddingLeft: 20, color: "#d1d5db" }}>',
  '          <li>Candidate materialized</li>',
  '          <li>Compiled preview mounted</li>',
  '          <li>Final live check passed</li>',
  '        </ul>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '',
].join('\n');

const LIVE_CANARY_PLAN_RESPONSE = JSON.stringify({
  appName: 'Live Canary Counter',
  summary: 'A stable one-screen counter used to prove live preview promotion.',
  pages: ['Home'],
  steps: [
    { id: 'think', label: 'Define the narrow canary surface' },
    { id: 'architect', label: 'Use one self-contained screen' },
    { id: 'code', label: 'Generate a React counter' },
    { id: 'theme', label: 'Apply a compact dark interface' },
    { id: 'save', label: 'Saving project' },
  ],
  assumptions: ['Keep the scenario intentionally small for CI stability'],
});

const LIVE_CANARY_ARCHITECT_RESPONSE = JSON.stringify({
  appName: 'Live Canary Counter',
  description: 'A minimal counter that proves the preview pipeline can ship a live generated surface.',
  theme: 'dark-slate',
  targetUser: 'Release engineer validating preview reliability',
  productStrategy: {
    coreAction: 'Increment a visible counter',
    retentionLoop: 'Not applicable for the canary',
    businessModel: 'free',
    paywall: {
      needed: false,
      trigger: '',
      lockedFeature: '',
      upgradeMessage: '',
      surface: 'inline',
    },
  },
  userJourney: {
    onboarding: {
      needed: false,
      reason: 'The canary has no user-specific setup',
      steps: [],
      completionAction: 'Open the counter immediately',
    },
    firstSession: 'The user sees a headline, a counter value, and an increment button.',
    returningSession: 'The same stable surface renders again.',
  },
  layout: {
    type: 'single',
    navigation: 'none',
    primaryColor: 'green action accent',
  },
  pages: [
    {
      path: '/',
      name: 'App',
      file: 'App.tsx',
      purpose: 'Render the live preview canary counter surface.',
      isMainScreen: true,
      showInNav: false,
      guard: { type: 'none' },
      uiSpec: 'One centered dark surface with a small label, a clear headline, explanatory text, a large numeric count, one increment button, and a short status list. The layout remains stable on mobile and desktop.',
      keyElements: ['Counter value', 'Increment button', 'Pipeline status list'],
    },
  ],
  authFlow: {
    type: 'none',
    reason: 'No identity is needed for the canary',
    localFirst: true,
    comment: 'Preview reliability only',
  },
  dataModel: {
    entities: [{ name: 'CounterState', fields: 'count: number' }],
    seedData: {
      needed: false,
      reason: 'The counter starts at zero',
      examples: [],
    },
    sharedState: 'count in App.tsx local state',
  },
  uxPatterns: {
    emptyStates: false,
    loadingSkeletons: false,
    searchAndFilter: false,
    onboarding: false,
    swipeActions: false,
    pullToRefresh: false,
    hapticFeedback: false,
    animations: 'none',
  },
  responsiveness: {
    primaryDevice: 'desktop',
    mobileFirst: false,
    maxWidth: 'max-w-2xl',
  },
  criticalUiRules: [
    'Render visible text immediately',
    'Expose one interactive button',
    'Avoid placeholder-only content',
  ],
  shadcnComponents: [],
  icons: [],
});

const LIVE_CANARY_TECH_RESPONSE = JSON.stringify({
  technicalBlueprint: {
    appShell: {
      routingStrategy: 'Single App.tsx route with no router',
      stateStrategy: 'Local count state in App.tsx',
      persistenceStrategy: 'No persistence required',
      guardStrategy: 'No guards',
    },
    fileStructure: [
      { file: 'App.tsx', purpose: 'Render the counter canary surface' },
    ],
    componentContracts: [
      {
        file: 'App.tsx',
        responsibility: 'Own the counter state and visible canary UI',
        mustRender: ['Live preview canary label', 'Counter ready heading', 'Increment button'],
        uses: ['React useState'],
        localState: ['count: number'],
      },
    ],
    dataFlow: { entities: ['CounterState'] },
    criticalPaths: ['Initial render', 'Increment click'],
    implementationRisks: ['Keep output small and dependency-free'],
  },
});

const LIVE_CANARY_CODER_RESPONSE = JSON.stringify({
  artifact: {
    entry: 'src/App.tsx',
    dependencies: [],
    files: [
      {
        path: 'src/App.tsx',
        content: LIVE_CANARY_APP_TSX,
      },
    ],
  },
});

const LIVE_CANARY_ARCHITECT_ANALYSIS_RESPONSE = JSON.stringify({
  productType: 'app',
  branchBriefSummary: 'One-screen counter canary for preview release confidence.',
  firstPassCapabilities: ['local-state'],
  deferredCapabilities: [],
  implementationOrder: ['Render the counter surface', 'Wire the increment button', 'Keep preview non-blank'],
  openQuestions: [],
});

// ProtoPipeline uses stream:false for ALL LLM calls. Route by system prompt keyword.
const LIVE_CANARY_PROTO_ARCHITECT_PLAN = JSON.stringify({
  appName: 'Live Canary Counter',
  skeleton: 'landing-page',
  summary: 'A minimal counter that proves the preview pipeline works end-to-end.',
  fileTree: {
    'src/App.tsx': 'Root app: renders the live canary counter surface with a visible section and increment button',
  },
});

const LIVE_CANARY_PROTO_CODER_PLAN =
  `<<<FILE: src/App.tsx>>>\n${LIVE_CANARY_APP_TSX}\n<<<END>>>`;

// ── helpers ──────────────────────────────────────────────────────────────────

function parseMsLiteral(raw) {
  const n = Number(String(raw).replace(/_/g, ''));
  return Number.isFinite(n) ? n : null;
}

function readWatchdogWindowMs() {
  const sourcePath = path.resolve(__dirname, '..', 'frontend', 'src', 'services', 'WhiteScreenDetector.ts');
  try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const match = source.match(/POST_PROMOTION_WATCHDOG_WINDOW_MS\s*=\s*([0-9_]+)/);
    return parseMsLiteral(match?.[1]) ?? 5_000;
  } catch {
    return 5_000;
  }
}

async function expectProductionArtifactStudio(page) {
  const response = await page.request.get(`${BASE_URL}/studio`);
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).not.toContain('/@vite/client');
  expect(html).not.toContain('/src/main.tsx');
  expect(html).toMatch(/\/assets\/[^"']+\.js/);
}

async function bypassAuth(page) {
  await page.evaluate(() => {
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function openEngine(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await bypassAuth(page);
  await page.locator('[title="System Engine"]').click();
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function typeInChat(page, text) {
  const textarea = page.locator('textarea').first();
  await textarea.fill(text);
  // Enter can be flaky in CI when focus briefly shifts; click send as a stable fallback.
  await textarea.press('Enter');
  const sendBtn = page.locator('textarea').first().locator('xpath=following-sibling::button[not(@disabled) and not(@title="Stop generation")]').first();
  if (await sendBtn.count()) {
    await sendBtn.click({ force: true }); // игнорим перекрытие
  }
}

function responseTextForLLM(systemText, userText, stream) {
  if (!stream) {
    if (systemText.includes('senior product architect')) {
      return LIVE_CANARY_PROTO_ARCHITECT_PLAN;
    }
    if (
      systemText.includes('senior React') ||
      systemText.includes('fixing build errors')
    ) {
      return LIVE_CANARY_PROTO_CODER_PLAN;
    }
    return LIVE_CANARY_ARCHITECT_ANALYSIS_RESPONSE;
  }
  if (systemText.includes('Generate a step-by-step plan')) {
    return LIVE_CANARY_PLAN_RESPONSE;
  }
  if (systemText.includes('Senior Tech Lead')) {
    return LIVE_CANARY_TECH_RESPONSE;
  }
  if (
    systemText.includes('top-tier product founder') ||
    systemText.includes('web developer designing a landing page')
  ) {
    return LIVE_CANARY_ARCHITECT_RESPONSE;
  }
  if (
    systemText.includes('React') ||
    systemText.includes('developer') ||
    userText.includes('CURRENT USER REQUEST')
  ) {
    return LIVE_CANARY_CODER_RESPONSE;
  }
  return LIVE_CANARY_PLAN_RESPONSE;
}

function sseFromText(text) {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
}

async function installDeterministicLLM(page) {
  await page.route('**/functions/v1/llm-proxy', async (route) => {
    const request = route.request();
    const rawProxyBody = request.postData() || '{}';
    let proxyBody = {};
    let llmBody = {};
    try {
      proxyBody = JSON.parse(rawProxyBody);
      llmBody = JSON.parse(proxyBody.body || '{}');
    } catch {
      // Fall through to a safe response below.
    }

    const messages = Array.isArray(llmBody.messages) ? llmBody.messages : [];
    const toText = (value) => Array.isArray(value)
      ? value.map(part => part?.text || '').join('\n')
      : String(value || '');
    const systemText = toText(messages[0]?.content);
    const userText = toText(messages[messages.length - 1]?.content);
    const stream = Boolean(proxyBody.stream || llmBody.stream);
    const text = responseTextForLLM(systemText, userText, stream);

    if (!stream) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: text } }] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseFromText(text),
    });
  });
}

function timelineLines(logs) {
  return logs.filter(line => line.includes('[preview-timeline]'));
}

function timelineIndex(logs, event, includesText) {
  return logs.findIndex(line =>
    line.includes('[preview-timeline]') &&
    line.includes(event) &&
    (!includesText || line.includes(includesText))
  );
}

async function serializeConsoleMessage(msg) {
  const values = await Promise.all(
    msg.args().map(async (arg) => {
      try {
        const value = await arg.jsonValue();
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return String(arg);
      }
    }),
  );
  return values.join(' ');
}

async function collectLiveCanaryDiagnostics(page, logs, error) {
  const iframeState = await page.locator('[data-testid="preview-iframe"]').evaluate((iframe) => {
    const frame = iframe;
    const doc = frame.contentDocument;
    const root = doc?.getElementById('root');
    return {
      src: frame.getAttribute('src'),
      rootText: root?.textContent?.trim().slice(0, 500) ?? '',
      rootChildCount: root?.children.length ?? null,
      bodyText: doc?.body?.textContent?.trim().slice(0, 500) ?? '',
    };
  }).catch(err => ({ error: String(err) }));

  const e2eDiagnostics = await page.evaluate(() =>
    window.__E2E_PREVIEW_TEST?.getDiagnostics?.() ?? null,
  ).catch(err => ({ error: String(err) }));

  const timeline = timelineLines(logs);
  return {
    error: error ? String(error?.stack || error?.message || error) : null,
    finalStopReason: [...timeline].reverse().find(line => line.includes('final_stop_reason')) ?? null,
    shipOutcome: [...timeline].reverse().find(line => line.includes('ship_outcome')) ?? null,
    promotion: timeline.filter(line => line.includes('promotion')),
    rollback: timeline.filter(line => line.includes('rollback') || line.includes('revoked')),
    lastTimelineEvents: timeline.slice(-80),
    iframeState,
    e2eDiagnostics,
    watchdog: {
      sourceWindowMs: WATCHDOG_WINDOW_MS,
      assertTimeoutMs: WATCHDOG_STABLE_TIMEOUT_MS,
    },
  };
}

async function attachLiveCanaryDiagnostics(testInfo, page, logs, error) {
  const diagnostics = await collectLiveCanaryDiagnostics(page, logs, error);
  await testInfo.attach('live-preview-canary-diagnostics.json', {
    contentType: 'application/json',
    body: JSON.stringify(diagnostics, null, 2),
  });
}

async function clickLatestConfirmPlan(page) {
  const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
  await expect(confirmBtn).toBeVisible({ timeout: FLOW_TIMEOUT });
  await confirmBtn.click();
}

async function waitForE2EPreviewHook(page) {
  await expect(async () => {
    const ok = await page.evaluate(() =>
      typeof window.__E2E_PREVIEW_TEST?.mountPreview === 'function',
    );
    expect(ok).toBe(true);
  }).toPass({ timeout: 8_000, intervals: [200, 400, 800] });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Chat → generation → blueprint → preview', () => {
  test.setTimeout(LIVE_FLOW_TIMEOUT);

  test('fully live generation reaches promoted non-blank preview @preview-live-canary', async ({ page }, testInfo) => {
    const logs = [];
    page.on('console', (msg) => {
      serializeConsoleMessage(msg)
        .then(line => logs.push(line))
        .catch(() => logs.push(msg.text()));
    });

    try {
      await installDeterministicLLM(page);
      await page.addInitScript(() => {
        localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY', '1');
        localStorage.setItem('OPENROUTER_API_KEY', 'e2e-live-preview-key');
        // PR #35: resolveStandardRoute('build') throws ModelSelectionRequiredError
        // when the build slot has no user-selected model (factory config or empty).
        // Set an explicit user-selected build model so the canary's pipeline starts.
        // The LLM is fully mocked (installDeterministicLLM) — the model ID is never
        // sent to a real API; it exists only to satisfy the route authority check.
        localStorage.setItem(
          'AGENT_CONFIG_agent_build',
          JSON.stringify({ provider: 'openrouter', modelId: 'openai/gpt-4o-mini' }),
        );
        localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
      });

      await expectProductionArtifactStudio(page);
      await openEngine(page);

      await typeInChat(page, LIVE_CANARY_PROMPT);
      console.log('CANARY_STEP: prompt_typed');

      // If the surface-choice card appears (no modeSetByUser yet), click APP so the
      // pipeline continues immediately without waiting for the 60 s auto-timeout.
      await page.locator('[data-testid="surface-choice-btn-app"]')
        .click({ timeout: 5_000 })
        .catch(() => { /* card may not appear if mode was already set */ });
      console.log('CANARY_STEP: surface_choice_checked');

      // With a fast deterministic mock, generatePlan() returns in <50 ms — shorter
      // than Playwright's polling interval.  FallbackPlanCard appears and disappears
      // before toBeVisible() can fire.  Try to click confirm opportunistically; the
      // pipeline runs independently of user confirmation, so a missed click is not fatal.
      await page
        .locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]')
        .last()
        .click({ timeout: 3_000 })
        .catch(() => {});
      console.log('CANARY_STEP: plan_card_confirm_attempted');

      // ── PR #35 fast-fail guard ───────────────────────────────────────────────
      // After PR #35, resolveStandardRoute('build') throws ModelSelectionRequiredError
      // when the build slot has no explicit user-selected model. This causes
      // failBeforePipelineRun() to display "Open Settings → Agent Models" in the chat
      // UI without emitting any [preview-timeline] events. The canary would then wait
      // the full LIVE_FLOW_TIMEOUT (300+ s) before failing.
      //
      // This guard catches the misconfiguration within 3 s and fails with a clear
      // diagnostic so CI gives actionable output instead of a silent timeout.
      {
        await page.waitForTimeout(3_000);
        const bodySnapshot = await page.locator('body').innerText().catch(() => '');
        if (bodySnapshot.includes('Open Settings') && bodySnapshot.includes('Agent Models')) {
          throw new Error(
            '[Live Preview Canary] PR #35 gate: resolveStandardRoute("build") threw ' +
            'ModelSelectionRequiredError before the pipeline could start. ' +
            'Fix: addInitScript must set AGENT_CONFIG_agent_build with user_set authority. ' +
            'See: frontend/src/services/__tests__/canaryModelSetup.test.ts',
          );
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      // Either the pipeline is already compiling, or a follow-up plan card appeared.
      // Poll for controller_compiling with the full live-flow budget.
      await expect(async () => {
        // Secondary fast-fail: if the model-not-configured error appeared late,
        // fail immediately instead of cycling through the full budget.
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (bodyText.includes('Open Settings') && bodyText.includes('Agent Models')) {
          throw new Error(
            '[Live Preview Canary] Model selection required error detected mid-poll. ' +
            'AGENT_CONFIG_agent_build must be set with user_set authority (PR #35).',
          );
        }
        const followUpConfirm = page
          .locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]')
          .last();
        if (await followUpConfirm.isVisible().catch(() => false)) {
          await followUpConfirm.click();
          return;
        }
        expect(timelineLines(logs).some(line => line.includes('controller_compiling'))).toBe(true);
      }).toPass({ timeout: LIVE_FLOW_TIMEOUT, intervals: [500, 1_000, 2_000] });
      console.log('CANARY_STEP: controller_compiling_seen');

      // ── Route authority assertion ─────────────────────────────────────────────
      // Confirm the canary's build route is not using factory/no-model authority.
      // Lines matching [RouteResolver] or [Route] are emitted by resolveStandardRoute
      // and addLog in useStudio respectively.
      {
        const FORBIDDEN_AUTHORITIES = ['backend_factory_template', 'backend_file_seed', 'no_model_configured'];
        const routeLogs = logs.filter(l => l.includes('[RouteResolver]') || l.includes('[Route] build'));
        for (const forbidden of FORBIDDEN_AUTHORITIES) {
          if (routeLogs.some(l => l.includes(forbidden))) {
            throw new Error(
              `[Live Preview Canary] Forbidden route authority "${forbidden}" found in canary logs. ` +
              'Canary must use user_set, backend_runtime_saved, or a named fallback authority. ' +
              'backend/agent-config.json must NOT be the route authority.',
            );
          }
        }
        console.log('CANARY_STEP: route_authority_ok');
      }
      // ─────────────────────────────────────────────────────────────────────────

      // Extract buildId from the controller_compiling timeline log.
      // Format after serializeConsoleMessage: [preview-timeline] controller_compiling {"buildId":"uuid",...}
      let canaryBuildId = null;
      for (const line of [...timelineLines(logs)].reverse()) {
        const m = line.match(/"buildId"\s*:\s*"([\w-]+)"/);
        if (m) { canaryBuildId = m[1]; break; }
      }

      // Get the previewSession token the frontend bound to this buildId.
      // It is persisted in sessionStorage by PreviewSessionService.
      const canaryPreviewSession = await page.evaluate(() =>
        sessionStorage.getItem('AIC_PREVIEW_SESSION_ID'),
      ).catch(() => null);

      // Poll backend build status until ready. Replaces frontend ready_set signal.
      let _lastStatusSeen = null;
      await expect(async () => {
        if (!canaryBuildId) throw new Error('buildId not found in controller_compiling log');
        const statusRes = await page.request.get(
          `${BASE_URL}/api/preview/${canaryBuildId}/status`,
          { headers: { 'X-Preview-Session': canaryPreviewSession ?? '' } },
        );
        if (statusRes.status() === 404) throw new Error('build status not registered yet');
        const body = await statusRes.json();
        const s = body?.status;
        if (s !== _lastStatusSeen) {
          console.log(`CANARY_STEP: build_status_${s}`);
          _lastStatusSeen = s;
        }
        expect(s).toBe('ready');
      }).toPass({ timeout: LIVE_FLOW_TIMEOUT, intervals: [2_000, 3_000, 5_000] });
      console.log('CANARY_STEP: build_status_ready');

      // ── TEMP DIAGNOSTIC (Claude investigation — remove before merge) ──────────
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(5_000);
        const diag = await page.evaluate(() => {
          const w = window;
          return {
            hasHook: !!w.__E2E_PREVIEW_TEST,
            controller: w.__E2E_PREVIEW_TEST?.getDiagnostics?.().controller ?? null,
            revision: w.__E2E_PREVIEW_TEST?.getDiagnostics?.().revision ?? null,
            iframeCount: document.querySelectorAll('iframe').length,
            hasTestidIframe: !!document.querySelector('[data-testid="preview-iframe"]'),
          };
        });
        console.log(`DEBUG_DIAG[${i}]: ` + JSON.stringify(diag));
      }
      console.log('DEBUG_TIMELINE_TAIL: ' + JSON.stringify(timelineLines(logs).slice(-25)));
      // ───────────────────────────────────────────────────────────────────────────

      // Compile is now confirmed ready by backend; iframe should be rendered.
      const iframe = page.locator('[data-testid="preview-iframe"]');
      await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
      console.log('CANARY_STEP: iframe_seen');
      await expect(async () => {
        const src = await iframe.getAttribute('src');
        expect(src).toBeTruthy();
        expect(src).not.toBe('about:blank');
        expect(src).toMatch(new RegExp(`/preview/${canaryBuildId}`, 'i'));
      }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 3_000] });
      console.log('CANARY_STEP: iframe_url_ok');

      await expect(
        page.frameLocator('[data-testid="preview-iframe"]').locator('[data-testid="live-canary-surface"]')
      ).toBeVisible({ timeout: FLOW_TIMEOUT });
      await expect(page.frameLocator('[data-testid="preview-iframe"]').locator('body')).toContainText(
        'Live preview canary',
        { timeout: FLOW_TIMEOUT },
      );
      console.log('CANARY_STEP: iframe_loaded');
      console.log('CANARY_STEP: live_surface_seen');

      await expect(async () => {
        expect(timelineLines(logs).some(line => line.includes('generation_preview_ownership_released'))).toBe(true);
      }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 5_000] });
      console.log('CANARY_STEP: ownership_released');

      await attachLiveCanaryDiagnostics(testInfo, page, logs, null);
    } catch (error) {
      await attachLiveCanaryDiagnostics(testInfo, page, logs, error);
      throw error;
    }
  });

  test('plan confirmation hands off to a real compiled preview without crashing', async ({ page }) => {
    // 1. Open studio
    await openEngine(page);
    await page.evaluate(() => {
      localStorage.setItem('AIC_E2E_BLUEPRINT_SHORTCUT', '1');
    });
    await waitForE2EPreviewHook(page);

    // 2. Send prompt — plan card appears immediately, no clarifier step
    await typeInChat(page, 'todo app with supabase');
    await expect(page.locator('[data-testid="generation-plan-card"]')).toBeVisible({ timeout: 60_000 });

    // 3. Confirm the plan
    const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // 4. "Building…" confirms blueprint was accepted
    await expect(
      page.locator('text=⚙️ Building…').or(page.locator('text=Building…'))
    ).toBeVisible({ timeout: 10_000 });

    // 5. In Playwright mode, mount a deterministic real compiled preview build
    // through the dedicated e2e hook rather than the full live generation path.
    await page.evaluate(async (previewFiles) => {
      await window.__E2E_PREVIEW_TEST.mountPreview(previewFiles);
    }, PREVIEW_FILES);

    // 6. Wait for the preview iframe to acquire a same-origin /preview/:id src.
    const iframe = page.locator('[data-testid="preview-iframe"]');
    await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });

    // 7. iframe src must point to the same-origin compiled preview route.
    await expect(async () => {
      const src = await iframe.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).not.toBe('about:blank');
      expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
    }).toPass({ timeout: FLOW_TIMEOUT, intervals: [2_000, 3_000, 5_000] });

    // 8. Seeded preview content should be visible inside the real iframe.
    await expect(page.frameLocator('[data-testid="preview-iframe"]').locator('text=Todo')).toBeVisible({
      timeout: FLOW_TIMEOUT,
    });
    await expect(page.frameLocator('[data-testid="preview-iframe"]').locator('body')).toContainText('0', {
      timeout: FLOW_TIMEOUT,
    });

    // 9. No crash text
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toMatch(/\bError\b/);
    expect(pageText).not.toContain('insertBefore');
    expect(pageText).not.toContain('Cannot read properties of null');
  });

  // ── Double-click regression ───────────────────────────────────────────────
  test('double-click on confirm does not duplicate dispatch', async ({ page }) => {
    await openEngine(page);
    await page.evaluate(() => {
      localStorage.setItem('AIC_E2E_BLUEPRINT_SHORTCUT', '1');
    });
    await typeInChat(page, 'todo app with supabase');

    await expect(page.locator('[data-testid="generation-plan-card"]')).toBeVisible({ timeout: 60_000 });

    const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]');
    await confirmBtn.waitFor({ state: 'visible', timeout: 30_000 });

    // Double-click — second click must be a no-op (button disappears after first)
    await confirmBtn.dblclick();
    // Ждем что карточка исчезла целиком, а не только кнопка
    await expect(page.locator('[data-testid="generation-plan-card"]')).toHaveCount(0, { timeout: 5_000 });

    // No crash indicator
    await expect(
      page.locator('text=insertBefore').or(page.locator('text=Cannot read properties'))
    ).toHaveCount(0, { timeout: 5_000 });
  });
});

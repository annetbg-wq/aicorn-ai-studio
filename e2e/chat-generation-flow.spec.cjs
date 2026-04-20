// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL     = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 60_000;
const LIVE_FLOW_TIMEOUT = 120_000;
const LIVE_CANARY_PROMPT = 'single screen counter app with one increment button';

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

// ── helpers ──────────────────────────────────────────────────────────────────

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
  const sendBtn = page.locator('textarea').first().locator('xpath=following-sibling::button[not(@disabled)]').first();
  if (await sendBtn.count()) {
    await sendBtn.click({ force: true }); // игнорим перекрытие
  }
}

function responseTextForLLM(systemText, userText, stream) {
  if (!stream) {
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
      });

      await openEngine(page);
      await page.getByRole('button', { name: 'PAGE' }).click();

      await typeInChat(page, LIVE_CANARY_PROMPT);
      await expect(page.locator('[data-testid="generation-plan-card"]')).toBeVisible({
        timeout: LIVE_FLOW_TIMEOUT,
      });

      await clickLatestConfirmPlan(page);

      await expect(
        page.locator('text=⚙️ Building…').or(page.locator('text=Building…'))
      ).toBeVisible({ timeout: FLOW_TIMEOUT });

      await expect(async () => {
        const followUpConfirm = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
        if (await followUpConfirm.isVisible().catch(() => false)) {
          await followUpConfirm.click();
          return;
        }
        expect(timelineLines(logs).some(line => line.includes('candidate_materialization_start'))).toBe(true);
      }).toPass({ timeout: FLOW_TIMEOUT, intervals: [500, 1_000, 2_000] });

      const iframe = page.locator('[data-testid="preview-iframe"]');
      await expect(iframe).toBeVisible({ timeout: LIVE_FLOW_TIMEOUT });
      await expect(async () => {
        const src = await iframe.getAttribute('src');
        expect(src).toBeTruthy();
        expect(src).not.toBe('about:blank');
        expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
      }).toPass({ timeout: LIVE_FLOW_TIMEOUT, intervals: [1_000, 2_000, 3_000] });

      await expect(async () => {
        expect(timelineLines(logs).some(line => line.includes('candidate_created'))).toBe(true);
        expect(timelineLines(logs).some(line => line.includes('candidate_materialization_success'))).toBe(true);
        expect(timelineLines(logs).some(line => line.includes('compile_start'))).toBe(true);
        expect(timelineLines(logs).some(line => line.includes('final_check_result') && line.includes('passed'))).toBe(true);
        expect(timelineLines(logs).some(line => line.includes('promotion_decision') && line.includes('promote_normal'))).toBe(true);
        expect(timelineLines(logs).some(line => line.includes('ship_outcome') && line.includes('SHIP_OK'))).toBe(true);
      }).toPass({ timeout: FLOW_TIMEOUT, intervals: [500, 1_000, 2_000] });

      const finalCheckIndex = timelineIndex(logs, 'final_check_result', 'passed');
      const promotionIndex = timelineIndex(logs, 'promotion_decision', 'promote_normal');
      const shipIndex = timelineIndex(logs, 'ship_outcome', 'SHIP_OK');
      expect(finalCheckIndex).toBeGreaterThanOrEqual(0);
      expect(promotionIndex).toBeGreaterThan(finalCheckIndex);
      expect(shipIndex).toBeGreaterThan(promotionIndex);

      await expect(
        page.frameLocator('[data-testid="preview-iframe"]').locator('[data-testid="live-canary-surface"]')
      ).toBeVisible({ timeout: FLOW_TIMEOUT });
      await expect(page.frameLocator('[data-testid="preview-iframe"]').locator('body')).toContainText(
        'Live preview canary',
        { timeout: FLOW_TIMEOUT },
      );

      await expect(async () => {
        expect(timelineLines(logs).some(line =>
          line.includes('post_promotion_watch_result') &&
          line.includes('stable_window_elapsed')
        )).toBe(true);
      }).toPass({ timeout: 12_000, intervals: [1_000, 2_000] });

      const timeline = timelineLines(logs);
      expect(timeline.some(line => line.includes('promotion_blocked_not_rendered'))).toBe(false);
      expect(timeline.some(line => line.includes('promotion_revoked'))).toBe(false);
      expect(timeline.some(line => line.includes('rollback_completed'))).toBe(false);

      await attachLiveCanaryDiagnostics(testInfo, page, logs, null);
    } catch (error) {
      await attachLiveCanaryDiagnostics(testInfo, page, logs, error);
      throw error;
    }
  });

  test('plan confirmation hands off to a real compiled preview without crashing', async ({ page }) => {
    // 1. Open studio
    await openEngine(page);
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

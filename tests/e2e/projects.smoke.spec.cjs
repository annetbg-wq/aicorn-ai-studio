const { test, expect } = require('playwright/test');

const BASE_URL = process.env.STUDIO_URL ?? 'http://localhost:5183';
const FLOW_TIMEOUT = 120_000;

const IDEA_ALPHA_TITLE = 'Идея Альфа';
const IDEA_BETA_TITLE = 'Идея Бета';

const BLUEPRINT_ALPHA = 'Atlas Clinic Ops';
const BLUEPRINT_BETA = 'Pulse Deck Arena';

const PROJECT_ONE_NAME = 'AtlasFlow';
const PROJECT_TWO_NAME = 'PulseFlow';

function inferBlueprintName(text = '') {
  if (
    text.includes(BLUEPRINT_BETA) ||
    text.includes(IDEA_BETA_TITLE) ||
    text.includes(PROJECT_TWO_NAME)
  ) {
    return BLUEPRINT_BETA;
  }
  if (
    text.includes(BLUEPRINT_ALPHA) ||
    text.includes(IDEA_ALPHA_TITLE) ||
    text.includes(PROJECT_ONE_NAME)
  ) {
    return BLUEPRINT_ALPHA;
  }
  return null;
}

function resolveBlueprintName(text, fallback = BLUEPRINT_ALPHA) {
  return inferBlueprintName(text) || fallback;
}

function toTextContent(value) {
  if (Array.isArray(value)) {
    return value.map(part => (typeof part?.text === 'string' ? part.text : '')).join('\n');
  }
  return String(value || '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sseFromText(text) {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
}

function buildPlanResponse(appName) {
  return JSON.stringify({
    appName,
    summary: `Founder flow plan for ${appName}`,
    pages: ['Home'],
    steps: [
      { id: 'think', label: 'Understand intent' },
      { id: 'architect', label: 'Shape architecture' },
      { id: 'code', label: 'Generate code' },
      { id: 'save', label: 'Ready for save' },
    ],
    assumptions: ['Use deterministic smoke responses'],
  });
}

function buildArchitectResponse(appName) {
  return JSON.stringify({
    appName,
    description: `A deterministic build surface for ${appName}.`,
    theme: 'dark-slate',
    targetUser: 'Founder validating split-path reliability',
    productStrategy: {
      coreAction: 'Reach preview and save safely',
      retentionLoop: 'N/A for smoke flow',
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
        reason: 'Smoke run only',
        steps: [],
        completionAction: 'Open the preview',
      },
      firstSession: 'User confirms the plan and reaches preview.',
      returningSession: 'Saved project can be reloaded with isolated chat.',
    },
    layout: {
      type: 'single',
      navigation: 'none',
      primaryColor: 'emerald',
    },
    pages: [
      {
        path: '/',
        name: 'App',
        file: 'App.tsx',
        purpose: 'Render deterministic smoke preview content.',
        isMainScreen: true,
        showInNav: false,
        guard: { type: 'none' },
        uiSpec: 'One centered section with title and counter button.',
        keyElements: ['Heading', 'Counter value', 'Increment button'],
      },
    ],
    authFlow: {
      type: 'none',
      reason: 'Not needed for this smoke flow',
      localFirst: true,
      comment: 'No identity required',
    },
    dataModel: {
      entities: [{ name: 'CounterState', fields: 'count: number' }],
      seedData: {
        needed: false,
        reason: 'Counter starts from zero',
        examples: [],
      },
      sharedState: 'local state in App.tsx',
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
    criticalUiRules: ['Do not render a blank surface'],
    shadcnComponents: [],
    icons: [],
  });
}

function buildTechResponse() {
  return JSON.stringify({
    technicalBlueprint: {
      appShell: {
        routingStrategy: 'Single App.tsx route',
        stateStrategy: 'Local useState',
        persistenceStrategy: 'No persistence',
        guardStrategy: 'No guards',
      },
      fileStructure: [{ file: 'App.tsx', purpose: 'Render deterministic smoke UI' }],
      componentContracts: [
        {
          file: 'App.tsx',
          responsibility: 'Render title and simple counter',
          mustRender: ['Heading', 'Counter'],
          uses: ['React useState'],
          localState: ['count: number'],
        },
      ],
      dataFlow: { entities: ['CounterState'] },
      criticalPaths: ['Initial render', 'Increment click'],
      implementationRisks: ['Keep output tiny and dependency-free'],
    },
  });
}

function buildAppTsx(appName) {
  return [
    "import { useState } from 'react';",
    '',
    'export default function App() {',
    '  const [count, setCount] = useState(0);',
    '  return (',
    '    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>',
    '      <section style={{ display: "grid", gap: 12, textAlign: "center" }}>',
    `        <h1 data-testid="project-title" style={{ margin: 0 }}>${appName}</h1>`,
    '        <p data-testid="count-value" style={{ margin: 0, fontSize: 32 }}>{count}</p>',
    '        <button type="button" onClick={() => setCount(value => value + 1)} style={{ padding: "12px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "#22c55e", color: "#052e16", fontWeight: 700 }}>',
    '          Increment',
    '        </button>',
    '      </section>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function buildCoderResponse(appName) {
  return JSON.stringify({
    artifact: {
      entry: 'src/App.tsx',
      dependencies: [],
      files: [{ path: 'src/App.tsx', content: buildAppTsx(appName) }],
    },
  });
}

function buildArchitectureAnalysisResponse(appName) {
  return JSON.stringify({
    productType: 'app',
    branchBriefSummary: `Smoke architecture summary for ${appName}.`,
    firstPassCapabilities: ['local-state'],
    deferredCapabilities: [],
    implementationOrder: ['Render deterministic surface', 'Expose save-ready preview'],
    openQuestions: [],
  });
}

function buildPackagingBlueprint(appName, ideaId) {
  return {
    id: ideaId,
    appName,
    description: `Blueprint for ${appName}`,
    theme: 'dark-slate',
    targetUser: 'Founder validating split-path',
    layout: { type: 'dashboard', navigation: 'sidebar' },
    uxPatterns: { emptyStates: true, loadingSkeletons: true, searchAndFilter: false, animations: 'subtle' },
    responsiveness: { primaryDevice: 'desktop', mobileFirst: true, maxWidth: 'max-w-6xl' },
    pages: [
      {
        path: '/',
        name: 'Home',
        file: 'pages/Home.tsx',
        purpose: 'Main smoke screen',
        isMainScreen: true,
        showInNav: true,
        uiSpec: 'Single-screen preview flow for deterministic e2e.',
      },
    ],
    dataModel: { entities: [{ name: 'profiles', fields: 'id uuid, full_name text' }], sharedState: 'local state' },
    criticalUiRules: ['Keep preview non-blank'],
    shadcnComponents: ['Button', 'Card'],
    icons: ['Sparkles'],
    packageSummary: `Packaged ${appName}`,
    visualTag: 'trust',
    authFlow: {
      type: 'none',
      provider: 'none',
      onboardingSteps: [],
    },
    monetization: {
      model: 'free',
      paywall: {
        trigger: 'never',
        limits: [],
        upgradeMessage: 'none',
      },
    },
    databaseSchema: {
      sql: '-- no-op for smoke',
      tables: [{ name: 'profiles', purpose: 'Smoke table placeholder' }],
    },
    aiLogic: {
      features: [
        {
          name: 'Deterministic run',
          purpose: 'Ensure stable preview path',
          model: 'mock',
          trigger: 'send',
          systemPrompt: 'n/a',
          outputContract: 'n/a',
        },
      ],
    },
    fileArchitecture: [{ path: 'src/App.tsx', role: 'page', purpose: 'Main screen' }],
    premiumUiDirectives: [
      'Use ONLY components from /src/components/ui and /blocks',
      'Follow PREMIUM_DESIGN_SYSTEM.md',
    ],
  };
}

async function installDeterministicRoutes(page) {
  let activeRunBlueprint = BLUEPRINT_ALPHA;

  await page.route('**/rest/v1/user_projects*', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'e2e forced local fallback' }),
    });
  });

  await page.route('**/dev-agent-mode', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ provider: 'off' }),
    });
  });

  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    const raw = route.request().postData() || '{}';
    let body = {};
    try { body = JSON.parse(raw); } catch { body = {}; }
    const prompt = Array.isArray(body.messages)
      ? body.messages.map(msg => toTextContent(msg?.content)).join('\n')
      : '';
    const appName = resolveBlueprintName(prompt, activeRunBlueprint);
    activeRunBlueprint = appName;
    const ideaId = appName === BLUEPRINT_BETA ? 'trend-beta' : 'trend-alpha';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(buildPackagingBlueprint(appName, ideaId)),
            },
          },
        ],
      }),
    });
  });

  await page.route('**/functions/v1/llm-proxy', async (route) => {
    const request = route.request();
    const rawProxyBody = request.postData() || '{}';
    let proxyBody = {};
    let llmBody = {};

    try {
      proxyBody = JSON.parse(rawProxyBody);
      llmBody = JSON.parse(proxyBody.body || '{}');
    } catch {
      proxyBody = {};
      llmBody = {};
    }

    const messages = Array.isArray(llmBody.messages) ? llmBody.messages : [];
    const systemText = toTextContent(messages[0]?.content);
    const userText = toTextContent(messages[messages.length - 1]?.content);
    const stream = Boolean(proxyBody.stream || llmBody.stream);
    const inferredName = inferBlueprintName(userText);
    const appName = inferredName || activeRunBlueprint;

    let text = buildPlanResponse(appName);
    if (!stream) {
      activeRunBlueprint = appName;
      text = buildArchitectureAnalysisResponse(appName);
    } else if (systemText.includes('Generate a step-by-step plan')) {
      activeRunBlueprint = appName;
      text = buildPlanResponse(appName);
    } else if (systemText.includes('Senior Tech Lead')) {
      text = buildTechResponse();
    } else if (
      systemText.includes('top-tier product founder') ||
      systemText.includes('web developer designing a landing page')
    ) {
      text = buildArchitectResponse(appName);
    } else if (
      systemText.includes('React') ||
      systemText.includes('developer') ||
      userText.includes('CURRENT USER REQUEST')
    ) {
      text = buildCoderResponse(appName);
    }

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

async function bootstrapStudio(page) {
  await page.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded' });

  await page.evaluate(({ alphaTitle, betaTitle }) => {
    localStorage.clear();
    sessionStorage.clear();

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const weekKey = `${utcDate.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const mkIdea = (id, title, cadence) => ({
      id,
      appName: title,
      description: `${title} description`,
      theme: 'dark-slate',
      targetUser: 'Founder',
      layout: { type: 'dashboard', navigation: 'sidebar' },
      uxPatterns: { emptyStates: true, loadingSkeletons: true, searchAndFilter: false, animations: 'subtle' },
      responsiveness: { primaryDevice: 'desktop', mobileFirst: true },
      pages: [],
      dataModel: { entities: [], sharedState: '' },
      criticalUiRules: [],
      shadcnComponents: [],
      icons: [],
      marketContext: 'Market context',
      targetAudience: 'Target audience',
      painPoint: 'Pain point',
      competitorGap: 'Competitor gap',
      generatedAt: now.toISOString(),
      cadence,
      categories: ['ai'],
      localized: {
        ru: {
          title,
          description: `${title} для founder flow`,
          audience: 'Founders',
          marketAngle: 'Smoke market angle',
          whyInteresting: 'Smoke why-now',
        },
        en: {
          title,
          description: `${title} for founder flow`,
          audience: 'Founders',
          marketAngle: 'Smoke market angle',
          whyInteresting: 'Smoke why-now',
        },
      },
    });

    const model = {
      daily: [
        mkIdea('trend-alpha', alphaTitle, 'daily'),
        mkIdea('trend-beta', betaTitle, 'daily'),
      ],
      weekly: [],
      monthly: [],
      generatedAt: now.toISOString(),
      dateKey: todayKey,
      weekKey,
      monthKey,
      taskInterest: null,
      languageKey: 'ru',
    };

    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
    localStorage.setItem('AIC_E2E_LIVE_GENERATION_CANARY', '1');
    localStorage.setItem('OPENROUTER_API_KEY', 'e2e-founder-smoke-key');
    localStorage.setItem('APP_LANGUAGE', 'ru');
    localStorage.setItem('superadmin_dev_agent_provider', 'off');
    localStorage.setItem('aic_trend_niches', JSON.stringify(model));
    localStorage.setItem('aic_trend_niches_interests', JSON.stringify([]));
    localStorage.setItem('aic_trend_niches_bank', JSON.stringify([]));
  }, {
    alphaTitle: IDEA_ALPHA_TITLE,
    betaTitle: IDEA_BETA_TITLE,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function openTrendNiches(page) {
  await page.locator('button[title="Трендовые ниши"]').click();
  await expect(page.getByRole('heading', { name: 'Трендовые ниши' }).first()).toBeVisible({ timeout: 20_000 });
}

async function openProjects(page) {
  await page.locator('button[title="Projects"]').click();
  await expect(page.getByRole('heading', { name: 'Projects' }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Overview').first()).toBeVisible({ timeout: 20_000 });
}

async function clickTrendIdeaAction(page, ideaTitle, actionLabel) {
  const index = ideaTitle === IDEA_BETA_TITLE ? 1 : 0;
  const action = page.getByRole('button', { name: new RegExp(actionLabel, 'i') }).nth(index);
  await expect(action).toBeVisible({ timeout: 20_000 });
  await action.click();
}

function composerTextarea(page) {
  return page.locator(
    'textarea[placeholder="Что строим сегодня?"], textarea[placeholder="How can we build today?"]'
  ).first();
}

async function sendInChat(page, text) {
  const textarea = composerTextarea(page);
  await expect(textarea).toBeVisible({ timeout: 20_000 });
  await textarea.fill(text);
  await textarea.press('Enter');

  const sendBtn = textarea.locator('xpath=following-sibling::button[not(@disabled)]').first();
  if (await sendBtn.count()) {
    await sendBtn.click({ force: true });
  }
}

async function clickLatestConfirmPlan(page) {
  const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
  await expect(confirmBtn).toBeVisible({ timeout: FLOW_TIMEOUT });
  await confirmBtn.click();

  await page.waitForTimeout(400);
  const followUp = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
  if (await followUp.isVisible().catch(() => false)) {
    await followUp.click();
  }
}

async function waitForPreviewAndSaveCta(page, timeoutMs = FLOW_TIMEOUT) {
  const iframe = page.locator('[data-testid="preview-iframe"]');
  await expect(iframe).toBeVisible({ timeout: timeoutMs });

  await expect(async () => {
    const src = await iframe.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('about:blank');
    expect(src).toMatch(/\/preview\/[0-9a-f-]+/i);
  }).toPass({ timeout: timeoutMs, intervals: [1_000, 2_000, 3_000] });

  await expect(page.locator('[data-testid="save-project-cta"]')).toBeVisible({ timeout: timeoutMs });
}

async function clickSaveProjectCta(page) {
  const cta = page.locator('[data-testid="save-project-cta"]');
  await expect(cta).toBeVisible({ timeout: FLOW_TIMEOUT });
  await cta.getByRole('button').click();
}

async function readPersistenceState(page) {
  return page.evaluate(() => {
    const parseArray = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const legacyMeta = parseArray('aic-project-meta');
    const repoMeta = parseArray('aic_projects_meta');

    return {
      legacyMetaCount: legacyMeta.length,
      legacyNames: legacyMeta.map(item => String(item?.name || '')).filter(Boolean),
      repoMetaCount: repoMeta.length,
      repoNames: repoMeta.map(item => String(item?.name || '')).filter(Boolean),
      currentProjectId: localStorage.getItem('CURRENT_PROJECT_ID'),
      draftSessionId: localStorage.getItem('AIC_DRAFT_SESSION_ID'),
    };
  });
}

async function readDraftChatPresence(page, draftId) {
  return page.evaluate((id) => {
    if (!id) return { session: false, local: false };
    const key = `AIC_DRAFT_CHAT_${id}`;
    return {
      session: sessionStorage.getItem(key) !== null,
      local: localStorage.getItem(key) !== null,
    };
  }, draftId);
}

async function loadProjectFromProjectsPage(page, projectName) {
  const card = page.locator('.group.relative.overflow-hidden').filter({ hasText: projectName }).first();
  await expect(card).toBeVisible({ timeout: FLOW_TIMEOUT });

  const clicked = await page.evaluate((targetName) => {
    const cards = Array.from(document.querySelectorAll('.group.relative.overflow-hidden'));
    const target = cards.find(card => (card.textContent || '').includes(targetName));
    if (!target) return false;

    const eyeButton = target.querySelector('svg.lucide-eye')?.closest('button');
    if (eyeButton instanceof HTMLButtonElement) {
      eyeButton.click();
      return true;
    }

    const firstButton = target.querySelector('button');
    if (firstButton instanceof HTMLButtonElement) {
      firstButton.click();
      return true;
    }

    return false;
  }, projectName);

  expect(clicked).toBe(true);
  await expect(composerTextarea(page)).toBeVisible({ timeout: FLOW_TIMEOUT });
}

async function expectProjectCardVisible(page, projectName) {
  const card = page.locator('.group.relative.overflow-hidden').filter({ hasText: projectName }).first();
  await expect(card).toBeVisible({ timeout: FLOW_TIMEOUT });
}

async function runTrendBuildToPreview(page, {
  ideaTitle,
  blueprintName,
  sendPrompt,
  forbiddenVisibleText,
}) {
  await openTrendNiches(page);
  await clickTrendIdeaAction(page, ideaTitle, 'В работу');

  await expect(composerTextarea(page)).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(
    page.getByText(new RegExp(`Blueprint packaged:\\s*${escapeRegExp(blueprintName)}`, 'i')).first()
  ).toBeVisible({ timeout: FLOW_TIMEOUT });

  if (forbiddenVisibleText) {
    await expect(
      page.getByText(new RegExp(`Blueprint packaged:\\s*${escapeRegExp(forbiddenVisibleText)}`, 'i'))
    ).toHaveCount(0);
  }

  const attemptTimeouts = [70_000, 90_000, FLOW_TIMEOUT];
  let lastError = null;
  for (let attempt = 0; attempt < attemptTimeouts.length; attempt += 1) {
    if (attempt > 0) {
      await page.waitForTimeout(1_000);
    }
    await sendInChat(page, sendPrompt);
    const confirmBtn = page.locator('[data-testid="generation-plan-card"] [data-testid="confirm-plan-btn"]').last();
    const hasPlanConfirm = await confirmBtn.isVisible({ timeout: 15_000 }).catch(() => false);
    if (hasPlanConfirm) {
      await clickLatestConfirmPlan(page);
    }

    try {
      await waitForPreviewAndSaveCta(page, attemptTimeouts[attempt]);
      return readPersistenceState(page);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new Error('Preview did not reach save CTA');
}

async function readProjectChatIsolation(page) {
  return page.evaluate(({ projectOne, projectTwo, textOne, textTwo }) => {
    const parseJson = (key) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const metaRaw = parseJson('aic-project-meta');
    const meta = Array.isArray(metaRaw) ? metaRaw : [];
    const first = meta.find(item => String(item?.name || '') === projectOne) || null;
    const second = meta.find(item => String(item?.name || '') === projectTwo) || null;

    const readProject = (projectId) => {
      if (!projectId) return null;
      return parseJson(`aic-proj-${projectId}`);
    };

    const readChatText = (project) => {
      if (!project) return '';
      const chat = Array.isArray(project.chatHistory) ? project.chatHistory : [];
      return chat
        .map(message =>
          typeof message?.content === 'string'
            ? message.content
            : JSON.stringify(message?.content ?? '')
        )
        .join('\n');
    };

    const readChatPayload = (project) => {
      if (!project) return [];
      return Array.isArray(project.chatHistory) ? project.chatHistory : [];
    };

    const readThreadInfo = (project, projectId) => {
      if (!project || typeof project !== 'object') return null;
      const activeBranchId = typeof project.activeBranchId === 'string' ? project.activeBranchId : null;
      const branches = project.branches && typeof project.branches === 'object' ? project.branches : null;
      const activeBranch = activeBranchId && branches ? branches[activeBranchId] : null;
      const explicitThreadId =
        (typeof activeBranch?.chatThreadId === 'string' && activeBranch.chatThreadId)
        || (typeof activeBranch?.architecture?.branch?.chatThreadId === 'string'
          && activeBranch.architecture.branch.chatThreadId)
        || (typeof activeBranch?.architecture?.draftSnapshot?.branchBrief?.chatThreadId === 'string'
          && activeBranch.architecture.draftSnapshot.branchBrief.chatThreadId)
        || (typeof activeBranch?.architecture?.actualSnapshot?.branchBrief?.chatThreadId === 'string'
          && activeBranch.architecture.actualSnapshot.branchBrief.chatThreadId)
        || null;

      const effectiveThreadKey = explicitThreadId || `project:${projectId || 'unknown'}:branch:${activeBranchId || 'main'}`;
      return {
        explicitThreadId,
        effectiveThreadKey,
      };
    };

    const firstProject = readProject(first?.id ?? null);
    const secondProject = readProject(second?.id ?? null);

    const firstChat = readChatText(firstProject);
    const secondChat = readChatText(secondProject);
    const firstPayload = readChatPayload(firstProject);
    const secondPayload = readChatPayload(secondProject);

    const firstThread = readThreadInfo(firstProject, first?.id ?? null);
    const secondThread = readThreadInfo(secondProject, second?.id ?? null);
    const firstThreadId = firstThread?.explicitThreadId ?? null;
    const secondThreadId = secondThread?.explicitThreadId ?? null;
    const firstThreadKey = firstThread?.effectiveThreadKey ?? null;
    const secondThreadKey = secondThread?.effectiveThreadKey ?? null;

    return {
      firstProjectFound: Boolean(first?.id),
      secondProjectFound: Boolean(second?.id),
      firstHasOwnText: firstChat.includes(textOne),
      firstHasOtherText: firstChat.includes(textTwo),
      secondHasOwnText: secondChat.includes(textTwo),
      secondHasOtherText: secondChat.includes(textOne),
      firstChatCount: firstPayload.length,
      secondChatCount: secondPayload.length,
      chatPayloadEqual: JSON.stringify(firstPayload) === JSON.stringify(secondPayload),
      firstThreadId,
      secondThreadId,
      firstThreadKey,
      secondThreadKey,
      threadsDiffer: Boolean(firstThreadKey && secondThreadKey && firstThreadKey !== secondThreadKey),
    };
  }, {
    projectOne: PROJECT_ONE_NAME,
    projectTwo: PROJECT_TWO_NAME,
    textOne: PROJECT_ONE_NAME,
    textTwo: PROJECT_TWO_NAME,
  });
}

async function expectPreviewProjectTitle(page, expectedText, forbiddenText) {
  const title = page
    .frameLocator('[data-testid="preview-iframe"]')
    .locator('[data-testid="project-title"]');

  await expect(title).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(title).toContainText(expectedText, { timeout: FLOW_TIMEOUT });
  if (forbiddenText) {
    await expect(title).not.toContainText(forbiddenText);
  }
}

async function readProjectIdByName(page, projectName) {
  return page.evaluate((name) => {
    try {
      const raw = localStorage.getItem('aic-project-meta');
      if (!raw) return null;
      const meta = JSON.parse(raw);
      if (!Array.isArray(meta)) return null;
      const found = meta.find(item => String(item?.name || '') === name);
      return found?.id ?? null;
    } catch {
      return null;
    }
  }, projectName);
}

async function expectCurrentProjectId(page, projectId) {
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('CURRENT_PROJECT_ID'))).toBe(projectId);
}

async function expectPreviewIframeMounted(page) {
  const iframe = page.locator('[data-testid="preview-iframe"]');
  await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(async () => {
    const src = await iframe.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('about:blank');
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 3_000] });
}

async function switchProjectById(page, projectId) {
  const result = await page.evaluate(async (id) => {
    const api = (window).__E2E_PROJECT_TEST;
    if (!api || typeof api.loadProjectById !== 'function') {
      throw new Error('E2E project hook is unavailable');
    }
    return api.loadProjectById(id);
  }, projectId);
  return result;
}

test.describe('Founder flow split-path smoke regressions', () => {
  test.setTimeout(360_000);

  test('Trend Niches -> В диалог stays transient and does not create a saved project', async ({ page }) => {
    await installDeterministicRoutes(page);
    await bootstrapStudio(page);
    await openTrendNiches(page);

    await clickTrendIdeaAction(page, IDEA_ALPHA_TITLE, 'В диалог');
    await expect(page.getByRole('button', { name: 'Отправить brief' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Отправить brief' }).click();

    await expect(composerTextarea(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TREND').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(IDEA_ALPHA_TITLE).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="save-project-cta"]')).toHaveCount(0);

    const state = await readPersistenceState(page);
    expect(state.legacyMetaCount).toBe(0);
    expect(state.currentProjectId).toBeNull();
    expect(state.draftSessionId).toBeTruthy();
  });

  test('Trend Niches -> В диалог hard-resets into a clean draft without leaking the previous project', async ({ page }) => {
    await installDeterministicRoutes(page);
    await bootstrapStudio(page);

    const beforeSave = await runTrendBuildToPreview(page, {
      ideaTitle: IDEA_ALPHA_TITLE,
      blueprintName: BLUEPRINT_ALPHA,
      sendPrompt: `${PROJECT_ONE_NAME}: build this now`,
    });

    expect(beforeSave.legacyMetaCount).toBe(0);
    expect(beforeSave.currentProjectId).toBeNull();
    expect(beforeSave.draftSessionId).toBeTruthy();

    await clickSaveProjectCta(page);

    await expect.poll(async () => (await readPersistenceState(page)).legacyMetaCount).toBe(1);
    await expect.poll(async () => (await readPersistenceState(page)).currentProjectId).not.toBeNull();
    await expect.poll(async () => (await readPersistenceState(page)).draftSessionId).toBeNull();

    await openTrendNiches(page);
    await clickTrendIdeaAction(page, IDEA_BETA_TITLE, 'В диалог');
    await expect(page.getByRole('button', { name: 'Отправить brief' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Отправить brief' }).click();

    await expect(composerTextarea(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TREND').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(IDEA_BETA_TITLE).first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(new RegExp(`Blueprint packaged:\\s*${escapeRegExp(BLUEPRINT_ALPHA)}`, 'i'))
    ).toHaveCount(0);
    await expect(page.getByText(PROJECT_ONE_NAME)).toHaveCount(0);
    await expect(page.locator('[data-testid="save-project-cta"]')).toHaveCount(0);

    const state = await readPersistenceState(page);
    expect(state.legacyMetaCount).toBe(1);
    expect(state.currentProjectId).toBeNull();
    expect(state.draftSessionId).toBeTruthy();

    await openProjects(page);
    await expectProjectCardVisible(page, PROJECT_ONE_NAME);
    await expect(page.locator('.group.relative.overflow-hidden').filter({ hasText: IDEA_BETA_TITLE })).toHaveCount(0);
  });

  test('Trend Niches -> В работу covers draft->preview->save->projects and keeps chat isolation', async ({ page }) => {
    await installDeterministicRoutes(page);
    await bootstrapStudio(page);

    const beforeFirstSave = await runTrendBuildToPreview(page, {
      ideaTitle: IDEA_ALPHA_TITLE,
      blueprintName: BLUEPRINT_ALPHA,
      sendPrompt: `${PROJECT_ONE_NAME}: build this now`,
    });

    expect(beforeFirstSave.legacyMetaCount).toBe(0);
    expect(beforeFirstSave.currentProjectId).toBeNull();
    expect(beforeFirstSave.draftSessionId).toBeTruthy();

    const firstDraftId = beforeFirstSave.draftSessionId;
    await clickSaveProjectCta(page);

    await expect.poll(async () => (await readPersistenceState(page)).legacyMetaCount).toBe(1);
    await expect.poll(async () => (await readPersistenceState(page)).currentProjectId).not.toBeNull();
    await expect.poll(async () => (await readPersistenceState(page)).draftSessionId).toBeNull();
    await expect.poll(async () => readDraftChatPresence(page, firstDraftId)).toEqual({ session: false, local: false });

    const beforeSecondSave = await runTrendBuildToPreview(page, {
      ideaTitle: IDEA_BETA_TITLE,
      blueprintName: BLUEPRINT_BETA,
      sendPrompt: `${PROJECT_TWO_NAME}: build this now`,
      forbiddenVisibleText: BLUEPRINT_ALPHA,
    });

    expect(beforeSecondSave.legacyMetaCount).toBe(1);
    expect(beforeSecondSave.currentProjectId).toBeNull();
    expect(beforeSecondSave.draftSessionId).toBeTruthy();

    const secondDraftId = beforeSecondSave.draftSessionId;
    await clickSaveProjectCta(page);

    await expect.poll(async () => (await readPersistenceState(page)).legacyMetaCount).toBe(2);
    await expect.poll(async () => (await readPersistenceState(page)).currentProjectId).not.toBeNull();
    await expect.poll(async () => (await readPersistenceState(page)).draftSessionId).toBeNull();
    await expect.poll(async () => readDraftChatPresence(page, secondDraftId)).toEqual({ session: false, local: false });
    const isolationAfterSecondSave = await readProjectChatIsolation(page);
    expect(isolationAfterSecondSave.firstProjectFound).toBe(true);
    expect(isolationAfterSecondSave.secondProjectFound).toBe(true);
    expect(isolationAfterSecondSave.firstHasOwnText).toBe(true);
    expect(isolationAfterSecondSave.firstHasOtherText).toBe(false);
    expect(isolationAfterSecondSave.secondHasOwnText).toBe(true);
    expect(isolationAfterSecondSave.secondHasOtherText).toBe(false);
    expect(isolationAfterSecondSave.firstChatCount).toBeGreaterThan(0);
    expect(isolationAfterSecondSave.secondChatCount).toBeGreaterThan(0);
    expect(isolationAfterSecondSave.chatPayloadEqual).toBe(false);
    expect(isolationAfterSecondSave.firstThreadKey).toBeTruthy();
    expect(isolationAfterSecondSave.secondThreadKey).toBeTruthy();
    expect(isolationAfterSecondSave.threadsDiffer).toBe(true);

    await openProjects(page);
    await expectProjectCardVisible(page, PROJECT_ONE_NAME);
    await expectProjectCardVisible(page, PROJECT_TWO_NAME);
    const projectOneId = await readProjectIdByName(page, PROJECT_ONE_NAME);
    const projectTwoId = await readProjectIdByName(page, PROJECT_TWO_NAME);
    expect(projectOneId).toBeTruthy();
    expect(projectTwoId).toBeTruthy();

    await switchProjectById(page, projectOneId);
    await page.locator('button[title="System Engine"]').click();
    await expect(composerTextarea(page)).toBeVisible({ timeout: FLOW_TIMEOUT });
    await expectCurrentProjectId(page, projectOneId);
    await expectPreviewIframeMounted(page);
    await expectPreviewProjectTitle(page, BLUEPRINT_ALPHA, BLUEPRINT_BETA);

    await switchProjectById(page, projectTwoId);
    await expectCurrentProjectId(page, projectTwoId);
    await expectPreviewIframeMounted(page);
    await expectPreviewProjectTitle(page, BLUEPRINT_BETA, BLUEPRINT_ALPHA);

    await switchProjectById(page, projectOneId);
    await expectCurrentProjectId(page, projectOneId);
    await expectPreviewProjectTitle(page, BLUEPRINT_ALPHA, BLUEPRINT_BETA);

    await switchProjectById(page, projectTwoId);
    await expectCurrentProjectId(page, projectTwoId);
    await expectPreviewProjectTitle(page, BLUEPRINT_BETA, BLUEPRINT_ALPHA);
  });
});

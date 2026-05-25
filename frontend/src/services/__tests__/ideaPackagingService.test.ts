// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as ideaFeedService from '../ideaFeedService';
import {
  BlueprintPackagingError,
  buildFallbackBlueprintPrompt,
  buildPackageIdeaPrompt,
  packageSelectedIdea,
  validateBlueprintShape,
} from '../ideaPackagingService';
import type { ProductIdea } from '../ideaFeedService';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sourceIdea: ProductIdea = {
  id: 'game-runner',
  title: 'Dungeon Sprint',
  pitch: 'A short-session roguelite for players who want a full run during a commute.',
  marketGap: 'Mobile roguelites are either too casual or demand 40-minute sessions.',
  visualTag: 'Glassmorphism',
  unfairAdvantage: 'Daily seeded runs let creators and friends compete on the same map.',
  buyerReason: 'Players pay to unlock deeper progression and seasonal challenge ladders.',
};

const VALID_BLUEPRINT_PAYLOAD = {
  id: 'game-runner',
  appName: 'Dungeon Sprint',
  description: 'Соревновательный мобильный рогалик на короткие забеги.',
  theme: 'neon',
  targetUser: 'Игроки, которые любят сложные короткие сессии.',
  layout: { type: 'dashboard', navigation: 'bottom-tabs' },
  pages: [
    { path: '/', name: 'Главная', file: 'pages/Home.tsx', purpose: 'Выбор забега', isMainScreen: true, showInNav: true, uiSpec: 'Daily-run блок.' },
  ],
  dataModel: {
    entities: [{ name: 'runs', fields: 'id uuid, user_id uuid, seed text, score int' }],
    sharedState: 'Профиль игрока, текущий run и прогресс.',
  },
  shadcnComponents: ['Button', 'Card', 'Tabs'],
  icons: ['Sparkles', 'Swords', 'Trophy'],
  criticalUiRules: ['Использовать только токены и блоки из премиальной системы.'],
  packageSummary: 'Продукт держится на daily seeded runs.',
  visualTag: 'Glassmorphism',
  authFlow: {
    type: 'supabase',
    provider: 'email+google',
    onboardingSteps: [
      { id: 'signup', title: 'Регистрация', goal: 'Создать профиль игрока' },
      { id: 'loadout', title: 'Первый loadout', goal: 'Выбрать стиль боя', ahaMoment: 'Первый run' },
    ],
  },
  monetization: {
    model: 'subscription',
    paywall: {
      trigger: 'После 3 runs в неделю',
      limits: ['3 premium ladders per week'],
      upgradeMessage: 'Откройте ladder-сезоны.',
    },
  },
  databaseSchema: {
    sql: 'create table profiles (id uuid primary key); create table runs (id uuid primary key, user_id uuid);',
    tables: [{ name: 'profiles', purpose: 'Профиль игрока и тариф' }],
  },
  aiLogic: {
    features: [{
      name: 'Run commentator',
      purpose: 'Дает советы после забега.',
      model: 'gpt-4.1-mini',
      trigger: 'После завершения рана',
      systemPrompt: 'Ты аналитик игровых ранов. Кратко объясни, что улучшить.',
      outputContract: 'JSON с praise, mistakes, next_goal',
    }],
  },
  fileArchitecture: [
    { path: 'src/pages/Home.tsx', role: 'page', purpose: 'Главный экран daily run' },
  ],
  premiumUiDirectives: [
    'Use ONLY components from /src/components/ui and /blocks',
    'Follow PREMIUM_DESIGN_SYSTEM.md',
  ],
};

// ── validateBlueprintShape ────────────────────────────────────────────────────

describe('validateBlueprintShape', () => {
  it('returns null for a fully valid payload', () => {
    expect(validateBlueprintShape(VALID_BLUEPRINT_PAYLOAD)).toBeNull();
  });

  it('rejects empty object', () => {
    expect(validateBlueprintShape({})).not.toBeNull();
  });

  it('rejects missing appName', () => {
    const { appName: _a, ...rest } = VALID_BLUEPRINT_PAYLOAD;
    expect(validateBlueprintShape(rest)).toMatch(/appName/);
  });

  it('rejects empty appName string', () => {
    expect(validateBlueprintShape({ ...VALID_BLUEPRINT_PAYLOAD, appName: '   ' })).toMatch(/appName/);
  });

  it('rejects missing description', () => {
    const { description: _d, ...rest } = VALID_BLUEPRINT_PAYLOAD;
    expect(validateBlueprintShape(rest)).toMatch(/description/);
  });

  it('rejects missing pages', () => {
    const { pages: _p, ...rest } = VALID_BLUEPRINT_PAYLOAD;
    expect(validateBlueprintShape(rest)).toMatch(/pages/);
  });

  it('rejects empty pages array', () => {
    expect(validateBlueprintShape({ ...VALID_BLUEPRINT_PAYLOAD, pages: [] })).toMatch(/pages/);
  });

  it('rejects page entry without path', () => {
    const badPages = [{ name: 'Home' }];
    expect(validateBlueprintShape({ ...VALID_BLUEPRINT_PAYLOAD, pages: badPages })).toMatch(/path/);
  });

  it('rejects page entry without name', () => {
    const badPages = [{ path: '/' }];
    expect(validateBlueprintShape({ ...VALID_BLUEPRINT_PAYLOAD, pages: badPages })).toMatch(/name/);
  });

  it('rejects missing layout', () => {
    const { layout: _l, ...rest } = VALID_BLUEPRINT_PAYLOAD;
    expect(validateBlueprintShape(rest)).toMatch(/layout/);
  });

  it('rejects layout without type', () => {
    expect(validateBlueprintShape({ ...VALID_BLUEPRINT_PAYLOAD, layout: { navigation: 'sidebar' } })).toMatch(/layout/);
  });

  it('does not reject a blueprint with optional fields missing', () => {
    // Optional fields: monetization, databaseSchema, aiLogic, etc. should not cause rejection.
    const minimal = {
      appName: 'Test App',
      description: 'Test description',
      pages: [{ path: '/', name: 'Home' }],
      layout: { type: 'single' },
    };
    expect(validateBlueprintShape(minimal)).toBeNull();
  });
});

// ── buildFallbackBlueprintPrompt ──────────────────────────────────────────────

describe('buildFallbackBlueprintPrompt', () => {
  it('includes the product title from the idea', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'missing appName');
    expect(prompt).toContain('Dungeon Sprint');
  });

  it('includes the validation failure reason', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'missing appName');
    expect(prompt).toContain('missing appName');
  });

  it('demands JSON-only output — prohibits markdown fences', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'test');
    expect(prompt).toContain('No markdown fences');
    expect(prompt.toLowerCase()).toContain('no prose');
  });

  it('requires response to start with { and end with }', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'test');
    expect(prompt).toContain('start with {');
    expect(prompt).toContain('end with }');
  });

  it('includes the expected schema shape', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'test');
    expect(prompt).toContain('"appName"');
    expect(prompt).toContain('"pages"');
    expect(prompt).toContain('"layout"');
  });

  it('includes the product pitch', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'test');
    expect(prompt).toContain(sourceIdea.pitch);
  });

  it('specifies a maximum token budget', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'test');
    expect(prompt).toMatch(/4000\s+tokens/);
  });

  it('does not include the large BLUEPRINT_SCHEMA or PLAN_SCHEMA blocks (stays compact)', () => {
    const prompt = buildFallbackBlueprintPrompt(sourceIdea, 'test');
    // The full BLUEPRINT_SCHEMA has "uxPatterns" and "responsiveness" which should not appear
    expect(prompt).not.toContain('uxPatterns');
    expect(prompt).not.toContain('responsiveness');
  });
});

// ── buildPackageIdeaPrompt ────────────────────────────────────────────────────

describe('buildPackageIdeaPrompt', () => {
  it('includes Premium UI constraints', () => {
    const prompt = buildPackageIdeaPrompt(sourceIdea, 'ru');
    expect(prompt).toContain('PREMIUM_DESIGN_SYSTEM.md');
    expect(prompt).toContain('/src/components/ui');
    expect(prompt).toContain('/blocks');
    expect(prompt).toContain('Dungeon Sprint');
  });
});

// ── packageSelectedIdea — retry and validation behavior ──────────────────────

describe('packageSelectedIdea — happy path (no retry)', () => {
  it('returns a blueprint without calling the model a second time when first response is valid', async () => {
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValue(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(blueprint.appName).toBe('Dungeon Sprint');
    expect(blueprint.sourceIdea).toEqual(sourceIdea);
  });

  it('hydrates all blueprint sections from a valid payload', async () => {
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValue(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(blueprint.databaseSchema.sql).toContain('create table profiles');
    expect(blueprint.authFlow.onboardingSteps).toHaveLength(2);
    expect(blueprint.aiLogic.features[0].systemPrompt).toContain('аналитик');
    expect(blueprint.fileArchitecture[0].path).toBe('src/pages/Home.tsx');
    expect(blueprint.premiumUiDirectives).toContain('Follow PREMIUM_DESIGN_SYSTEM.md');
  });
});

describe('packageSelectedIdea — malformed JSON triggers exactly one retry', () => {
  it('calls the model a second time when first response is non-JSON prose', async () => {
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce('Sure! Here is the blueprint for your app...')  // malformed
      .mockResolvedValueOnce(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));        // valid retry

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(blueprint.appName).toBe('Dungeon Sprint');
  });

  it('does NOT retry a third time — exactly one retry only', async () => {
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce('still not json');

    await expect(packageSelectedIdea(sourceIdea, { language: 'ru' })).rejects.toThrow();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('second call uses the fallback prompt (JSON-only, no markdown)', async () => {
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce('prose response — not JSON')
      .mockResolvedValueOnce(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    await packageSelectedIdea(sourceIdea, { language: 'ru' });

    const fallbackPrompt = spy.mock.calls[1][0];
    expect(fallbackPrompt).toContain('No markdown fences');
    expect(fallbackPrompt).toContain('start with {');
    expect(fallbackPrompt).toContain('Dungeon Sprint');
  });
});

describe('packageSelectedIdea — invalid shape triggers exactly one retry', () => {
  it('retries when first response parses as JSON but fails shape validation (missing appName)', async () => {
    const invalidShape = { ...VALID_BLUEPRINT_PAYLOAD, appName: '' };
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce(JSON.stringify(invalidShape))
      .mockResolvedValueOnce(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(blueprint.appName).toBe('Dungeon Sprint');
  });

  it('retries when first response has an empty pages array', async () => {
    const invalidShape = { ...VALID_BLUEPRINT_PAYLOAD, pages: [] };
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce(JSON.stringify(invalidShape))
      .mockResolvedValueOnce(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(blueprint.pages).toHaveLength(1);
  });

  it('retries when layout is missing', async () => {
    const { layout: _l, ...noLayout } = VALID_BLUEPRINT_PAYLOAD;
    const spy = vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce(JSON.stringify(noLayout))
      .mockResolvedValueOnce(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('packageSelectedIdea — valid retry succeeds', () => {
  it('returns a fully hydrated blueprint from the retry response', async () => {
    const invalidFirst = { ...VALID_BLUEPRINT_PAYLOAD, description: '' };
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce(JSON.stringify(invalidFirst))
      .mockResolvedValueOnce(JSON.stringify(VALID_BLUEPRINT_PAYLOAD));

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(blueprint.description).toBeTruthy();
    expect(blueprint.sourceIdea).toEqual(sourceIdea);
    expect(blueprint.authFlow.onboardingSteps).toHaveLength(2);
  });
});

describe('packageSelectedIdea — invalid retry returns typed BlueprintPackagingError', () => {
  it('throws BlueprintPackagingError when retry also returns malformed JSON', async () => {
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('also not json');

    const err = await packageSelectedIdea(sourceIdea, { language: 'ru' }).catch(e => e);

    expect(err).toBeInstanceOf(BlueprintPackagingError);
    expect(err.name).toBe('BlueprintPackagingError');
    expect(err.validationReason).toBeTruthy();
    expect(err.message).toContain('after one retry');
  });

  it('throws BlueprintPackagingError when retry returns invalid shape', async () => {
    const invalidShape = { ...VALID_BLUEPRINT_PAYLOAD, appName: '' };
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce(JSON.stringify(invalidShape))
      .mockResolvedValueOnce(JSON.stringify(invalidShape));

    const err = await packageSelectedIdea(sourceIdea, { language: 'ru' }).catch(e => e);

    expect(err).toBeInstanceOf(BlueprintPackagingError);
    expect(err.validationReason).toMatch(/appName/);
  });

  it('error message is informative but does not expose provider secrets', async () => {
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValueOnce('bad')
      .mockResolvedValueOnce('bad');

    const err = await packageSelectedIdea(sourceIdea, { language: 'ru' }).catch(e => e);

    expect(err.message).not.toMatch(/sk-|Bearer|api_key|password/i);
    expect(err.message.length).toBeLessThan(300);
  });

  it('is an instance of Error so existing catch blocks still work', async () => {
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValue('bad payload');

    const err = await packageSelectedIdea(sourceIdea, { language: 'ru' }).catch(e => e);

    expect(err).toBeInstanceOf(Error);
  });

  it('frontend/direct-launch does not receive a blueprint when final packaging fails', async () => {
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt')
      .mockResolvedValue('invalid response, no JSON');

    let receivedBlueprint: unknown = undefined;

    try {
      receivedBlueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });
    } catch {
      // expected — runArchitect must not be reached
    }

    // Blueprint must not have been returned — downstream (runArchitect) must not run
    expect(receivedBlueprint).toBeUndefined();
  });
});

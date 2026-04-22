// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as ideaFeedService from '../ideaFeedService';
import { buildPackageIdeaPrompt, packageSelectedIdea } from '../ideaPackagingService';
import type { ProductIdea } from '../ideaFeedService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('idea packaging service', () => {
  const sourceIdea: ProductIdea = {
    id: 'game-runner',
    title: 'Dungeon Sprint',
    pitch: 'A short-session roguelite for players who want a full run during a commute.',
    marketGap: 'Mobile roguelites are either too casual or demand 40-minute sessions.',
    visualTag: 'Glassmorphism',
    unfairAdvantage: 'Daily seeded runs let creators and friends compete on the same map.',
    buyerReason: 'Players pay to unlock deeper progression and seasonal challenge ladders.',
  };

  it('builds a packaging prompt with Premium UI constraints', () => {
    const prompt = buildPackageIdeaPrompt(sourceIdea, 'ru');

    expect(prompt).toContain('PREMIUM_DESIGN_SYSTEM.md');
    expect(prompt).toContain('/src/components/ui');
    expect(prompt).toContain('/blocks');
    expect(prompt).toContain('Dungeon Sprint');
  });

  it('hydrates a discovery concept into a full product blueprint', async () => {
    vi.spyOn(ideaFeedService, 'runIdeaModelPrompt').mockResolvedValue(JSON.stringify({
      id: 'game-runner',
      appName: 'Dungeon Sprint',
      description: 'Соревновательный мобильный рогалик на короткие забеги.',
      theme: 'neon',
      targetUser: 'Игроки, которые любят сложные короткие сессии.',
      layout: { type: 'dashboard', navigation: 'bottom-tabs' },
      pages: [
        { path: '/', name: 'Главная', file: 'pages/Home.tsx', purpose: 'Выбор забега и прогресс', isMainScreen: true, showInNav: true, uiSpec: 'Подробный экран с daily-run блоком и наградами.' },
      ],
      dataModel: {
        entities: [{ name: 'runs', fields: 'id uuid, user_id uuid, seed text, score int' }],
        sharedState: 'Профиль игрока, текущий run и прогресс battle pass.',
      },
      shadcnComponents: ['Button', 'Card', 'Tabs'],
      icons: ['Sparkles', 'Swords', 'Trophy'],
      criticalUiRules: ['Использовать только токены и блоки из премиальной системы.'],
      packageSummary: 'Продукт держится на daily seeded runs, ladder pressure и премиальном игровом UI.',
      visualTag: 'Glassmorphism',
      authFlow: {
        type: 'supabase',
        provider: 'email+google',
        onboardingSteps: [
          { id: 'signup', title: 'Регистрация', goal: 'Создать профиль игрока' },
          { id: 'loadout', title: 'Первый loadout', goal: 'Выбрать стиль боя', ahaMoment: 'Игрок получает первый персональный забег' },
        ],
      },
      monetization: {
        model: 'subscription',
        paywall: {
          trigger: 'После 3 полных daily runs в неделю',
          limits: ['3 premium ladders per week', '1 active guild'],
          upgradeMessage: 'Откройте рейтинговые ladder-сезоны и расширенную мета-прогрессию.',
        },
      },
      databaseSchema: {
        sql: 'create table profiles (id uuid primary key); create table runs (id uuid primary key, user_id uuid);',
        tables: [{ name: 'profiles', purpose: 'Профиль игрока и тариф' }],
      },
      aiLogic: {
        features: [{
          name: 'Run commentator',
          purpose: 'Дает персональные советы после завершения забега.',
          model: 'gpt-4.1-mini',
          trigger: 'После завершения ранa',
          systemPrompt: 'Ты аналитик игровых ранoв. Кратко объясни, что улучшить.',
          outputContract: 'JSON с praise, mistakes, next_goal',
        }],
      },
      fileArchitecture: [
        { path: 'src/pages/Home.tsx', role: 'page', purpose: 'Главный экран daily run' },
        { path: 'src/features/runs/components/RunCard.tsx', role: 'component', purpose: 'Карточка активного забега' },
      ],
      premiumUiDirectives: [
        'Use ONLY components from /src/components/ui and /blocks',
        'Follow PREMIUM_DESIGN_SYSTEM.md',
      ],
    }));

    const blueprint = await packageSelectedIdea(sourceIdea, { language: 'ru' });

    expect(blueprint.sourceIdea).toEqual(sourceIdea);
    expect(blueprint.databaseSchema.sql).toContain('create table profiles');
    expect(blueprint.authFlow.onboardingSteps).toHaveLength(2);
    expect(blueprint.aiLogic.features[0].systemPrompt).toContain('аналитик');
    expect(blueprint.fileArchitecture[0].path).toBe('src/pages/Home.tsx');
    expect(blueprint.premiumUiDirectives).toContain('Follow PREMIUM_DESIGN_SYSTEM.md');
  });
});

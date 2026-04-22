// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '../ConfigService';
import { buildFounderReadyBrief } from '../founderBriefBuilder';
import {
  ensureTrendNichesModel,
  getTrendIdeaText,
  loadTrendIdeaBank,
  saveTrendIdeaToBank,
  type TrendNicheInterest,
} from '../ideaFeedService';

beforeEach(() => {
  localStorage.setItem('superadmin_dev_agent_provider', 'off');
  vi.spyOn(ConfigService, 'getKeyForAgent').mockReturnValue('');
  vi.spyOn(ConfigService, 'getApiKey').mockReturnValue('');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('trend niches dashboard model', () => {
  it('exposes daily, weekly, monthly ideas with localized copy', async () => {
    const model = await ensureTrendNichesModel('ru', null, true, 'games');

    expect(model.daily.length).toBeGreaterThan(0);
    expect(model.weekly.length).toBeGreaterThan(0);
    expect(model.monthly.length).toBeGreaterThan(0);
    expect(model.daily.every(idea => idea.categories.includes('games'))).toBe(true);
    expect(model.weekly.every(idea => idea.categories.includes('games'))).toBe(true);
    expect(model.monthly.every(idea => idea.categories.includes('games'))).toBe(true);
    expect(getTrendIdeaText(model.daily[0], 'ru').description).toMatch(/[а-яА-Я]/);
  });

  it('persists bank items without creating projects for the selected interest task', async () => {
    const model = await ensureTrendNichesModel('ru', null, true, 'games');

    saveTrendIdeaToBank(model.daily[0]);
    saveTrendIdeaToBank(model.daily[0]);

    expect(loadTrendIdeaBank()).toHaveLength(1);
    expect(localStorage.getItem('aic-project-meta')).toBeNull();
  });

  it('refreshes to a different fallback set for the same interest when generation access is unavailable', async () => {
    const first = await ensureTrendNichesModel('ru', null, true, 'games');
    const second = await ensureTrendNichesModel('ru', null, true, 'games');

    expect(second.daily.map(idea => getTrendIdeaText(idea, 'ru').title)).not.toEqual(
      first.daily.map(idea => getTrendIdeaText(idea, 'ru').title),
    );
  });

  it('keeps games ideas as actual games, not studio support products', async () => {
    const model = await ensureTrendNichesModel('ru', null, true, 'games');
    const copy = getTrendIdeaText(model.daily[0], 'ru');

    expect(copy.audience).toMatch(/Игрок/);
    expect(`${copy.title} ${copy.description} ${copy.marketAngle} ${copy.whyInteresting}`).not.toMatch(/студи|дашборд|аналит|creator|live-ops|операцион/i);
  });

  it('keeps education ideas as concrete learning apps instead of education-program tooling', async () => {
    const model = await ensureTrendNichesModel('ru', null, true, 'education');
    const copy = getTrendIdeaText(model.daily[0], 'ru');
    const text = `${copy.title} ${copy.description} ${copy.marketAngle} ${copy.whyInteresting}`;

    expect(text).toMatch(/англий|танц|рис|практик|обуч/i);
    expect(text).not.toMatch(/операцион|образовательных программ|дашборд|когорт|куратор|lms/i);
  });

  it('keeps selected interests inside the product itself instead of falling back to old ops surfaces', async () => {
    const interests: TrendNicheInterest[] = [
      'medicine',
      'fintech',
      'wellness',
      'social',
      'productivity',
      'education',
      'commerce',
      'ai',
      'developer-tools',
    ];

    for (const interest of interests) {
      const model = await ensureTrendNichesModel('ru', null, true, interest);
      const text = [...model.daily, ...model.weekly, ...model.monthly]
        .map((idea) => {
          const copy = getTrendIdeaText(idea, 'ru');
          return `${copy.title} ${copy.description} ${copy.marketAngle} ${copy.whyInteresting}`;
        })
        .join(' ');

      expect(text).not.toMatch(/операционная очередь|координационный хаб|операционный обзор|монитор портфеля|planning room|growth studio|review radar|trend desk|action board|дашборд/i);
    }
  });

  it('builds founder-ready brief with optional user comment', async () => {
    const model = await ensureTrendNichesModel('ru', null, true, 'games');
    const brief = buildFounderReadyBrief({
      idea: model.daily[0],
      language: 'ru',
      userComment: 'Сфокусироваться на B2B self-serve.',
    });

    expect(brief).toContain('Название');
    expect(brief).toContain('Целевая аудитория');
    expect(brief).toContain('Сфокусироваться на B2B self-serve.');
  });
});

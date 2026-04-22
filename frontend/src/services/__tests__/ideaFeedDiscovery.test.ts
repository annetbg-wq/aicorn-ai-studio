// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { IDEA_FEED_STORAGE_KEYS, loadCachedHotIdeas, loadCachedNiches } from '../ideaFeedService';

afterEach(() => {
  localStorage.clear();
});

function currentWeekNumber(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return String(Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7));
}

describe('discovery feed cache normalization', () => {
  it('normalizes legacy hot idea plans into lightweight product ideas', () => {
    localStorage.setItem(IDEA_FEED_STORAGE_KEYS.hotIdeas, JSON.stringify({
      date: new Date().toISOString(),
      ideas: [{
        id: 'idea-1',
        appName: 'Arcade Tactics',
        description: 'A daily duel game for commuters.',
        competitorGap: 'Existing titles feel too long for short sessions.',
        theme: 'neon',
      }],
    }));

    const ideas = loadCachedHotIdeas();

    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({
      id: 'idea-1',
      title: 'Arcade Tactics',
      pitch: 'A daily duel game for commuters.',
      marketGap: 'Existing titles feel too long for short sessions.',
      visualTag: 'neon',
    });
  });

  it('reads cached niche ideas already stored in discovery format', () => {
    localStorage.setItem(IDEA_FEED_STORAGE_KEYS.niches, JSON.stringify({
      week: currentWeekNumber(),
      ideas: [{
        id: 'idea-2',
        title: 'Clinic Recall Radar',
        pitch: 'Flags high-risk recall windows for private clinics.',
        marketGap: 'Current workflows live in spreadsheets and email chains.',
        visualTag: 'Modern SaaS',
      }],
    }));

    const ideas = loadCachedNiches();

    expect(ideas).toHaveLength(1);
    expect(ideas[0].title).toBe('Clinic Recall Radar');
    expect(ideas[0].marketGap).toContain('spreadsheets');
  });
});

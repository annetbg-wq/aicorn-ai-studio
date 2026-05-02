// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  buildLandingFallbackSections,
  buildNewCoderSystemPrompt,
  buildSectionCompositionFiles,
} from '../SimpleGeneration';

describe('SimpleGeneration section composition', () => {
  it('builds a landing fallback plan with real section templates', () => {
    const sections = buildLandingFallbackSections('Plan meals faster every day.', 'MealFlow');

    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections[0]?.template).toBe('HeroLamp');
    expect(sections[sections.length - 1]?.template).toBe('Footer');
  });

  it('materializes short App.tsx composition plus concrete section files', () => {
    const files = buildSectionCompositionFiles([
      {
        template: 'HeroLamp',
        props: {
          title: 'MealFlow',
          subtitle: 'Plan meals faster every day.',
          ctaText: 'Start now',
          ctaHref: '#pricing',
        },
      },
      {
        template: 'FAQ',
        props: {
          items: [{ question: 'What is MealFlow?', answer: 'A meal planning prototype.' }],
        },
      },
    ]);

    const appTsx = files['/App.tsx'] ?? '';

    expect(appTsx).toContain(`import { HeroLamp } from '@/components/sections/HeroLamp';`);
    expect(appTsx).toContain(`import { FAQ } from '@/components/sections/FAQ';`);
    expect(appTsx).toContain('<HeroLamp');
    expect(appTsx).toContain('<FAQ');
    expect(appTsx).toContain('<>');
    expect(appTsx).not.toContain('<main');
    expect(appTsx).not.toContain('<section');
    expect(appTsx).not.toContain('<div');
    expect(files['/components/sections/HeroLamp.tsx']).toContain('export function HeroLamp');
    expect(files['/components/sections/FAQ.tsx']).toContain('export function FAQ');
  });

  it('adds hard constraints for section-only App.tsx generation when plan sections exist', () => {
    const prompt = buildNewCoderSystemPrompt({
      mode: 'landing',
      plan: {
        appName: 'MealFlow',
        sections: [
          { template: 'HeroLamp', props: { title: 'MealFlow' } },
          { template: 'Footer', props: { brand: 'MealFlow' } },
        ],
      },
    });

    expect(prompt).toContain('SECTION COMPOSITION MODE (HARD CONSTRAINT)');
    expect(prompt).toContain(`@/components/sections/<TemplateName>`);
    expect(prompt).toContain('Do NOT write raw layout markup in App.tsx');
  });
});

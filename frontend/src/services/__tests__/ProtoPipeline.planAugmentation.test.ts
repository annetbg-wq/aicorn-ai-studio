// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { augmentArchitectPlan, buildArchitectShapeRequirement } from '../ProtoPipeline';

describe('ProtoPipeline architect augmentation', () => {
  it('adds config-navigation and route wiring for the standard habit tracker brief', () => {
    const plan = augmentArchitectPlan({
      prompt: 'Трекер привычек: ежедневные отметки, стрик, статистика',
      skeletonId: 'mobile-app',
      fileTree: {
        'pages/Home.tsx': 'Today screen with the current habit list.',
      },
      pages: [],
      notes: [],
    });

    expect(plan.fileTree).toMatchObject({
      'config/routes.ts': expect.stringContaining('route'),
      'config/navigation.ts': expect.stringContaining('navigation'),
      'pages/Home.tsx': expect.stringContaining('Today'),
      'pages/Create.tsx': expect.stringContaining('Create habit'),
      'pages/Detail.tsx': expect.stringContaining('Habit detail'),
      'pages/Progress.tsx': expect.stringContaining('Progress'),
      'pages/Profile.tsx': expect.stringContaining('Profile'),
    });
    expect(plan.pages.map((page) => page.file)).toEqual(expect.arrayContaining([
      'pages/Home.tsx',
      'pages/Create.tsx',
      'pages/Detail.tsx',
      'pages/Progress.tsx',
      'pages/Profile.tsx',
    ]));
  });

  it('adds a real habit data layer for the standard habit tracker brief', () => {
    const plan = augmentArchitectPlan({
      prompt: 'habit tracker with daily check-ins and streaks',
      skeletonId: 'mobile-app',
      fileTree: {},
      pages: [],
      notes: [],
    });

    expect(plan.fileTree).toMatchObject({
      'data/types.ts': expect.stringContaining('Habit domain types'),
      'data/seed.ts': expect.stringContaining('Starter habits'),
      'data/habits.ts': expect.stringContaining('Pure habit data helpers'),
      'hooks/useHabits.ts': expect.stringContaining('Shared habit state hook'),
      'components/HabitCard.tsx': expect.stringContaining('Reusable habit card'),
    });
    expect(plan.dataModel).toContain('Habit');
    expect(plan.notes.join(' ')).toContain('habit-specific');
  });

  it('exposes an explicit shape requirement for habit tracker planning', () => {
    const requirement = buildArchitectShapeRequirement('Трекер привычек: ежедневные отметки, стрик, статистика', 'mobile-app');
    expect(requirement).toContain('config/routes.ts');
    expect(requirement).toContain('data/types.ts');
    expect(requirement).toContain('domain state hook');
  });
});

import { describe, expect, it } from 'vitest';

import type { GenerationResult } from '../../shared/projectModel';
import { analyzeArchitectPlanTruth, analyzeOutputTruth } from '../../shared/outputTruth';
import { GenerationQualityService } from '../benchmark/GenerationQualityService';

function createBaseResult(files: Record<string, string>, changedPaths: string[]): GenerationResult {
  const graphFiles = Object.entries(files).map(([path, content]) => ({
    id: path,
    path,
    content,
    role: path.endsWith('App.tsx') ? 'entry' : path.includes('/pages/') ? 'page' : 'component',
    language: path.endsWith('.ts') ? 'ts' : 'tsx',
    exports: [],
    dependencies: [],
    hash: path,
    generatedAt: '2026-05-12T00:00:00.000Z',
    generatedBy: 'ai',
    isProtected: false,
    userZones: [],
  }));

  const routes = [
    {
      id: '/home',
      path: '/home',
      fileBlueprintId: 'src/pages/Home.tsx',
      filePath: 'src/pages/Home.tsx',
      title: 'Home',
      isIndex: false,
      isProtected: false,
      params: [],
      children: [],
    },
  ];

  return {
    id: 'generation-1',
    status: 'completed',
    graph: {
      version: 1,
      id: 'graph-1',
      projectId: 'project-1',
      revisionId: 'revision-1',
      manifest: {
        version: 1,
        id: 'manifest-1',
        name: 'Proof Test',
        description: 'Proof Test',
        intent: 'Build a product UI',
        targetPlatforms: ['web'],
        techStack: {
          framework: 'react',
          language: 'typescript',
          styling: 'tailwind',
          bundler: 'vite',
          backend: null,
          stateManagement: null,
        },
        createdAt: '2026-05-12T00:00:00.000Z',
        updatedAt: '2026-05-12T00:00:00.000Z',
      },
      files: graphFiles,
      routes,
      features: [],
      externalDependencies: [],
      entryFileId: 'src/App.tsx',
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
    },
    operations: changedPaths.map((name) => ({ op: 'upsert', name, content: files[name] ?? '' })),
    message: 'done',
    phase: 'idle',
    usedModel: 'test-model',
    selfCorrected: false,
    iterations: 1,
    durationMs: 50,
    createdAt: '2026-05-12T00:00:00.000Z',
    changePackage: {
      plan: [],
      graph: null as never,
      fileOperations: [],
      routeManifest: {
        routes,
        isMultiPage: false,
      },
      dependencies: [],
      previewMeta: {
        entryFile: 'src/App.tsx',
        capabilities: [],
      },
      guardResults: {
        integration: {
          isHealthy: true,
          totalIssues: 0,
          fixedCount: 0,
          reportedCount: 0,
          unresolvedIssues: [],
          durationMs: 0,
        },
        integrity: {
          passed: true,
          errorCount: 0,
          warnCount: 0,
          errors: [],
          warnings: [],
          durationMs: 0,
        },
        runtime: {
          passed: true,
          failingFiles: [],
          reasons: [],
          durationMs: 0,
        },
      },
      warnings: [],
      repairHints: [],
    },
    dependencies: [],
    previewMeta: {
      entryFile: 'src/App.tsx',
      framework: 'react',
      isMultiPage: false,
    },
    warnings: [],
    repairHints: [],
  } as unknown as GenerationResult;
}

describe('output truth hard gates', () => {
  it('rejects placeholder and trivial deltas', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/pages/Home.tsx': "export default function Home(){return <div className='p-4'><h1>Test</h1></div>;}",
        'src/config/app.ts': "export const APP_CONFIG={name:'Test'} as const;",
      },
      changedPaths: ['src/pages/Home.tsx', 'src/config/app.ts'],
      routeCount: 4,
    });

    expect(truth.passed).toBe(false);
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('placeholder-text');
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('home-bare-heading');
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('delta-too-small');
  });

  it('accepts a non-trivial interactive delta', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/App.tsx': `
          import Home from './pages/Home';
          export default function App() {
            return <Home />;
          }
        `,
        'src/main.tsx': `
          import React from 'react';
          import ReactDOM from 'react-dom/client';
          import App from './App';
          ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
        `,
        'src/components/AppShell.tsx': `
          export function AppShell({ children }: { children: React.ReactNode }) {
            return <div className="min-h-screen bg-background">{children}</div>;
          }
        `,
        'src/config/theme.ts': `
          export const theme = {
            accent: '#4f46e5',
            surface: '#111827',
          } as const;
        `,
        'src/index.css': `
          :root { color-scheme: dark; }
          body { margin: 0; font-family: Inter, sans-serif; background: #020617; }
        `,
        'src/pages/Home.tsx': `
          export default function Home() {
            const items = [{ id: '1', name: 'Water' }];
            return (
              <main className="p-4">
                <section>
                  <h1>Habits</h1>
                  <p>Track the habits that matter this week.</p>
                  <button onClick={() => null}>Add habit</button>
                  <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
                </section>
              </main>
            );
          }
        `,
        'src/pages/Progress.tsx': `
          export default function Progress() {
            return (
              <main className="p-4">
                <section className="space-y-4">
                  <h1>Progress</h1>
                  <p>Review your weekly completion trend and export a summary.</p>
                  <article className="rounded-xl border p-4">
                    <h2>This week</h2>
                    <p>4 of 5 planned sessions completed.</p>
                  </article>
                  <button type="button">Export report</button>
                </section>
              </main>
            );
          }
        `,
        'src/hooks/useHabits.ts': `
          import { useMemo, useState } from 'react';
          export function useHabits() {
            const [habits] = useState([{ id: '1', name: 'Water' }]);
            return useMemo(() => habits.filter(Boolean), [habits]);
          }
        `,
        'src/data/types.ts': `
          export interface Habit {
            id: string;
            name: string;
            streak: number;
            completedDates: string[];
          }
        `,
      },
      changedPaths: ['src/pages/Home.tsx', 'src/pages/Progress.tsx', 'src/hooks/useHabits.ts', 'src/data/types.ts'],
      routeCount: 2,
    });

    expect(truth.passed).toBe(true);
    expect(truth.meaningfulChangedFiles.length).toBeGreaterThanOrEqual(3);
    expect(truth.interactiveFiles.length).toBeGreaterThan(0);
    expect(truth.outputStructurePassed).toBe(true);
    expect(truth.deltaStructurePassed).toBe(true);
    expect(truth.architecturalRichnessPassed).toBe(true);
  });

  it('rejects a skeleton-aware single-screen delta that never escapes Home.tsx', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
        'src/main.tsx': "import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
        'src/index.css': 'body { margin: 0; }',
        'src/components/BottomTabs.tsx': 'export function BottomTabs(){ return <nav><button>Home</button></nav>; }',
        'src/hooks/useTheme.ts': 'export function useTheme(){ return { theme: "dark" as const }; }',
        'src/context/AppContext.tsx': 'export function useApp(){ return { user: null }; }',
        'src/config/theme.ts': 'export const theme = { accent: "#4f46e5" } as const;',
        'src/pages/Home.tsx': `
          export default function Home() {
            return <main><h1>Home</h1><p>Weekly habits</p></main>;
          }
        `,
      },
      changedPaths: ['src/pages/Home.tsx'],
      routeCount: 5,
      skeletonId: 'mobile-app',
    });

    expect(truth.passed).toBe(false);
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('missing-delta-structure');
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('single-screen-monolith');
    expect(truth.blockers.map((blocker) => blocker.code)).toContain('architectural-richness');
  });

  it('counts meaningful rewritten skeleton pages and config/data files as delta structure', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
        'src/main.tsx': "import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
        'src/index.css': 'body { margin: 0; }',
        'src/components/BottomTabs.tsx': 'export function BottomTabs(){ return <nav><button>Home</button></nav>; }',
        'src/hooks/useTheme.ts': 'export function useTheme(){ return { theme: "dark" as const }; }',
        'src/context/AppContext.tsx': 'export function useApp(){ return { user: null }; }',
        'src/config/theme.ts': 'export const theme = { accent: "#4f46e5" } as const;',
        'src/config/routes.ts': `
          export const ROUTES = {
            home: '/home',
            create: '/create',
            detail: '/detail/:id',
            progress: '/progress',
            profile: '/profile',
          } as const;
          export const detailRoute = (id: string) => ROUTES.detail.replace(':id', id);
        `,
        'src/config/navigation.ts': `
          export const BOTTOM_TABS = [
            { to: '/home', label: 'Today' },
            { to: '/create', label: 'Add habit' },
            { to: '/progress', label: 'Progress' },
            { to: '/profile', label: 'Profile' },
          ] as const;
        `,
        'src/data/types.ts': `
          export interface Habit {
            id: string;
            name: string;
            cadence: string[];
            streak: number;
            completedDates: string[];
          }
        `,
        'src/data/seed.ts': `
          export const HABIT_SEED = [
            { id: 'habit-1', name: 'Morning walk', cadence: ['Mon', 'Tue'], streak: 3, completedDates: ['2026-05-10'] },
            { id: 'habit-2', name: 'Water refill', cadence: ['Wed', 'Thu'], streak: 5, completedDates: ['2026-05-11'] },
          ] as const;
        `,
        'src/hooks/useHabits.ts': `
          import { useMemo, useState } from 'react';
          import { HABIT_SEED } from '@/data/seed';
          export function useHabits() {
            const [habits, setHabits] = useState([...HABIT_SEED]);
            const completedToday = useMemo(() => habits.filter((habit) => habit.streak > 0), [habits]);
            return { habits, completedToday, setHabits };
          }
        `,
        'src/components/HabitCard.tsx': `
          export function HabitCard({ name, streak }: { name: string; streak: number }) {
            return (
              <article className="rounded-xl border p-4">
                <h2>{name}</h2>
                <p>{streak} day streak</p>
                <button type="button">Complete today</button>
              </article>
            );
          }
        `,
        'src/pages/Home.tsx': `
          import { HabitCard } from '@/components/HabitCard';
          import { useHabits } from '@/hooks/useHabits';
          export default function Home() {
            const { habits } = useHabits();
            return <main>{habits.map((habit) => <HabitCard key={habit.id} name={habit.name} streak={habit.streak} />)}</main>;
          }
        `,
        'src/pages/Create.tsx': `
          export default function Create() {
            return (
              <main>
                <h1>Create habit</h1>
                <input placeholder="e.g., Morning meditation" />
                <button type="button">Save habit</button>
              </main>
            );
          }
        `,
        'src/pages/Progress.tsx': `
          export default function Progress() {
            return (
              <main>
                <h1>Weekly progress</h1>
                <p>4 of 5 habits completed this week.</p>
                <button type="button">Review streaks</button>
              </main>
            );
          }
        `,
        'src/pages/Profile.tsx': `
          export default function Profile() {
            return (
              <main>
                <h1>Profile</h1>
                <p>Reminder time: 07:00</p>
                <button type="button">Adjust reminders</button>
              </main>
            );
          }
        `,
      },
      changedPaths: [
        'src/config/routes.ts',
        'src/config/navigation.ts',
        'src/data/types.ts',
        'src/data/seed.ts',
        'src/hooks/useHabits.ts',
        'src/components/HabitCard.tsx',
        'src/pages/Home.tsx',
        'src/pages/Create.tsx',
        'src/pages/Progress.tsx',
        'src/pages/Profile.tsx',
      ],
      routeCount: 5,
      skeletonId: 'mobile-app',
    });

    expect(truth.outputStructurePassed).toBe(true);
    expect(truth.deltaStructurePassed).toBe(true);
    expect(truth.structure.missingDeltaClasses).toEqual([]);
    expect(truth.structure.buckets.find((bucket) => bucket.id === 'pages-routes')?.meaningfulDeltaCount).toBeGreaterThanOrEqual(4);
    expect(truth.structure.buckets.find((bucket) => bucket.id === 'config-navigation')?.meaningfulDeltaCount).toBeGreaterThanOrEqual(1);
    expect(truth.structure.buckets.find((bucket) => bucket.id === 'data-layer')?.meaningfulDeltaCount).toBeGreaterThanOrEqual(2);
  });

  it('allows product-specific input placeholders without triggering placeholder blockers', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/App.tsx': "import Create from './pages/Create'; export default function App(){ return <Create />; }",
        'src/main.tsx': "import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
        'src/index.css': 'body { margin: 0; }',
        'src/config/navigation.ts': `export const NAV = [{ to: '/create', label: 'Add habit' }] as const;`,
        'src/data/types.ts': `export interface Habit { id: string; name: string; cadence: string[]; }`,
        'src/hooks/useHabits.ts': `import { useState } from 'react'; export function useHabits(){ const [habits] = useState([{ id: '1', name: 'Morning meditation', cadence: ['Mon'] }]); return { habits }; }`,
        'src/pages/Create.tsx': `
          import { useHabits } from '@/hooks/useHabits';
          export default function Create() {
            useHabits();
            return (
              <main>
                <h1>Create a habit</h1>
                <p>Start with a habit you can repeat every day this week.</p>
                <input placeholder="e.g., Morning meditation" />
                <button type="button">Save habit</button>
              </main>
            );
          }
        `,
      },
      changedPaths: [
        'src/config/navigation.ts',
        'src/data/types.ts',
        'src/hooks/useHabits.ts',
        'src/pages/Create.tsx',
      ],
      routeCount: 1,
      skeletonId: 'mobile-app',
    });

    expect(truth.blockers.map((blocker) => blocker.code)).not.toContain('placeholder-text');
    expect(truth.placeholderHits).toHaveLength(0);
  });

  it('still blocks generic placeholder copy and generic placeholder input values', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/App.tsx': "import Create from './pages/Create'; export default function App(){ return <Create />; }",
        'src/main.tsx': "import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
        'src/index.css': 'body { margin: 0; }',
        'src/config/navigation.ts': `export const NAV = [{ to: '/create', label: 'Create' }] as const;`,
        'src/data/types.ts': `export interface Habit { id: string; name: string; }`,
        'src/hooks/useHabits.ts': `export function useHabits(){ return { habits: [] as { id: string; name: string }[] }; }`,
        'src/pages/Create.tsx': `
          export default function Create() {
            return (
              <main>
                <h1>TODO</h1>
                <input placeholder="Placeholder" />
                <p>Lorem ipsum dolor sit amet.</p>
              </main>
            );
          }
        `,
      },
      changedPaths: [
        'src/config/navigation.ts',
        'src/data/types.ts',
        'src/hooks/useHabits.ts',
        'src/pages/Create.tsx',
      ],
      routeCount: 1,
      skeletonId: 'mobile-app',
    });

    expect(truth.blockers.map((blocker) => blocker.code)).toContain('placeholder-text');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Regression tests A–F (fix_outputtruth_delta_classifier_path_mapping_02)
// ──────────────────────────────────────────────────────────────────────────────

const HABIT_BASE_FILES = {
  'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
  'src/main.tsx': "import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
  'src/index.css': 'body { margin: 0; }',
  'src/context/AppContext.tsx': 'export function useApp(){ return { user: null }; }',
  'src/components/HabitCard.tsx': "export function HabitCard({ name }: { name: string }) { return <article><h2>{name}</h2><button type='button'>Complete</button></article>; }",
  'src/hooks/useHabits.ts': "import { useState } from 'react'; export function useHabits(){ const [habits] = useState([{ id:'1', name:'Morning walk' }]); return { habits }; }",
  'src/pages/Home.tsx': "import { HabitCard } from '@/components/HabitCard'; import { useHabits } from '@/hooks/useHabits'; export default function Home(){ const { habits } = useHabits(); return <main><h1>Habits</h1>{habits.map((h) => <HabitCard key={h.id} name={h.name} />)}</main>; }",
  'src/pages/Create.tsx': "export default function Create() { return <main><h1>New habit</h1><input placeholder='e.g., Morning meditation' /><button type='button'>Save habit</button></main>; }",
  'src/pages/Progress.tsx': "export default function Progress(){ return <main><h1>Progress</h1><p>Weekly completion rate</p></main>; }",
  'src/pages/Profile.tsx': "export default function Profile(){ return <main><h1>Profile</h1><button type='button'>Reset habits</button></main>; }",
};

describe('Regression A: delta paths with src/ prefix count for all bucket classes', () => {
  it('pages-routes, config-navigation, and data-layer all PASS when paths use src/ prefix', () => {
    const truth = analyzeOutputTruth({
      files: {
        ...HABIT_BASE_FILES,
        'src/config/navigation.ts': `
          export const NAV_ITEMS = [
            { to: '/home', label: 'Today', icon: 'home' },
            { to: '/create', label: 'Add', icon: 'plus-circle' },
            { to: '/progress', label: 'Progress', icon: 'bar-chart' },
            { to: '/profile', label: 'Profile', icon: 'user' },
          ] as const;
          export type NavItem = typeof NAV_ITEMS[number];
        `,
        'src/config/routes.ts': `
          export const ROUTES = {
            home: '/home',
            create: '/create',
            detail: '/detail/:id',
            progress: '/progress',
            profile: '/profile',
          } as const;
          export function buildDetailPath(id: string): string {
            return ROUTES.detail.replace(':id', id);
          }
        `,
        'src/data/types.ts': `
          export interface Habit {
            id: string;
            name: string;
            cadence: string[];
            streak: number;
            bestStreak: number;
            completedDates: string[];
            note?: string;
          }
          export interface UserProfile { id: string; name: string; reminderTime: string; }
        `,
        'src/data/seed.ts': `
          import type { Habit } from './types';
          export const HABIT_SEED: Habit[] = [
            { id: '1', name: 'Morning walk', cadence: ['Mon','Wed','Fri'], streak: 3, bestStreak: 7, completedDates: [] },
            { id: '2', name: 'Read 20 pages', cadence: ['Daily'], streak: 1, bestStreak: 4, completedDates: [] },
          ];
        `,
      },
      changedPaths: [
        'src/pages/Home.tsx',
        'src/config/navigation.ts',
        'src/config/routes.ts',
        'src/data/types.ts',
        'src/data/seed.ts',
      ],
      routeCount: 4,
      skeletonId: 'mobile-app',
    });

    const missing = truth.structure.missingDeltaClasses ?? [];
    expect(missing).not.toContain('pages-routes');
    expect(missing).not.toContain('config-navigation');
    expect(missing).not.toContain('data-layer');
  });
});

describe('Regression B: delta paths without src/ prefix also count', () => {
  it('pages-routes, config-navigation, and data-layer all PASS when paths lack src/ prefix', () => {
    const truth = analyzeOutputTruth({
      files: {
        ...HABIT_BASE_FILES,
        'src/config/navigation.ts': `
          export const NAV_ITEMS = [
            { to: '/home', label: 'Today', icon: 'home' },
            { to: '/create', label: 'Add', icon: 'plus-circle' },
            { to: '/progress', label: 'Progress', icon: 'bar-chart' },
            { to: '/profile', label: 'Profile', icon: 'user' },
          ] as const;
          export type NavItem = typeof NAV_ITEMS[number];
        `,
        'src/data/types.ts': `
          export interface Habit {
            id: string;
            name: string;
            cadence: string[];
            streak: number;
            completedDates: string[];
          }
          export interface UserProfile { id: string; name: string; }
        `,
        'src/data/seed.ts': `
          import type { Habit } from './types';
          export const HABIT_SEED: Habit[] = [
            { id: '1', name: 'Morning walk', cadence: ['Mon','Wed','Fri'], streak: 3, completedDates: [] },
          ];
        `,
      },
      changedPaths: [
        'pages/Home.tsx',        // no src/ prefix
        'config/navigation.ts',  // no src/ prefix
        'data/types.ts',         // no src/ prefix
        'data/seed.ts',          // no src/ prefix
      ],
      routeCount: 3,
      skeletonId: 'mobile-app',
    });

    const missing = truth.structure.missingDeltaClasses ?? [];
    expect(missing).not.toContain('pages-routes');
    expect(missing).not.toContain('config-navigation');
    expect(missing).not.toContain('data-layer');
  });
});

describe('Regression C: modified skeleton page counts as meaningful delta', () => {
  it('a habit-specific Home page is counted as meaningful even if path exists in skeleton', () => {
    const navContent = `
      export const NAV_ITEMS = [
        { to: '/home', label: 'Today', icon: 'home' },
        { to: '/create', label: 'Add', icon: 'plus' },
        { to: '/progress', label: 'Progress', icon: 'chart' },
      ] as const;
      export type NavItem = typeof NAV_ITEMS[number];
    `;
    const truth = analyzeOutputTruth({
      files: {
        ...HABIT_BASE_FILES,
        'src/config/navigation.ts': navContent,
        'src/data/types.ts': `
          export interface Habit { id: string; name: string; streak: number; completedDates: string[]; }
          export interface UserProfile { id: string; name: string; }
        `,
        'src/data/seed.ts': `
          import type { Habit } from './types';
          export const HABIT_SEED: Habit[] = [{ id: '1', name: 'Morning walk', streak: 3, completedDates: [] }];
        `,
      },
      changedPaths: [
        'src/pages/Home.tsx',
        'src/config/navigation.ts',
        'src/data/types.ts',
        'src/data/seed.ts',
      ],
      routeCount: 3,
      skeletonId: 'mobile-app',
      // Home.tsx exists in skeleton — proves classifier handles modified-from-skeleton correctly
      skeletonPaths: ['src/pages/Home.tsx', 'src/pages/Create.tsx', 'src/pages/Progress.tsx'],
    });

    // Home.tsx has habit-specific JSX content → must count as meaningful page
    expect(truth.meaningfulChangedFiles).toContain('src/pages/Home.tsx');
    const missing = truth.structure.missingDeltaClasses ?? [];
    expect(missing).not.toContain('pages-routes');
  });
});

describe('Regression D: skeleton-identical file does NOT count as meaningful delta', () => {
  it('a file present in changedPaths but with generic scaffold content is not meaningful', () => {
    const truth = analyzeOutputTruth({
      files: {
        'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
        'src/main.tsx': "import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
        'src/index.css': 'body { margin: 0; }',
        // Deliberately generic / scaffold content
        'src/data/types.ts': 'export interface Item { id: string; }',
      },
      changedPaths: ['src/data/types.ts'],
      routeCount: 1,
      skeletonId: 'mobile-app',
    });

    // Without any page files or config-nav, the delta is incomplete regardless of data/types.ts
    const missing = truth.structure.missingDeltaClasses ?? [];
    expect(missing).toContain('pages-routes');
    expect(missing).toContain('config-navigation');
  });
});

describe('Regression E: non-identical config + data files pass their respective buckets', () => {
  it('config-navigation and data-layer PASS when both have habit-specific content', () => {
    const truth = analyzeOutputTruth({
      files: {
        ...HABIT_BASE_FILES,
        'src/config/navigation.ts': `
          export const NAV_ITEMS = [
            { to: '/home', label: 'Today', icon: 'home' },
            { to: '/create', label: 'Add', icon: 'plus-circle' },
            { to: '/progress', label: 'Stats', icon: 'bar-chart' },
            { to: '/profile', label: 'Profile', icon: 'user' },
          ] as const;
          export type NavItem = typeof NAV_ITEMS[number];
        `,
        'src/data/types.ts': `
          export interface Habit {
            id: string;
            name: string;
            streak: number;
            completedDates: string[];
            cadence: string[];
          }
          export interface UserProfile { id: string; name: string; reminderTime: string; }
        `,
        'src/data/seed.ts': `
          import type { Habit } from './types';
          export const HABIT_SEED: Habit[] = [
            { id: '1', name: 'Morning walk', streak: 3, completedDates: [], cadence: ['Mon','Wed','Fri'] },
          ];
        `,
      },
      changedPaths: [
        'src/pages/Home.tsx',
        'src/config/navigation.ts',
        'src/data/types.ts',
        'src/data/seed.ts',
      ],
      routeCount: 4,
      skeletonId: 'mobile-app',
    });

    const missing = truth.structure.missingDeltaClasses ?? [];
    expect(missing).not.toContain('config-navigation');
    expect(missing).not.toContain('data-layer');
  });
});

describe('Regression F: error message references actual missingDeltaClasses, not all required classes', () => {
  it('when only data-layer is missing, error names only data-layer', () => {
    // Provide proper navigation config (>= 120 chars) but no data files
    const truth = analyzeOutputTruth({
      files: {
        ...HABIT_BASE_FILES,
        'src/config/navigation.ts': `
          export const NAV_ITEMS = [
            { to: '/home', label: 'Today', icon: 'home' },
            { to: '/create', label: 'Add', icon: 'plus-circle' },
            { to: '/progress', label: 'Progress', icon: 'bar-chart' },
          ] as const;
          export type NavItem = typeof NAV_ITEMS[number];
        `,
        'src/config/routes.ts': `
          export const ROUTES = {
            home: '/home',
            create: '/create',
            progress: '/progress',
          } as const;
          export function buildDetailPath(id: string): string {
            return \`/detail/\${id}\`;
          }
        `,
        // data files intentionally absent / generic
      },
      changedPaths: ['src/pages/Home.tsx', 'src/config/navigation.ts', 'src/config/routes.ts'],
      routeCount: 3,
      skeletonId: 'mobile-app',
    });

    const deltaMissing = truth.blockers.find((b) => b.code === 'missing-delta-structure');
    if (deltaMissing) {
      expect(deltaMissing.message).toContain('data-layer');
      expect(deltaMissing.message).not.toContain('pages-routes');
      expect(deltaMissing.message).not.toContain('config-navigation');
    }
    const missing = truth.structure.missingDeltaClasses ?? [];
    expect(missing).not.toContain('pages-routes');
    expect(missing).not.toContain('config-navigation');
    expect(missing).toContain('data-layer');
  });
});

describe('GenerationQualityService', () => {
  it('escalates weak placeholder output to blocking severity', () => {
    const result = createBaseResult(
      {
        'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
        'src/pages/Home.tsx': "export default function Home(){return <div className='p-4'><h1>Test</h1></div>;}",
        'src/config/app.ts': "export const APP_CONFIG={name:'Test'} as const;",
      },
      ['src/pages/Home.tsx', 'src/config/app.ts'],
    );

    const summary = GenerationQualityService.evaluate(result);

    expect(summary.passed).toBe(false);
    expect(summary.severity).toBe('blocking');
    expect(summary.checks.outputProofPassed).toBe(false);
    expect(summary.blockers.join(' ')).toContain('Placeholder-like copy');
  });

  it('keeps output proof blocking until the same code-delta proof becomes meaningful', () => {
    const weak = createBaseResult(
      {
        'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
        'src/pages/Home.tsx': "export default function Home(){return <div><h1>Test</h1></div>;}",
        'src/config/app.ts': "export const APP_CONFIG={name:'Test'} as const;",
      },
      ['src/pages/Home.tsx', 'src/config/app.ts'],
    );
    const strong = createBaseResult(
      {
        'src/App.tsx': "import Home from './pages/Home'; export default function App(){ return <Home />; }",
        'src/styles/generated-theme.css': ':root { color-scheme: light; --background: #ffffff; }',
        'src/config/navigation.ts': "export const NAV = [{ to: '/home', label: 'Today' }, { to: '/progress', label: 'Progress' }] as const;",
        'src/pages/Home.tsx': `
          import { HabitCard } from '@/components/HabitCard';
          import { useHabits } from '@/hooks/useHabits';
          export default function Home(){ const { habits } = useHabits(); return <main><h1>Habits</h1><button type="button">Add habit</button>{habits.map((habit) => <HabitCard key={habit.id} name={habit.name} streak={habit.streak} />)}</main>; }
        `,
        'src/pages/Progress.tsx': "export default function Progress(){ return <main><h1>Progress</h1><p>Weekly completion rate</p><button type='button'>Review streaks</button></main>; }",
        'src/components/HabitCard.tsx': "export function HabitCard({ name, streak }: { name: string; streak: number }) { return <article><h2>{name}</h2><p>{streak} day streak</p><button type='button'>Complete today</button></article>; }",
        'src/hooks/useHabits.ts': "import { useState } from 'react'; export function useHabits(){ const [habits] = useState([{ id: '1', name: 'Morning walk', streak: 3 }]); return { habits }; }",
        'src/data/types.ts': "export interface Habit { id: string; name: string; streak: number; }",
        'src/data/seed.ts': "export const HABIT_SEED = [{ id: '1', name: 'Morning walk', streak: 3 }];",
      },
      ['src/styles/generated-theme.css', 'src/config/navigation.ts', 'src/pages/Home.tsx', 'src/pages/Progress.tsx', 'src/components/HabitCard.tsx', 'src/hooks/useHabits.ts', 'src/data/types.ts', 'src/data/seed.ts'],
    );

    const weakSummary = GenerationQualityService.evaluate(weak);
    const strongSummary = GenerationQualityService.evaluate(strong);

    expect(weakSummary.checks.outputProofPassed).toBe(false);
    expect(strongSummary.checks.outputProofPassed).toBe(true);
  });
});

describe('architect plan truth', () => {
  it('requires a skeleton-aware non-trivial plan', () => {
    const weakPlan = analyzeArchitectPlanTruth({
      appName: 'Test',
      skeleton: 'mobile-app',
      fileTree: {
        'src/pages/Home.tsx': 'Placeholder',
      },
    });

    const strongPlan = analyzeArchitectPlanTruth({
      appName: 'HabitFlow',
      skeleton: 'mobile-app',
      summary: 'Habit tracker with daily check-ins, streaks, and progress views.',
      fileTree: {
        'src/pages/Home.tsx': 'Home feed with habit cards, streak summary, and mark-done interactions.',
        'src/pages/Progress.tsx': 'Progress screen with weekly completion trends and streak comparisons.',
        'src/pages/Profile.tsx': 'Profile screen with goals, reset controls, and theme toggles.',
        'src/hooks/useHabits.ts': 'Shared state hook that loads, updates, and persists habit data.',
        'src/data/types.ts': 'Domain types for habits, progress summaries, and daily completion records.',
      },
      contextContract: 'Use AppContext for shared habit state and never write onboarding state directly.',
      dataModel: 'Habit: { id: string, name: string, streak: number, completedDates: string[] }',
    });

    expect(weakPlan.passed).toBe(false);
    expect(weakPlan.blockers.join(' ')).toContain('placeholder');
    expect(strongPlan.passed).toBe(true);
  });
});

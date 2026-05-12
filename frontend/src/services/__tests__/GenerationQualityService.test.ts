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

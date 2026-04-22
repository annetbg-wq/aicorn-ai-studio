import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChangePackage,
  EntitySpec,
  FileBlueprint,
  FlowSpec,
  GenerationResult,
  ProductManifest,
  ProjectGraph,
  RouteSpec,
  TechStackSpec,
} from '../../shared/projectModel';
import { buildArtistLayer } from '../designSystem';
import { VisualQualityService } from '../benchmark/VisualQualityService';

const NOW = '2026-04-18T00:00:00.000Z';

const TECH_STACK: TechStackSpec = {
  framework: 'react',
  language: 'typescript',
  styling: 'tailwind',
  bundler: 'vite',
  backend: null,
  stateManagement: 'zustand',
};

function createFile(
  path: string,
  role: FileBlueprint['role'],
  content: string,
): FileBlueprint {
  const language =
    path.endsWith('.css') ? 'css' :
    path.endsWith('.ts') ? 'ts' :
    path.endsWith('.tsx') ? 'tsx' :
    'tsx';

  return {
    id: path,
    path,
    content,
    role,
    language,
    exports: [],
    dependencies: [],
    hash: path,
    generatedAt: NOW,
    generatedBy: 'ai',
    isProtected: false,
    userZones: [],
  };
}

function createRoute(file: FileBlueprint, path: string, title: string): RouteSpec {
  return {
    id: path,
    path,
    fileBlueprintId: file.id,
    filePath: file.path,
    title,
    isIndex: path === '/',
    isProtected: false,
    params: [],
    children: [],
  };
}

function createManifest(overrides: Partial<ProductManifest>): ProductManifest {
  return {
    version: 1,
    id: 'manifest-1',
    name: 'Visual Critic Test',
    description: 'Generated visual quality test project',
    intent: 'Build a polished product UI',
    targetPlatforms: ['web'],
    techStack: TECH_STACK,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createGraph(
  manifest: ProductManifest,
  files: FileBlueprint[],
  routes: RouteSpec[],
): ProjectGraph {
  return {
    version: 1,
    id: 'graph-1',
    projectId: 'project-1',
    revisionId: 'revision-1',
    manifest,
    files,
    routes,
    features: [],
    externalDependencies: [],
    entryFileId: files[0]?.id ?? 'src/App.tsx',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createChangePackage(graph: ProjectGraph, routes: RouteSpec[]): ChangePackage {
  return {
    plan: [],
    graph,
    fileOperations: [],
    routeManifest: {
      routes,
      isMultiPage: routes.length > 1,
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
  };
}

function createGenerationResult({
  visualPreset,
  artistLayer,
  targetPlatforms = ['web'],
  files,
  routes,
  mainEntities = [],
  keyFlows = [],
}: {
  visualPreset: ProductManifest['visualPreset'];
  artistLayer: ProductManifest['artistLayer'];
  targetPlatforms?: ProductManifest['targetPlatforms'];
  files: FileBlueprint[];
  routes: RouteSpec[];
  mainEntities?: EntitySpec[];
  keyFlows?: FlowSpec[];
}): GenerationResult {
  const manifest = createManifest({
    visualPreset,
    artistLayer,
    targetPlatforms,
    isMultiPage: routes.length > 1,
    mainEntities,
    keyFlows,
  });
  const graph = createGraph(manifest, files, routes);
  const changePackage = createChangePackage(graph, routes);

  return {
    id: 'generation-1',
    status: 'complete',
    graph,
    operations: [],
    message: 'done',
    phase: 'idle',
    usedModel: 'test-model',
    selfCorrected: false,
    iterations: 1,
    durationMs: 50,
    createdAt: NOW,
    changePackage,
    dependencies: [],
    previewMeta: {
      entryFile: 'src/App.tsx',
      framework: 'react',
      isMultiPage: routes.length > 1,
    },
    warnings: [],
    repairHints: [],
  };
}

function createStrongResult(): GenerationResult {
  const artistLayer = buildArtistLayer({
    idea: 'Build a B2B analytics dashboard for revenue operations teams',
    classification: {
      category: 'analytics-bi',
      style: 'enterprise',
      confidence: 0.92,
      reasoning: 'Data-heavy dashboard with trust-first hierarchy',
    },
    existingFileCount: 0,
  });

  const appFile = createFile(
    'src/App.tsx',
    'entry',
    `
      import DashboardPage from './pages/DashboardPage';

      export default function App() {
        return (
          <div className="min-h-screen bg-slate-950 text-slate-50">
            <DashboardPage />
          </div>
        );
      }
    `,
  );

  const pageFile = createFile(
    'src/pages/DashboardPage.tsx',
    'page',
    `
      import { BarChart3, PlusCircle } from 'lucide-react';
      import { LoadingState } from '../components/LoadingState';
      import { ErrorState } from '../components/ErrorState';
      import { EmptyState } from '../components/EmptyState';

      export default function DashboardPage() {
        const isLoading = false;
        const hasError = false;
        const hasData = true;

        if (isLoading) return <LoadingState />;
        if (hasError) return <ErrorState onRetry={() => null} />;
        if (!hasData) return <EmptyState title="No deals yet" />;

        return (
          <main className="min-h-screen min-w-0">
            <nav className="border-b px-6 py-4 md:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">Revenue Pulse</p>
                  <h1 className="text-3xl font-semibold">Revenue overview</h1>
                </div>
                <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white">
                  Create report
                </button>
              </div>
            </nav>
            <section className="grid gap-4 px-6 py-6 md:grid-cols-2 md:px-8">
              <article className="rounded-md border p-4">
                <h2 className="text-xl font-semibold">Pipeline</h2>
                <p className="mt-2 text-sm text-slate-400">Current quarter progress and pipeline health.</p>
                <BarChart3 className="mt-4 h-5 w-5" />
              </article>
              <article className="rounded-md border p-4">
                <h2 className="text-xl font-semibold">Next action</h2>
                <p className="mt-2 text-sm text-slate-400">Follow up with open opportunities.</p>
                <button className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white">
                  <PlusCircle className="mr-2 inline h-4 w-4" />
                  Start outreach
                </button>
              </article>
            </section>
          </main>
        );
      }
    `,
  );

  const loadingFile = createFile(
    'src/components/LoadingState.tsx',
    'component',
    `export function LoadingState() { return <div className="p-4">loading skeleton</div>; }`,
  );
  const errorFile = createFile(
    'src/components/ErrorState.tsx',
    'component',
    `export function ErrorState() { return <div className="p-4">error banner retry</div>; }`,
  );
  const emptyFile = createFile(
    'src/components/EmptyState.tsx',
    'component',
    `export function EmptyState() { return <div className="p-4">empty state no data</div>; }`,
  );
  const stylesFile = createFile(
    'src/styles/theme.css',
    'style',
    `
      :root {
        font-family: Inter, system-ui, sans-serif;
        --surface: #0f1117;
        --surface-alt: #1a1d27;
        --border: #2a2d3a;
        --text: #f1f5f9;
        --primary: #3b82f6;
      }
    `,
  );

  const routes = [createRoute(pageFile, '/', 'Dashboard')];
  return createGenerationResult({
    visualPreset: 'enterprise-dashboard',
    artistLayer,
    files: [appFile, pageFile, loadingFile, errorFile, emptyFile, stylesFile],
    routes,
    mainEntities: [
      {
        id: 'deal',
        name: 'Deal',
        description: 'Revenue opportunity',
        attributes: ['name', 'value', 'stage'],
        relations: [],
        needsDB: true,
      },
    ],
    keyFlows: [
      {
        id: 'create-report',
        name: 'Create report',
        description: 'Generate a report for stakeholders',
        steps: ['Open dashboard', 'Choose filters', 'Generate report'],
        involvedEntities: ['deal'],
        isAuthRequired: true,
      },
    ],
  });
}

function createAcceptableResult(): GenerationResult {
  const artistLayer = buildArtistLayer({
    idea: 'Build a focused task manager with a clean, calm interface',
    classification: {
      category: 'task-manager',
      style: 'clean-light',
      confidence: 0.84,
      reasoning: 'Simple productivity workflow with modest hierarchy needs',
    },
    existingFileCount: 0,
  });

  const appFile = createFile(
    'src/App.tsx',
    'entry',
    `
      import TasksPage from './pages/TasksPage';
      export default function App() {
        return <TasksPage />;
      }
    `,
  );

  const pageFile = createFile(
    'src/pages/TasksPage.tsx',
    'page',
    `
      export default function TasksPage() {
        const isLoading = false;
        const hasError = false;

        if (isLoading) return <div className="p-4">loading spinner</div>;
        if (hasError) return <div className="p-4">error retry</div>;

        return (
          <main className="px-4 py-5 md:px-6">
            <section className="space-y-5">
              <h1 className="text-2xl font-semibold">Today</h1>
              <p className="text-sm text-slate-500">Three tasks are still open.</p>
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-white">
                Add task
              </button>
              <div className="grid gap-5">
                <article className="rounded-xl border p-4">
                  <h2 className="text-lg font-medium">Write launch note</h2>
                </article>
              </div>
            </section>
          </main>
        );
      }
    `,
  );

  const routes = [createRoute(pageFile, '/', 'Tasks')];
  return createGenerationResult({
    visualPreset: 'consumer-mobile',
    artistLayer,
    targetPlatforms: ['web', 'mobile'],
    files: [appFile, pageFile],
    routes,
    keyFlows: [
      {
        id: 'capture-task',
        name: 'Capture task',
        description: 'Create and manage a task',
        steps: ['Open app', 'Create task', 'Complete task'],
        involvedEntities: [],
        isAuthRequired: false,
      },
    ],
  });
}

function createWeakResult(): GenerationResult {
  const artistLayer = buildArtistLayer({
    idea: 'Build a travel booking surface with strong visual clarity',
    classification: {
      category: 'travel-experiences',
      style: 'editorial',
      confidence: 0.89,
      reasoning: 'Travel surfaces need clean storytelling and strong conversion',
    },
    existingFileCount: 0,
  });

  const appFile = createFile(
    'src/App.tsx',
    'entry',
    `
      import { Home } from 'lucide-react';
      import { XMarkIcon } from '@heroicons/react/24/outline';

      export default function App() {
        return (
          <div className="w-[1280px] min-w-[1024px] grid grid-cols-6 gap-[19px] p-[13px] m-[7px] bg-[#101010] text-[#fefefe] border-[#222222]">
            <div className="bg-[#222233] text-[#ff00aa] border-[#00ffaa] p-2">
              <Home className="h-4 w-4" />
              <XMarkIcon className="h-4 w-4" />
              <div className="grid grid-cols-4 gap-[11px] p-[17px]">
                <button className="bg-[#123456] px-[15px] py-[9px]">Book</button>
                <button className="bg-[#234567] px-[18px] py-[11px]">Reserve</button>
                <button className="bg-[#345678] px-[13px] py-[7px]">Compare</button>
                <button className="bg-[#456789] px-[17px] py-[9px]">Start</button>
                <button className="bg-[#56789a] px-[19px] py-[13px]">Details</button>
                <button className="bg-[#6789ab] px-[21px] py-[15px]">Offers</button>
                <button className="bg-[#789abc] px-[23px] py-[17px]">Hotels</button>
                <button className="bg-[#89abcd] px-[25px] py-[19px]">Flights</button>
              </div>
            </div>
          </div>
        );
      }
    `,
  );

  const stylesFile = createFile(
    'src/styles/mixed.css',
    'style',
    `
      :root { font-family: Inter, system-ui, sans-serif; color: #111111; background: #f7f7f7; }
      .hero { font-family: "Playfair Display", serif; color: #222222; }
      .promo { color: #333333; background: #444444; border-color: #555555; }
      .promo-alt { color: #666666; background: #777777; border-color: #888888; }
      .cta { color: #999999; background: #aaaaaa; border-color: #bbbbbb; }
      .card { color: #cccccc; background: #dddddd; border-color: #eeeeee; }
    `,
  );

  const routes = [createRoute(appFile, '/', 'Home')];
  return createGenerationResult({
    visualPreset: 'editorial-light',
    artistLayer,
    files: [appFile, stylesFile],
    routes,
    mainEntities: [
      {
        id: 'trip',
        name: 'Trip',
        description: 'Travel itinerary',
        attributes: ['destination', 'dates'],
        relations: [],
        needsDB: false,
      },
    ],
    keyFlows: [
      {
        id: 'book-trip',
        name: 'Book trip',
        description: 'Find and reserve travel',
        steps: ['Browse options', 'Compare', 'Reserve'],
        involvedEntities: ['trip'],
        isAuthRequired: false,
      },
    ],
  });
}

function getDimension(result: ReturnType<typeof VisualQualityService.evaluate>, id: string) {
  return result.dimensions.find((dimension) => dimension.id === id);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VisualQualityService', () => {
  it('produces a strong verdict for a metadata-aligned, state-complete UI', () => {
    const summary = VisualQualityService.evaluate(createStrongResult());
    const evidenceSources = new Set(summary.evidence?.map((item) => item.source) ?? []);

    expect(summary.verdict).toBe('strong');
    expect(summary.score).toBeGreaterThanOrEqual(80);
    expect(summary.reasons.length).toBeGreaterThanOrEqual(3);
    expect(summary.reasons.length).toBeLessThanOrEqual(5);
    expect(evidenceSources.has('route-manifest')).toBe(true);
    expect(evidenceSources.has('preview-meta')).toBe(true);
    expect(getDimension(summary, 'visual-hierarchy')?.verdict).toBe('strong');
    expect(getDimension(summary, 'state-completeness')?.verdict).toBe('strong');
  });

  it('produces an acceptable verdict when the structure is solid but some coverage is still thin', () => {
    const summary = VisualQualityService.evaluate(createAcceptableResult());

    expect(summary.verdict).toBe('acceptable');
    expect(summary.score).toBeGreaterThanOrEqual(58);
    expect(summary.score).toBeLessThan(80);
    expect(getDimension(summary, 'visual-hierarchy')?.score).toBeGreaterThan(60);
    expect(getDimension(summary, 'state-completeness')?.verdict).not.toBe('strong');
  });

  it('produces a weak verdict for cluttered, inconsistent screens', () => {
    const summary = VisualQualityService.evaluate(createWeakResult());

    expect(summary.verdict).toBe('weak');
    expect(summary.score).toBeLessThan(58);
  });

  it('detects weak hierarchy, clutter, missing states, and inconsistent spacing', () => {
    const summary = VisualQualityService.evaluate(createWeakResult());

    expect(getDimension(summary, 'visual-hierarchy')?.verdict).toBe('weak');
    expect(getDimension(summary, 'clutter-breathing-room')?.verdict).toBe('weak');
    expect(getDimension(summary, 'state-completeness')?.verdict).toBe('weak');
    expect(getDimension(summary, 'spacing-consistency')?.verdict).toBe('weak');
    expect(getDimension(summary, 'spacing-consistency')?.reasons.join(' ')).toContain('scale');
    expect(getDimension(summary, 'state-completeness')?.reasons.join(' ')).toContain('missing');
  });

  it('does not depend on network or screenshot availability', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const summary = VisualQualityService.evaluate(createAcceptableResult());

    expect(summary.score).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.notes).toBeUndefined();
  });

  it('stays explainable even when artist metadata is absent by leaning on route and preview metadata', () => {
    const base = createAcceptableResult();
    const graph = {
      ...base.graph,
      manifest: {
        ...base.graph.manifest,
        artistLayer: undefined,
        visualPreset: undefined,
      },
    };

    const summary = VisualQualityService.evaluate({
      ...base,
      graph,
      changePackage: {
        ...base.changePackage,
        graph,
      },
    });

    expect(summary.score).toBeGreaterThan(0);
    expect(summary.notes?.join(' ')).toContain('Artist-layer guidance was absent');
    expect(summary.evidence?.some((item) => item.source === 'route-manifest')).toBe(true);
    expect(summary.evidence?.some((item) => item.source === 'preview-meta')).toBe(true);
  });
});

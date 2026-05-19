import { materializePremiumComponents } from '../../services/ProtoPipeline';
import {
  SKELETON_REGISTRY,
  getSkeletonInstalledFiles,
  type SkeletonId,
} from '../../services/SkeletonRegistry';
import {
  LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
  LIVE_GENERATION_UI_IMPORT_CATALOG,
  buildLiveGenerationUiPrimitiveImportCatalog,
  type CandidateGraphSummary,
  type LiveGenerationContractDiagnostic,
  type LiveGenerationRootCauseType,
  validateCandidateGraphContract,
  validateImportExportContract,
  validateProtectedShellBoundary,
  validateUiPrimitiveCatalogAvailability,
} from '../../services/LiveGenerationContractValidator';
import {
  filterAdvertisedUiPrimitiveNames,
  type UiPrimitiveDisplayName,
} from '../../services/LiveGenerationUiPrimitives';
import { launchTrendIdeaBuild } from '../../services/TrendIdeaLaunchService';
import type {
  ProductBlueprint,
  TrendNicheIdea,
} from '../../services/ideaFeedService';

export type LiveReadinessPreflightStatus = 'pass' | 'fail' | 'warning';

export interface LiveReadinessPreflightCheck {
  id: string;
  label: string;
  status: LiveReadinessPreflightStatus;
  summary: string;
  checkedAt?: string;
  durationMs?: number;
  rootCauseType?: LiveGenerationRootCauseType;
  suggestedFix?: string;
  diagnostics?: LiveGenerationContractDiagnostic[];
  evidence?: Record<string, unknown>;
}

export interface LiveReadinessPreflightResult {
  status: LiveReadinessPreflightStatus;
  checkedAt: string;
  passCount: number;
  failCount: number;
  warningCount: number;
  checks: LiveReadinessPreflightCheck[];
}

export interface LiveReadinessQualityControlsContract {
  hasRunPreflightButton: boolean;
  isolatedFromRunAll: boolean;
  clearsPreflightState: boolean;
  reportIncludesPreflight: boolean;
}

export interface RunLiveReadinessPreflightInput {
  qualityControls: LiveReadinessQualityControlsContract;
  checkIds?: string[];
}

interface LiveReadinessRunnerContext {
  workspaceFiles: readonly string[];
  qualityControls: LiveReadinessQualityControlsContract;
}

interface LiveReadinessCheckRunner {
  id: string;
  run: (context: LiveReadinessRunnerContext) => Promise<LiveReadinessPreflightCheck>;
}

const FRONTEND_UI_MODULES = import.meta.glob('../../components/ui/**/*.{ts,tsx}', { eager: true });
const SKELETON_UI_MODULES = import.meta.glob(
  '../../../../skeletons/*/skeleton-*/src/components/ui/**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);
const SKELETON_UI_INDEX_SOURCES = import.meta.glob(
  '../../../../skeletons/*/skeleton-*/src/components/ui/index.ts',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;
const SKELETON_SHARED_CONTRACT_SOURCES = import.meta.glob(
  [
    '../../../../skeletons/*/skeleton-*/src/hooks/*.{ts,tsx}',
    '../../../../skeletons/*/skeleton-*/src/config/*.{ts,tsx}',
    '../../../../skeletons/*/skeleton-*/src/data/*.{ts,tsx}',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;
const PREMIUM_COMPONENT_MODULES = import.meta.glob(
  '../../../../prototype-bank/design-packs/premium-components/**/component.tsx',
);

const COMMON_SHARED_HOOKS = [
  'useLocalStorage',
  'useApp',
  'useTheme',
  'useMediaQuery',
] as const;

const SHARED_HOOK_IMPORT_CONTRACT: Partial<Record<typeof COMMON_SHARED_HOOKS[number], 'named' | 'default'>> = {
  useLocalStorage: 'named',
  useApp: 'named',
  useTheme: 'named',
  useMediaQuery: 'named',
};

function toWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function stripLeadingTraversal(value: string): string {
  return toWorkspacePath(value).replace(/^(\.\.\/)+/, '');
}

function frontendModulePathToWorkspace(path: string): string {
  const normalized = stripLeadingTraversal(path);
  return normalized.startsWith('frontend/src/') ? normalized : `frontend/src/${normalized}`;
}

function rawGlobPathToWorkspace(path: string): string {
  return stripLeadingTraversal(path);
}

function buildSummary(workspaceFiles: readonly string[]): CandidateGraphSummary {
  return {
    totalFiles: workspaceFiles.length,
    sourceModuleCount: 0,
    pageFileCount: 0,
    meaningfulSourceCount: 0,
    generatedDeltaCount: 0,
    materializedFileCount: 0,
    skeletonFileCount: workspaceFiles.filter(file => file.startsWith('skeletons/')).length,
    hasMain: false,
    hasApp: false,
    hasRouteManifest: false,
    shellOwnerFiles: [],
  };
}

function buildCanonicalWorkspaceFiles(): string[] {
  const frontendFiles = Object.keys(FRONTEND_UI_MODULES).map(frontendModulePathToWorkspace);
  const skeletonUiFiles = Object.keys(SKELETON_UI_MODULES).map(rawGlobPathToWorkspace);
  const skeletonFiles = (Object.keys(SKELETON_REGISTRY) as SkeletonId[])
    .flatMap(skeletonId => getSkeletonInstalledFiles(skeletonId)
      .filter(file => file.startsWith('src/components/ui/'))
      .map(file => `skeletons/${skeletonId}/skeleton-${skeletonId}/${file}`));
  return Array.from(new Set([...frontendFiles, ...skeletonUiFiles, ...skeletonFiles])).sort((left, right) => left.localeCompare(right));
}

function buildSharedHookGraphsBySkeleton(): Record<string, Record<string, string>> {
  const graphs: Record<string, Record<string, string>> = {};
  const entries = Object.entries(SKELETON_SHARED_CONTRACT_SOURCES).sort(([left], [right]) => left.localeCompare(right));

  for (const [rawPath, source] of entries) {
    const workspacePath = rawGlobPathToWorkspace(rawPath);
    const markerIndex = workspacePath.indexOf('/src/');
    if (markerIndex < 0) continue;

    const skeletonKey = workspacePath.slice(0, markerIndex);
    const srcPath = workspacePath.slice(markerIndex + 1);
    graphs[skeletonKey] ??= {};
    graphs[skeletonKey][srcPath] = source;
  }

  return graphs;
}

function normalizeRelativePath(path: string): string {
  const segments = toWorkspacePath(path).split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

function resolveBarrelSpecifier(baseDir: string, specifier: string): string[] {
  const joined = normalizeRelativePath(`${baseDir}/${specifier}`);
  return [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
  ];
}

function validateUiBarrelTruthfulness(workspaceFiles: readonly string[]): LiveGenerationContractDiagnostic[] {
  const summary = buildSummary(workspaceFiles);
  const available = new Set(workspaceFiles.map(toWorkspacePath));
  const diagnostics: LiveGenerationContractDiagnostic[] = [];

  Object.entries(SKELETON_UI_INDEX_SOURCES).forEach(([rawPath, source]) => {
    const barrelPath = rawGlobPathToWorkspace(rawPath);
    const barrelDir = barrelPath.replace(/\/index\.ts$/i, '');
    for (const match of source.matchAll(/\bexport\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1] ?? '';
      if (!specifier.startsWith('.')) continue;
      const resolvedCandidates = resolveBarrelSpecifier(barrelDir, specifier);
      if (resolvedCandidates.some(candidate => available.has(candidate))) continue;
      diagnostics.push({
        root_cause_type: 'prompt_catalog_mismatch',
        file: barrelPath,
        import_path: specifier,
        expected: 'UI barrel export target must resolve to a real component file',
        actual: `no matching file for ${specifier}`,
        suggested_fix: `Restore the component exported from ${barrelPath} or remove the stale barrel export.`,
        candidate_graph_summary: summary,
        raw_error_excerpt: null,
      });
    }
  });

  return diagnostics;
}

function uniqueSkeletonUiPrimitiveNames(): UiPrimitiveDisplayName[] {
  return Array.from(new Set(
    filterAdvertisedUiPrimitiveNames(
      Object.values(SKELETON_REGISTRY)
        .flatMap(meta => meta.uiPrimitives)
        .filter(Boolean),
    ),
  )).sort((left, right) => left.localeCompare(right));
}

function findProvidedComponentGaps(): Array<{ skeletonId: SkeletonId; componentName: string }> {
  const virtualComponents = new Set(['AppShell', 'DashboardShell', 'NavigationShell']);
  return (Object.keys(SKELETON_REGISTRY) as SkeletonId[]).flatMap(skeletonId => {
    const installedBaseNames = new Set(
      getSkeletonInstalledFiles(skeletonId)
        .map(file => file.split('/').pop()?.replace(/\.(?:tsx?|jsx?|json)$/i, ''))
        .filter((value): value is string => Boolean(value)),
    );
    return SKELETON_REGISTRY[skeletonId].providedComponents
      .filter(componentName => !virtualComponents.has(componentName))
      .filter(componentName => !installedBaseNames.has(componentName))
      .map(componentName => ({ skeletonId, componentName }));
  });
}

function sampleTrendIdea(): TrendNicheIdea {
  return {
    id: 'quality-preflight-trend',
    appName: 'Habit Forge',
    title: 'Habit Forge',
    description: 'Daily habit coaching with lightweight progress loops.',
    audience: 'Busy founders tracking personal routines.',
    marketAngle: 'Founder productivity with habit nudges and streak visibility.',
    whyInteresting: 'Habit retention products work best when launch-to-first-checkin is immediate.',
  } as unknown as TrendNicheIdea;
}

function sampleBlueprint(): ProductBlueprint {
  return {
    appName: 'Habit Forge',
    description: 'Tracks habits, streaks, and check-ins.',
    fileArchitecture: [
      { path: 'src/pages/Home.tsx', purpose: 'Shows today habits and streak summary.' },
      { path: 'src/pages/Stats.tsx', purpose: 'Shows streak charts and trend summaries.' },
      { path: 'src/components/HabitCard.tsx', purpose: 'Renders a single habit row with completion affordances.' },
    ],
  } as ProductBlueprint;
}

function makePassCheck(
  id: string,
  label: string,
  summary: string,
  evidence?: Record<string, unknown>,
): LiveReadinessPreflightCheck {
  return { id, label, status: 'pass', summary, evidence };
}

function makeWarningCheck(
  id: string,
  label: string,
  summary: string,
  suggestedFix: string,
  evidence?: Record<string, unknown>,
): LiveReadinessPreflightCheck {
  return {
    id,
    label,
    status: 'warning',
    summary,
    rootCauseType: 'not_testable',
    suggestedFix,
    evidence,
  };
}

function makeDiagnosticCheck(
  id: string,
  label: string,
  diagnostics: LiveGenerationContractDiagnostic[],
  fallbackSummary: string,
): LiveReadinessPreflightCheck {
  const first = diagnostics[0];
  return {
    id,
    label,
    status: 'fail',
    summary: first?.actual ?? fallbackSummary,
    rootCauseType: first?.root_cause_type,
    suggestedFix: first?.suggested_fix,
    diagnostics,
    evidence: diagnostics.length > 1 ? { diagnosticCount: diagnostics.length } : undefined,
  };
}

function runUiPrimitiveCatalogCheck(workspaceFiles: readonly string[]): LiveReadinessPreflightCheck {
  const diagnostics = [
    ...validateUiPrimitiveCatalogAvailability({
      advertisedPrimitives: LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
      workspaceFiles,
    }),
    ...validateUiBarrelTruthfulness(workspaceFiles),
  ];
  if (diagnostics.length > 0) {
    return makeDiagnosticCheck(
      'ui-primitive-catalog',
      'UI primitive catalog',
      diagnostics,
      'Canonical UI primitive catalog is incomplete.',
    );
  }

  return makePassCheck(
    'ui-primitive-catalog',
    'UI primitive catalog',
    `${LIVE_GENERATION_ALLOWED_UI_PRIMITIVES.length} canonical UI primitives resolve before live compile.`,
    { primitiveCount: LIVE_GENERATION_ALLOWED_UI_PRIMITIVES.length },
  );
}

function runImportExportContractCheck(): LiveReadinessPreflightCheck {
  const samples: Array<{
    id: string;
    finalFiles: Record<string, string>;
    expectOk: boolean;
    rootCauseType?: LiveGenerationRootCauseType;
    assertDiagnostic?: (diagnostic: LiveGenerationContractDiagnostic | undefined) => boolean;
    failureSummary: string;
  }> = [
    {
      id: 'valid-named-use-local-storage',
      expectOk: true,
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import { useLocalStorage } from '@/hooks/useLocalStorage';",
          'export function useSymptoms(){ return useLocalStorage; }',
        ].join('\n'),
        'src/hooks/useLocalStorage.ts': 'export function useLocalStorage() {}',
      },
      failureSummary: 'Valid named import from useLocalStorage failed import/export validation.',
    },
    {
      id: 'invalid-default-use-local-storage',
      expectOk: false,
      rootCauseType: 'invalid_default_import',
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import useLocalStorage from '@/hooks/useLocalStorage';",
          'export function useSymptoms(){ return useLocalStorage; }',
        ].join('\n'),
        'src/hooks/useLocalStorage.ts': 'export function useLocalStorage() {}',
      },
      assertDiagnostic: diagnostic => (
        diagnostic?.file === 'src/hooks/useSymptoms.ts'
        && diagnostic.import_path === '@/hooks/useLocalStorage'
        && diagnostic.expected === 'default export'
        && diagnostic.actual === 'named exports only'
      ),
      failureSummary: 'Import/export validator did not catch default import from named-only useLocalStorage.',
    },
    {
      id: 'missing-local-hook-file',
      expectOk: false,
      rootCauseType: 'missing_local_import',
      finalFiles: {
        'src/hooks/useSymptoms.ts': [
          "import { useMissingHook } from '@/hooks/useMissingHook';",
          'export function useSymptoms(){ return useMissingHook; }',
        ].join('\n'),
      },
      failureSummary: 'Import/export validator did not catch a missing local hook module.',
    },
    {
      id: 'missing-config-named-export',
      expectOk: false,
      rootCauseType: 'missing_named_export',
      finalFiles: {
        'src/data/seed.ts': [
          "import { API_ENDPOINT } from '@/config/app';",
          'export const endpoint = API_ENDPOINT;',
        ].join('\n'),
        'src/config/app.ts': 'export const APP_CONFIG = { name: "Demo" };',
      },
      failureSummary: 'Import/export validator did not catch a missing named export from a config module.',
    },
    {
      id: 'valid-component-import',
      expectOk: true,
      finalFiles: {
        'src/pages/Home.tsx': [
          "import { HabitCard } from '@/components/HabitCard';",
          'export function Home(){ return HabitCard(); }',
        ].join('\n'),
        'src/components/HabitCard.tsx': 'export function HabitCard(){ return null; }',
      },
      failureSummary: 'Valid component import failed import/export validation.',
    },
    {
      id: 'invalid-default-bottom-tabs',
      expectOk: false,
      rootCauseType: 'invalid_default_import',
      finalFiles: {
        'src/pages/Create.tsx': [
          "import BottomTabs from '@/components/BottomTabs';",
          'export default function Create(){ return BottomTabs(); }',
        ].join('\n'),
        'src/components/BottomTabs.tsx': 'export function BottomTabs(){ return null; }',
      },
      failureSummary: 'Import/export validator did not catch the BottomTabs default import mismatch.',
    },
    {
      id: 'missing-ui-primitive',
      expectOk: false,
      rootCauseType: 'missing_ui_primitive',
      finalFiles: {
        'src/pages/Profile.tsx': [
          "import { Avatar } from '@/components/ui/avatar';",
          'export function Profile(){ return Avatar(); }',
        ].join('\n'),
      },
      failureSummary: 'Import/export validator did not catch a missing UI primitive module.',
    },
  ];

  for (const sample of samples) {
    const result = validateImportExportContract({ finalFiles: sample.finalFiles });
    if (sample.expectOk && !result.ok) {
      return makeDiagnosticCheck('import-export-contract', 'Import/export contract', result.diagnostics, sample.failureSummary);
    }
    if (!sample.expectOk) {
      const diagnostic = result.diagnostics.find(item => item.root_cause_type === sample.rootCauseType);
      const diagnosticMatches = sample.assertDiagnostic ? sample.assertDiagnostic(diagnostic) : Boolean(diagnostic);
      if (result.ok || !diagnosticMatches) {
        return {
          id: 'import-export-contract',
          label: 'Import/export contract',
          status: 'fail',
          summary: sample.failureSummary,
          rootCauseType: 'not_testable',
          suggestedFix: 'Restore the import/export validator so local contract failures fail before Vite build.',
          evidence: {
            sample: sample.id,
            ok: result.ok,
            diagnostics: result.diagnostics,
          },
        };
      }
    }
  }

  return makePassCheck(
    'import-export-contract',
    'Import/export contract',
    `${samples.length} local import/export samples cover hooks, components, config/data modules, BottomTabs, and UI primitives before Vite runs.`,
    { sampleCount: samples.length },
  );
}

function runSharedHookContractCheck(): LiveReadinessPreflightCheck {
  const hookGraphs = buildSharedHookGraphsBySkeleton();
  const diagnostics: LiveGenerationContractDiagnostic[] = [];
  const inspected: Record<string, { present: boolean; importStyle?: 'named' | 'default' }> = {};
  const presentHooks = new Set<string>();

  for (const hookFiles of Object.values(hookGraphs)) {
    const baseResult = validateImportExportContract({ finalFiles: hookFiles });
    if (!baseResult.ok) {
      diagnostics.push(...baseResult.diagnostics);
      continue;
    }

    for (const hookName of COMMON_SHARED_HOOKS) {
      const hookPath = `src/hooks/${hookName}.ts`;
      const hookPathTsx = `src/hooks/${hookName}.tsx`;
      const sourcePath = hookFiles[hookPath] ? hookPath : hookFiles[hookPathTsx] ? hookPathTsx : null;
      const importStyle = SHARED_HOOK_IMPORT_CONTRACT[hookName];
      if (!sourcePath || !importStyle) continue;

      presentHooks.add(hookName);

      const probeFile = `src/__preflight__/${hookName}.tsx`;
      const importLine = importStyle === 'named'
        ? `import { ${hookName} } from '@/hooks/${hookName}';`
        : `import ${hookName} from '@/hooks/${hookName}';`;
      const result = validateImportExportContract({
        finalFiles: {
          ...hookFiles,
          [probeFile]: `${importLine}\nexport const contractProbe = ${hookName};`,
        },
      });
      if (!result.ok) {
        diagnostics.push(...result.diagnostics.filter(diagnostic => (
          diagnostic.file === probeFile ||
          diagnostic.file === sourcePath ||
          diagnostic.import_path === `@/hooks/${hookName}`
        )));
      }
    }
  }

  for (const hookName of COMMON_SHARED_HOOKS) {
    const importStyle = SHARED_HOOK_IMPORT_CONTRACT[hookName];
    inspected[hookName] = { present: presentHooks.has(hookName), importStyle };
  }

  if (diagnostics.length > 0) {
    return makeDiagnosticCheck(
      'shared-hook-contracts',
      'Shared hook contracts',
      diagnostics,
      'Shared hook import contract drift detected.',
    );
  }

  return makePassCheck(
    'shared-hook-contracts',
    'Shared hook contracts',
    'Common shared hooks use explicit named-import contracts before live generation.',
    inspected,
  );
}

function runProtectedShellCheck(): LiveReadinessPreflightCheck {
  const valid = validateProtectedShellBoundary({
    skeletonId: 'mobile-app',
    finalFiles: {
      'src/main.tsx': "import App from './App';\nexport default App;",
      'src/App.tsx': 'export default function App(){ return null; }',
      'src/pages/Home.tsx': 'export default function Home(){ return null; }',
    },
  });
  if (!valid.ok) {
    return makeDiagnosticCheck('protected-shell-boundary', 'Protected shell boundary', valid.diagnostics, 'Valid shell boundary sample failed.');
  }
  const invalid = validateProtectedShellBoundary({
    skeletonId: 'mobile-app',
    finalFiles: {
      'src/main.tsx': "import App from './App';\nexport default App;",
      'src/App.tsx': 'export default function App(){ return null; }',
      'src/components/BottomTabs.tsx': 'export default function BottomTabs(){ return null; }',
      'src/pages/Home.tsx': "import BottomTabs from '../components/BottomTabs';\nexport default function Home(){ return BottomTabs(); }",
    },
  });
  if (invalid.ok || !invalid.diagnostics.some(diagnostic => diagnostic.root_cause_type === 'protected_shell_import')) {
    return {
      id: 'protected-shell-boundary',
      label: 'Protected shell boundary',
      status: 'fail',
      summary: 'Protected shell validator did not reject a page-level shell import sample.',
      rootCauseType: 'not_testable',
      suggestedFix: 'Restore the protected shell boundary validator so pages cannot own root-shell components.',
    };
  }
  return makePassCheck(
    'protected-shell-boundary',
    'Protected shell boundary',
    'Page-level shell imports are rejected before live generation reaches preview compile.',
  );
}

function runCandidateGraphCheck(): LiveReadinessPreflightCheck {
  const valid = validateCandidateGraphContract({
    finalFiles: {
      'src/main.tsx': "import App from './App';\nexport default App;",
      'src/App.tsx': 'export default function App(){ return null; }',
      'src/pages/Home.tsx': 'export default function Home(){ return null; }',
    },
  });
  if (!valid.ok) {
    return makeDiagnosticCheck('candidate-graph-foundation', 'Candidate graph foundation', valid.diagnostics, 'Valid candidate graph sample failed.');
  }
  const invalid = validateCandidateGraphContract({
    finalFiles: {
      'src/main.tsx': "import App from './App';\nexport default App;",
      'src/pages/Home.tsx': 'export default function Home(){ return null; }',
    },
  });
  if (invalid.ok || !invalid.diagnostics.some(diagnostic => diagnostic.root_cause_type === 'missing_entry_file')) {
    return {
      id: 'candidate-graph-foundation',
      label: 'Candidate graph foundation',
      status: 'fail',
      summary: 'Candidate graph validator did not reject a graph missing src/App.tsx.',
      rootCauseType: 'not_testable',
      suggestedFix: 'Restore candidate graph validation so missing entry files fail before preview compile.',
    };
  }
  return makePassCheck(
    'candidate-graph-foundation',
    'Candidate graph foundation',
    'Entry-file and root-shell checks fail fast on incomplete candidate graphs.',
  );
}

function makePromptMismatchDiagnostic(
  workspaceFiles: readonly string[],
  overrides: Omit<LiveGenerationContractDiagnostic, 'candidate_graph_summary' | 'raw_error_excerpt'>,
): LiveGenerationContractDiagnostic {
  return {
    ...overrides,
    candidate_graph_summary: buildSummary(workspaceFiles),
    raw_error_excerpt: null,
  };
}

function runPromptCatalogTruthfulnessCheck(workspaceFiles: readonly string[]): LiveReadinessPreflightCheck {
  const skeletonUiNames = uniqueSkeletonUiPrimitiveNames();
  const missingCatalogEntries = skeletonUiNames.filter(name => !LIVE_GENERATION_UI_IMPORT_CATALOG[name]);
  const catalogAvailability = validateUiPrimitiveCatalogAvailability({
    advertisedPrimitives: Object.keys(LIVE_GENERATION_UI_IMPORT_CATALOG),
    workspaceFiles,
  });
  const promptBlock = buildLiveGenerationUiPrimitiveImportCatalog(skeletonUiNames);
  const missingPromptBlockEntries = skeletonUiNames.filter(name => {
    const line = LIVE_GENERATION_UI_IMPORT_CATALOG[name];
    return line ? !promptBlock.includes(line) : true;
  });
  const providedComponentGaps = findProvidedComponentGaps();

  if (missingCatalogEntries.length > 0 || catalogAvailability.length > 0 || missingPromptBlockEntries.length > 0 || providedComponentGaps.length > 0) {
    const diagnostics: LiveGenerationContractDiagnostic[] = [
      ...missingCatalogEntries.map(name => makePromptMismatchDiagnostic(workspaceFiles, {
        root_cause_type: 'prompt_catalog_mismatch',
        file: null,
        import_path: name,
        expected: 'Every skeleton-advertised UI primitive must have a canonical import catalog entry',
        actual: 'missing prompt-side import catalog entry',
        suggested_fix: `Add ${name} to the live generation UI import catalog or remove it from skeleton prompt metadata.`,
      })),
      ...catalogAvailability.map(diagnostic => ({
        ...diagnostic,
        root_cause_type: 'prompt_catalog_mismatch' as const,
      })),
      ...missingPromptBlockEntries.map(name => makePromptMismatchDiagnostic(workspaceFiles, {
        root_cause_type: 'prompt_catalog_mismatch',
        file: null,
        import_path: name,
        expected: 'Prompt builder must emit all live generation import hints advertised by skeleton metadata',
        actual: 'catalog entry exists but is missing from the built prompt block',
        suggested_fix: `Ensure buildLiveGenerationUiPrimitiveImportCatalog includes ${name} whenever the skeleton advertises it.`,
      })),
      ...providedComponentGaps.map(({ skeletonId, componentName }) => makePromptMismatchDiagnostic(workspaceFiles, {
        root_cause_type: 'prompt_catalog_mismatch',
        file: `skeletons/${skeletonId}/skeleton-${skeletonId}/src`,
        import_path: componentName,
        expected: 'Skeleton providedComponents must point to installed skeleton surfaces',
        actual: `${componentName} is advertised but no matching installed file basename exists`,
        suggested_fix: `Restore the ${componentName} surface in skeleton ${skeletonId} or remove the stale providedComponents entry.`,
      })),
    ];
    return makeDiagnosticCheck('prompt-catalog-truthfulness', 'Prompt catalog truthfulness', diagnostics, 'Prompt catalog drift detected.');
  }

  return makePassCheck(
    'prompt-catalog-truthfulness',
    'Prompt catalog truthfulness',
    `${skeletonUiNames.length} skeleton-advertised UI primitives and provided components stay truthful in the prompt catalog.`,
    { primitiveCount: skeletonUiNames.length },
  );
}

function runPremiumComponentHintCheck(): LiveReadinessPreflightCheck {
  const sampleModulePath = Object.keys(PREMIUM_COMPONENT_MODULES)[0] ?? null;
  const sampleSourcePath = sampleModulePath ? rawGlobPathToWorkspace(sampleModulePath) : null;
  if (!sampleSourcePath) {
    return makeWarningCheck(
      'premium-component-hints',
      'Premium component hints',
      'No premium component sources were discovered, so hint truthfulness could not be exercised.',
      'Restore at least one premium component source so deterministic hint materialization can be checked.',
    );
  }

  const result = materializePremiumComponents({
    premiumComponentSelection: {
      selectedRecipeId: 'quality-preflight',
      compatibleSkeletons: ['mobile-app'],
      selectedComponents: [{
        id: 'quality-preflight-component',
        name: 'Quality Preflight Sample',
        category: 'primitives',
        kind: 'component',
        source: 'quality-preflight',
        sourceLicense: 'internal',
        sourceCommitOrVersion: 'workspace',
        file: sampleSourcePath,
        previewAdapter: '',
        compatibleSkeletons: ['mobile-app'],
        mediaSlots: [],
        dependencyNotes: [],
        usageRules: [],
        forbiddenPatterns: [],
        renderSafe: true,
      }],
      componentSourceFiles: [sampleSourcePath],
      previewAdapterFiles: [],
      mediaSlots: [],
      dependencyNotes: [],
      usageRules: [],
      forbiddenPatterns: [],
    },
  } as unknown as Parameters<typeof materializePremiumComponents>[0]);
  const expectedFile = `design-pack/${sampleSourcePath.replace(/^prototype-bank\/design-packs\//, '')}`;
  const importHint = result.importHints[0];
  if (!result.files[expectedFile] || !importHint || importHint.sourcePath !== sampleSourcePath || !importHint.importPath.endsWith(expectedFile.replace(/\.[^.]+$/, ''))) {
    return {
      id: 'premium-component-hints',
      label: 'Premium component hints',
      status: 'fail',
      summary: 'Premium component materialization drifted away from the hinted source path.',
      rootCauseType: 'prompt_catalog_mismatch',
      suggestedFix: 'Keep premium component import hints derived from real prototype-bank component files.',
      evidence: {
        expectedFile,
        actualFiles: Object.keys(result.files),
        importHints: result.importHints,
      },
    };
  }

  return makePassCheck(
    'premium-component-hints',
    'Premium component hints',
    'Premium component import hints resolve from real prototype-bank component sources.',
    { sourcePath: sampleSourcePath },
  );
}

async function runLaunchFlowCheck(): Promise<LiveReadinessPreflightCheck> {
  const calls = {
    launchWithPlan: [] as Array<{ intent: string; source: string }>,
    messages: [] as string[],
    inputs: [] as string[],
    sendCount: 0,
  };

  await launchTrendIdeaBuild({
    idea: sampleTrendIdea(),
    blueprint: sampleBlueprint(),
    intent: 'Build a habit tracker with daily streaks and weekly summaries.',
    deps: {
      launchWithPlan: async (_plan, intent, source) => {
        calls.launchWithPlan.push({ intent, source });
      },
      addSystemMessage: message => {
        calls.messages.push(message);
      },
      setInput: value => {
        calls.inputs.push(value);
      },
      onSend: () => {
        calls.sendCount += 1;
      },
      scheduleSend: callback => {
        callback();
      },
    },
  });

  if (calls.launchWithPlan.length !== 1 || calls.launchWithPlan[0]?.source !== 'trend-niche' || calls.inputs.length !== 1 || calls.sendCount !== 1) {
    return {
      id: 'launch-flow-wiring',
      label: 'Launch flow wiring',
      status: 'fail',
      summary: 'Packaged trend idea launch no longer reaches launchWithPlan -> setInput -> onSend in order.',
      rootCauseType: 'launch_flow_not_wired',
      suggestedFix: 'Keep the trend-idea build path wired through launchWithPlan, then seed input, then trigger onSend.',
      evidence: calls,
    };
  }

  return makePassCheck(
    'launch-flow-wiring',
    'Launch flow wiring',
    'Build-now trend ideas still reach launchWithPlan, seed the composer, and trigger send.',
    calls,
  );
}

function runQualityControlsCheck(qualityControls: LiveReadinessQualityControlsContract): LiveReadinessPreflightCheck {
  const missing: string[] = [];
  if (!qualityControls.hasRunPreflightButton) missing.push('Run Preflight button missing');
  if (!qualityControls.isolatedFromRunAll) missing.push('Preflight is not isolated from Run All');
  if (!qualityControls.clearsPreflightState) missing.push('Clear does not reset preflight state');
  if (!qualityControls.reportIncludesPreflight) missing.push('Report export omits preflight results');

  if (missing.length > 0) {
    return {
      id: 'quality-controls-contract',
      label: 'Quality controls contract',
      status: 'fail',
      summary: missing.join(' · '),
      rootCauseType: 'quality_controls_unhealthy',
      suggestedFix: 'Keep preflight as a separate Quality control with clear/reset and report export integration.',
      evidence: { ...qualityControls },
    };
  }

  return makePassCheck(
    'quality-controls-contract',
    'Quality controls contract',
    'Quality Panel exposes a separate Run Preflight action, clears its state, and exports it in reports.',
    { ...qualityControls },
  );
}

export async function runLiveReadinessPreflight(
  input: RunLiveReadinessPreflightInput,
): Promise<LiveReadinessPreflightResult> {
  const workspaceFiles = buildCanonicalWorkspaceFiles();
  const runners: LiveReadinessCheckRunner[] = [
    {
      id: 'ui-primitive-catalog',
      run: async context => runUiPrimitiveCatalogCheck(context.workspaceFiles),
    },
    {
      id: 'import-export-contract',
      run: async () => runImportExportContractCheck(),
    },
    {
      id: 'shared-hook-contracts',
      run: async () => runSharedHookContractCheck(),
    },
    {
      id: 'protected-shell-boundary',
      run: async () => runProtectedShellCheck(),
    },
    {
      id: 'candidate-graph-foundation',
      run: async () => runCandidateGraphCheck(),
    },
    {
      id: 'prompt-catalog-truthfulness',
      run: async context => runPromptCatalogTruthfulnessCheck(context.workspaceFiles),
    },
    {
      id: 'premium-component-hints',
      run: async () => runPremiumComponentHintCheck(),
    },
    {
      id: 'launch-flow-wiring',
      run: async () => runLaunchFlowCheck(),
    },
    {
      id: 'quality-controls-contract',
      run: async context => runQualityControlsCheck(context.qualityControls),
    },
  ];

  const selectedIds = new Set(input.checkIds ?? runners.map(runner => runner.id));
  const context: LiveReadinessRunnerContext = {
    workspaceFiles,
    qualityControls: input.qualityControls,
  };
  const checks: LiveReadinessPreflightCheck[] = [];

  for (const runner of runners) {
    if (!selectedIds.has(runner.id)) continue;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const check = await runner.run(context);
    checks.push({
      ...check,
      checkedAt: startedAt,
      durationMs: Math.max(0, Date.now() - startedMs),
    });
  }

  const passCount = checks.filter(check => check.status === 'pass').length;
  const failCount = checks.filter(check => check.status === 'fail').length;
  const warningCount = checks.filter(check => check.status === 'warning').length;
  const status: LiveReadinessPreflightStatus = failCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass';

  return {
    status,
    checkedAt: new Date().toISOString(),
    passCount,
    failCount,
    warningCount,
    checks,
  };
}

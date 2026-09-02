import {
  pathMatchesSkeletonPattern,
  type SkeletonId,
} from '../services/SkeletonRegistry';
import { compileSkeletonContract, listSkeletonContractIds } from '../services/SkeletonContractCompiler';

const SKELETON_IDS = new Set<SkeletonId>(listSkeletonContractIds());

export const BLOCKED_PLACEHOLDER_PATTERNS = [
  'Test',
  'TODO',
  'Placeholder',
  'Coming soon',
  'Lorem ipsum',
  'Hello world',
  'Sample app',
  'Demo app',
] as const;

export const BLOCKED_GENERIC_FALLBACK_PATTERNS = [
  'data-preview-bootstrap="true"',
  'Studio ready',
  'Start your next project',
  'Describe your idea',
  'generated preview will appear here',
  'Welcome to Vite + React',
] as const;

export type OutputTruthBlockerCode =
  | 'placeholder-text'
  | 'generic-fallback'
  | 'home-bare-heading'
  | 'delta-too-small'
  | 'missing-output-structure'
  | 'missing-delta-structure'
  | 'architectural-richness'
  | 'placeholder-structure'
  | 'single-screen-monolith'
  | 'demo-test-structure'
  | 'missing-feature-interactions'
  | 'missing-feature-signals'
  | 'weak-screen-structure'
  | 'static-demo-surface'
  | 'skeleton-only-ui';

export type OutputStructureClassId =
  | 'root-shell'
  | 'pages-routes'
  | 'components'
  | 'hooks-state'
  | 'config-navigation'
  | 'data-layer'
  | 'styles-theme'
  | 'feature-modules';

export interface OutputTruthHit {
  code: OutputTruthBlockerCode;
  path: string;
  pattern: string;
}

export interface OutputTruthBlocker {
  code: OutputTruthBlockerCode;
  message: string;
  paths?: string[];
}

export interface OutputTruthInput {
  files: Record<string, string>;
  changedPaths?: string[];
  routeCount?: number;
  previewEntryFile?: string;
  skeletonId?: string | null;
  skeletonPaths?: string[];
  minMeaningfulChangedFiles?: number;
  minMeaningfulPageFiles?: number;
}

export interface OutputStructureBucket {
  id: OutputStructureClassId;
  label: string;
  meaning: string;
  totalCount: number;
  deltaCount: number;
  meaningfulDeltaCount: number;
  skeletonCount: number;
  modifiedCount: number;
  newCount: number;
  keyPaths: string[];
}

export interface OutputStructureContractSummary {
  skeletonId: string | null;
  mode: 'generic' | 'skeleton-aware';
  richness: 'rich' | 'adequate' | 'weak';
  summary: string;
  routeExpectation: 'single-route' | 'multi-route';
  minMeaningfulChangedFiles: number;
  minMeaningfulPageFiles: number;
  minDeltaCategoryCoverage: number;
  requiredOutputClasses: OutputStructureClassId[];
  requiredDeltaClasses: OutputStructureClassId[];
  missingOutputClasses: OutputStructureClassId[];
  missingDeltaClasses: OutputStructureClassId[];
  deltaCategoryCoverage: number;
  buckets: OutputStructureBucket[];
}

export interface OutputSkeletonDeltaSummary {
  skeletonFileCount: number;
  deltaFileCount: number;
  meaningfulDeltaCount: number;
  modifiedExistingCount: number;
  newFileCount: number;
  keySkeletonPaths: string[];
  keyDeltaPaths: string[];
  keyModifiedPaths: string[];
  keyNewPaths: string[];
  /** Normalized paths that were fed into the delta classifier (debug). */
  normalizedDeltaPaths: string[];
  /** Which delta paths matched each required structural class (debug). */
  bucketMatches: Partial<Record<OutputStructureClassId, string[]>>;
}

export interface OutputTruthResult {
  passed: boolean;
  blockers: OutputTruthBlocker[];
  placeholderHits: OutputTruthHit[];
  genericFallbackHits: OutputTruthHit[];
  meaningfulChangedFiles: string[];
  meaningfulSupportFiles: string[];
  meaningfulOutputFiles: string[];
  meaningfulPageFiles: string[];
  interactiveFiles: string[];
  featureFiles: string[];
  outputStructurePassed: boolean;
  deltaStructurePassed: boolean;
  architecturalRichnessPassed: boolean;
  placeholderStructureClean: boolean;
  structure: OutputStructureContractSummary;
  skeletonDelta: OutputSkeletonDeltaSummary;
}

export interface ArchitectPlanTruthInput {
  appName: string;
  skeleton: string;
  fileTree: Record<string, string>;
  summary?: string;
  contextContract?: string;
  dataModel?: string;
  pages?: Array<{ path?: string; name?: string; file?: string; purpose?: string }>;
  minDeltaFiles?: number;
  forbiddenPaths?: string[];
}

export interface ArchitectPlanTruthResult {
  passed: boolean;
  blockers: string[];
  pageFileCount: number;
  supportFileCount: number;
  fileCount: number;
}

const PLACEHOLDER_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: />\s*(?:test|todo|placeholder|coming soon|lorem ipsum|hello world)\s*</i, label: 'placeholder ui copy' },
  { pattern: /\b(?:TODO|Coming soon|Lorem ipsum|Hello world)\b/i, label: 'placeholder token' },
  { pattern: /(?:^|[\s{[(;:'"`])Placeholder(?!:)(?:$|[\s,.;:!?)}\]'\"])/i, label: 'placeholder token' },
  { pattern: /\bplaceholder\s*=\s*["'](?:placeholder|type here|enter text|enter value|search|search here|add item|new item)["']/i, label: 'generic input placeholder' },
  { pattern: /\bname\s*:\s*['\"]Test['\"]/i, label: 'test app name' },
  { pattern: /\bAPP_CONFIG\b[\s\S]{0,80}\bname\s*:\s*['\"]Test['\"]/i, label: 'test app config name' },
];

const GENERIC_FALLBACK_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /data-preview-bootstrap\s*=\s*["']true["']/i, label: 'preview bootstrap fallback' },
  { pattern: /studio ready/i, label: 'studio bootstrap copy' },
  { pattern: /start your next project/i, label: 'generic bootstrap headline' },
  { pattern: /describe your idea/i, label: 'generic bootstrap cta' },
  { pattern: /generated preview will appear here/i, label: 'preview bootstrap body' },
  { pattern: /welcome to vite \+ react/i, label: 'vite starter copy' },
];

const INTERACTION_SIGNAL_PATTERN = /<(?:button|Button|a|Link|input|Input|select|Select|textarea|form)\b|on(?:Click|Submit|Change|KeyDown)\s*=|useNavigate\(|navigate\(|router\.push\(/;
const FEATURE_SIGNAL_PATTERN = /\b(?:useState|useReducer|useMemo|useEffect|useContext|useApp|use[A-Z]\w+|map\(|filter\(|reduce\(|find\(|some\(|every\(|fetch\(|axios\.|localStorage|sessionStorage|queryClient|mutation|type\s+[A-Z]\w+|interface\s+[A-Z]\w+)\b/;
const STRUCTURE_SIGNAL_PATTERN = /<(?:main|section|article|nav|header|footer|aside|ul|ol|li|table|form|button|input|dialog|Card|Tabs|Sheet)\b/g;
const CONTENT_TEXT_PATTERN = />\s*[^<]{8,}\s*</g;
const STATIC_DEMO_PATTERN = /\b(?:chart|dashboard|metric|kpi|analytics|overview|summary|card|stats?)\b/i;
const EMPTY_STUB_PATTERN = /\breturn\s*(?:null|undefined|<>\s*<\/>|<div\s*\/>|<main\s*\/>|\(\s*<>\s*<\/>\s*\)|\(\s*<div\s*\/>\s*\)|\(\s*<main\s*\/>\s*\))/i;
const BARREL_ONLY_PATTERN = /^\s*(?:export\s+\*\s+from\s+['\"][^'\"]+['\"];?\s*|export\s+\{[^}]+\}\s+from\s+['\"][^'\"]+['\"];?\s*)+$/;
const DEMO_TEST_PATH_PATTERN = /\/(?:__tests__|tests?|demo|demos|fixtures|examples?|playground|storybook)\//i;
const DEMO_TEST_FILE_PATTERN = /(?:Demo|Test|Example|Fixture|Placeholder)\.(?:tsx?|jsx?|json)$/i;
const DESIGN_PACK_METADATA_PATH_PATTERN = /^src\/design-pack\/(?:selected-pack\.manifest\.json|domain\/[^/]+\/manifest\.json)$/i;
const ARCHITECT_INTERNAL_DOC_PATH_PATTERN = /^src\/docs\/architect\//i;

const STRUCTURE_BUCKET_DEFS: Array<{
  id: OutputStructureClassId;
  label: string;
  meaning: string;
  match: (path: string, previewEntryFile: string | null) => boolean;
}> = [
  {
    id: 'root-shell',
    label: 'Root shell',
    meaning: 'Boot entry and top-level app shell that wires the system together.',
    match: (path, previewEntryFile) => (
      path === previewEntryFile
      || /^src\/(?:App|main)\.(?:tsx?|jsx?)$/i.test(path)
      || /\/(?:RootLayout|RootShell|Shell|Layout)\.(?:tsx?|jsx?)$/i.test(path)
    ),
  },
  {
    id: 'pages-routes',
    label: 'Pages / routes',
    meaning: 'User-facing screens and routed product flows.',
    match: (path) => /\/(?:pages|screens|routes)\//i.test(path),
  },
  {
    id: 'components',
    label: 'Components',
    meaning: 'Reusable UI blocks beyond a single screen file.',
    match: (path) => /\/components\//i.test(path),
  },
  {
    id: 'hooks-state',
    label: 'Hooks / state',
    meaning: 'Hooks, state, store, or shared runtime context.',
    match: (path) => /\/(?:hooks|context|store|state)\//i.test(path),
  },
  {
    id: 'config-navigation',
    label: 'Config / navigation',
    meaning: 'Navigation maps, runtime config, and app wiring.',
    match: (path) => /\/config\//i.test(path) || /\/navigation\.(?:tsx?|jsx?|json)$/i.test(path),
  },
  {
    id: 'data-layer',
    label: 'Data / types',
    meaning: 'Types, entities, seed data, models, or data-source files.',
    match: (path) => (
      /\/(?:data|entities|models|types|api|services)\//i.test(path)
      || /\/(?:types|models|seed|schema|data-source)\.(?:tsx?|jsx?|json)$/i.test(path)
    ),
  },
  {
    id: 'styles-theme',
    label: 'Styles / theme',
    meaning: 'Theme tokens, global styles, or styling system files.',
    match: (path) => (
      /\/(?:styles|themes?)\//i.test(path)
      || /\/(?:index\.css|theme\.(?:ts|tsx|js|jsx)|tokens\.(?:ts|js|json))$/i.test(path)
    ),
  },
  {
    id: 'feature-modules',
    label: 'Feature modules',
    meaning: 'Feature-level modules/widgets/entities that split the product into slices.',
    match: (path) => /\/(?:features|modules|widgets|blocks|sections|entities)\//i.test(path),
  },
];

const REQUIRED_OUTPUT_STRUCTURE_CLASSES: OutputStructureClassId[] = [
  'root-shell',
  'pages-routes',
  'components',
  'hooks-state',
  'config-navigation',
  'data-layer',
  'styles-theme',
];

function asSkeletonId(value?: string | null): SkeletonId | null {
  if (!value) return null;
  return SKELETON_IDS.has(value as SkeletonId) ? value as SkeletonId : null;
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function getSkeletonPathPatterns(input: OutputTruthInput, skeletonId: SkeletonId | null): string[] {
  if (Array.isArray(input.skeletonPaths) && input.skeletonPaths.length > 0) {
    return uniquePaths(input.skeletonPaths.map(normalizeProjectPath));
  }
  if (!skeletonId) return [];
  return compileSkeletonContract(skeletonId).infrastructure.installed.map(normalizeProjectPath);
}

function getStructureClassesForPaths(paths: string[], previewEntryFile: string | null): OutputStructureClassId[] {
  return STRUCTURE_BUCKET_DEFS
    .filter((bucket) => paths.some((path) => bucket.match(path, previewEntryFile)))
    .map((bucket) => bucket.id);
}

function hasSkeletonBackedPath(path: string, skeletonPatterns: string[]): boolean {
  return skeletonPatterns.some((pattern) => pathMatchesSkeletonPattern(path, pattern));
}

function countMatchingPaths(paths: string[], matcher: (path: string) => boolean): number {
  return paths.filter(matcher).length;
}

function normalizeProjectPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  return normalized.startsWith('src/') ? normalized : `src/${normalized}`;
}

function matchRuleHits(
  files: Record<string, string>,
  paths: string[],
  rules: Array<{ pattern: RegExp; label: string }>,
  code: OutputTruthBlockerCode,
): OutputTruthHit[] {
  const hits: OutputTruthHit[] = [];
  for (const path of paths) {
    // UI primitives and internal architecture documents are not user-facing product copy.
    if (/components[\\/]ui[\\/]/.test(path) || ARCHITECT_INTERNAL_DOC_PATH_PATTERN.test(path)) continue;
    const content = files[path] ?? '';
    for (const rule of rules) {
      if (rule.pattern.test(content)) {
        hits.push({ code, path, pattern: rule.label });
      }
    }
  }
  return hits;
}

function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function isPageLikePath(path: string): boolean {
  return /\/(?:pages|screens)\//.test(path) || /\/App\.tsx$/i.test(path) || /\/Home\.tsx$/i.test(path);
}

function isSupportFeaturePath(path: string): boolean {
  return /\/(?:components|hooks|data|services|config|context|features|modules|widgets|blocks|sections|entities)\//.test(path);
}

function isMeaningfulFile(path: string, content: string): boolean {
  const trimmed = content.trim();
  if (!/\.(?:tsx?|jsx?|css|json)$/i.test(path)) return false;
  if (trimmed.length < 40) return false;
  if (BARREL_ONLY_PATTERN.test(trimmed)) return false;
  if (EMPTY_STUB_PATTERN.test(trimmed)) return false;

  const structureCount = countMatches(trimmed, STRUCTURE_SIGNAL_PATTERN);
  const textBlockCount = countMatches(trimmed, CONTENT_TEXT_PATTERN);

  return (
    trimmed.length >= 120
    || FEATURE_SIGNAL_PATTERN.test(trimmed)
    || INTERACTION_SIGNAL_PATTERN.test(trimmed)
    || structureCount >= 3
    || textBlockCount >= 3
  );
}

function isDesignPackMetadataPath(path: string): boolean {
  return DESIGN_PACK_METADATA_PATH_PATTERN.test(path);
}

function isBareHeadingHome(content: string): boolean {
  const compact = content.replace(/\s+/g, ' ').trim();
  const hasSingleHeading = /<h1\b[^>]*>[^<]{1,80}<\/h1>/i.test(compact);
  const interactive = INTERACTION_SIGNAL_PATTERN.test(compact);
  const structureCount = countMatches(compact, STRUCTURE_SIGNAL_PATTERN);
  const contentTextCount = countMatches(compact, CONTENT_TEXT_PATTERN);

  return hasSingleHeading && !interactive && structureCount <= 4 && contentTextCount <= 2 && compact.length < 420;
}

function pushBlocker(
  target: OutputTruthBlocker[],
  code: OutputTruthBlockerCode,
  message: string,
  paths?: string[],
): void {
  if (target.some((entry) => entry.code === code)) return;
  target.push({ code, message, ...(paths && paths.length > 0 ? { paths } : {}) });
}

export function analyzeOutputTruth(input: OutputTruthInput): OutputTruthResult {
  const files = Object.fromEntries(
    Object.entries(input.files).map(([path, content]) => [normalizeProjectPath(path), content]),
  );
  const skeletonId = asSkeletonId(input.skeletonId);
  const previewEntryFile = input.previewEntryFile ? normalizeProjectPath(input.previewEntryFile) : null;
  const changedPaths = (input.changedPaths ?? Object.keys(files))
    .map(normalizeProjectPath)
    .filter((path) => typeof files[path] === 'string');
  const uniqueChangedPaths = Array.from(new Set(changedPaths));
  const skeletonPatterns = getSkeletonPathPatterns(input, skeletonId);
  // include skeleton patterns (files provided by skeleton) in allPaths so that root-shell validation passes if skeleton has it
  const allPaths = Array.from(new Set([
    ...Object.keys(files),
    ...skeletonPatterns
  ]));
  const skeletonBackedPaths = allPaths.filter((path) => hasSkeletonBackedPath(path, skeletonPatterns));
  const modifiedExistingFiles = uniqueChangedPaths.filter((path) => hasSkeletonBackedPath(path, skeletonPatterns));
  const newFiles = uniqueChangedPaths.filter((path) => !hasSkeletonBackedPath(path, skeletonPatterns));
  const meaningfulOutputFiles = allPaths.filter((path) => isMeaningfulFile(path, files[path] ?? ''));
  const meaningfulChangedFiles = uniqueChangedPaths.filter((path) => isMeaningfulFile(path, files[path] ?? ''));
  const meaningfulSupportFiles = meaningfulChangedFiles.filter((path) => !isPageLikePath(path));
  const meaningfulPageFiles = meaningfulChangedFiles.filter((path) => isPageLikePath(path));
  const interactiveFiles = uniqueChangedPaths.filter((path) => INTERACTION_SIGNAL_PATTERN.test(files[path] ?? ''));
  const featureFiles = uniqueChangedPaths.filter((path) => FEATURE_SIGNAL_PATTERN.test(files[path] ?? ''));
  const placeholderHits = matchRuleHits(files, uniqueChangedPaths, PLACEHOLDER_RULES, 'placeholder-text')
    .filter((hit) => !isDesignPackMetadataPath(hit.path));
  const genericFallbackHits = matchRuleHits(files, uniqueChangedPaths, GENERIC_FALLBACK_RULES, 'generic-fallback');
  const blockers: OutputTruthBlocker[] = [];
  const skeletonProductSlots = skeletonId
    ? compileSkeletonContract(skeletonId).requiredSlots.map(normalizeProjectPath)
    : [];
  const skeletonDeltaClasses = skeletonId
    ? getStructureClassesForPaths(skeletonProductSlots, previewEntryFile)
        .filter((id) => id !== 'root-shell' && id !== 'styles-theme')
    : [];
  const fallbackDeltaClasses: OutputStructureClassId[] = (input.routeCount ?? 0) >= 2
    ? ['pages-routes', 'hooks-state', 'data-layer']
    : ['pages-routes', 'data-layer'];
  const requiredDeltaClasses = uniquePaths(
    (skeletonDeltaClasses.length > 0 ? skeletonDeltaClasses : fallbackDeltaClasses)
      .filter((id) => id !== 'feature-modules'),
  ) as OutputStructureClassId[];
  const minMeaningfulChangedFiles = input.minMeaningfulChangedFiles ?? (
    skeletonId
      ? Math.max(4, Math.min(6, Math.ceil(skeletonProductSlots.length * 0.4)))
      : 3
  );
  const minMeaningfulPageFiles = input.minMeaningfulPageFiles ?? (() => {
    const skeletonPageCount = skeletonId
      ? countMatchingPaths(skeletonProductSlots, (path) => isPageLikePath(normalizeProjectPath(path)))
      : 0;
    const routeBasedMinimum = (input.routeCount ?? 0) >= 2 ? 2 : 1;
    return skeletonPageCount >= 4 ? Math.max(2, routeBasedMinimum) : routeBasedMinimum;
  })();
  const buckets = STRUCTURE_BUCKET_DEFS.map<OutputStructureBucket>((bucket) => {
    const bucketAllPaths = allPaths.filter((path) => bucket.match(path, previewEntryFile));
    const bucketDeltaPaths = uniqueChangedPaths.filter((path) => bucket.match(path, previewEntryFile));
    const bucketSkeletonPaths = skeletonBackedPaths.filter((path) => bucket.match(path, previewEntryFile));
    const bucketModifiedPaths = modifiedExistingFiles.filter((path) => bucket.match(path, previewEntryFile));
    const bucketNewPaths = newFiles.filter((path) => bucket.match(path, previewEntryFile));
    return {
      id: bucket.id,
      label: bucket.label,
      meaning: bucket.meaning,
      totalCount: bucketAllPaths.length,
      deltaCount: bucketDeltaPaths.length,
      meaningfulDeltaCount: bucketDeltaPaths.filter((path) => meaningfulChangedFiles.includes(path)).length,
      skeletonCount: bucketSkeletonPaths.length,
      modifiedCount: bucketModifiedPaths.length,
      newCount: bucketNewPaths.length,
      keyPaths: bucketDeltaPaths.length > 0 ? bucketDeltaPaths.slice(0, 4) : bucketAllPaths.slice(0, 4),
    };
  });
  const missingOutputClasses = REQUIRED_OUTPUT_STRUCTURE_CLASSES.filter((id) =>
    !(buckets.find((bucket) => bucket.id === id)?.totalCount),
  );
  const missingDeltaClasses = requiredDeltaClasses.filter((id) =>
    !(buckets.find((bucket) => bucket.id === id)?.meaningfulDeltaCount),
  );
  const deltaCategoryCoverage = requiredDeltaClasses.filter((id) =>
    (buckets.find((bucket) => bucket.id === id)?.meaningfulDeltaCount ?? 0) > 0,
  ).length;
  // Allow 1 missing class when the skeleton has ≥ 4 required classes and the
  // missing class is the optional "config-navigation" wiring layer — commonly
  // omitted when the AI inlines navigation directly in App.tsx.
  const allowedMissingDeltaClasses = (
    requiredDeltaClasses.length >= 4 &&
    missingDeltaClasses.length === 1 &&
    missingDeltaClasses[0] === 'config-navigation'
  ) ? 1 : 0;
  const minDeltaCategoryCoverage = requiredDeltaClasses.length > 0
    ? requiredDeltaClasses.length - allowedMissingDeltaClasses
    : ((input.routeCount ?? 0) >= 2 ? 3 : 2);
  const totalMeaningfulPageFiles = meaningfulOutputFiles.filter((path) => isPageLikePath(path));
  const meaningfulSupportClassCoverage = buckets.filter((bucket) =>
    ['components', 'hooks-state', 'config-navigation', 'data-layer', 'feature-modules'].includes(bucket.id)
    && bucket.meaningfulDeltaCount > 0
  ).length;
  const outputStructurePassed = missingOutputClasses.length === 0;
  const effectiveMissingDeltaClasses = missingDeltaClasses.filter((id) =>
    !(allowedMissingDeltaClasses > 0 && id === 'config-navigation'),
  );
  const deltaStructurePassed = deltaCategoryCoverage >= minDeltaCategoryCoverage && effectiveMissingDeltaClasses.length === 0;
  const placeholderStructureClean = meaningfulChangedFiles.length > 2
    && !uniqueChangedPaths.every((path) => DEMO_TEST_PATH_PATTERN.test(path) || DEMO_TEST_FILE_PATTERN.test(path));
  const architecturalRichnessPassed = (
    meaningfulChangedFiles.length >= minMeaningfulChangedFiles
    && meaningfulPageFiles.length >= minMeaningfulPageFiles
    && totalMeaningfulPageFiles.length >= minMeaningfulPageFiles
    && meaningfulSupportFiles.length >= 2
    && meaningfulSupportClassCoverage >= 2
    && ((input.routeCount ?? 0) < 2 || meaningfulPageFiles.length >= 2 || totalMeaningfulPageFiles.length >= 2)
  );
  const richness: OutputStructureContractSummary['richness'] =
    outputStructurePassed && deltaStructurePassed && architecturalRichnessPassed && placeholderStructureClean
      ? 'rich'
      : outputStructurePassed && (deltaCategoryCoverage >= Math.max(1, minDeltaCategoryCoverage - 1))
        ? 'adequate'
        : 'weak';
  const structure: OutputStructureContractSummary = {
    skeletonId,
    mode: skeletonId ? 'skeleton-aware' : 'generic',
    richness,
    summary: (
      richness === 'rich'
        ? `Rich output: ${buckets.filter((bucket) => bucket.totalCount > 0).length} structural classes present, delta covers ${deltaCategoryCoverage}/${minDeltaCategoryCoverage} expected classes.`
        : `Weak output: ${buckets.filter((bucket) => bucket.totalCount > 0).length} structural classes present, delta covers ${deltaCategoryCoverage}/${minDeltaCategoryCoverage} expected classes.`
    ),
    routeExpectation: (input.routeCount ?? 0) >= 2 ? 'multi-route' : 'single-route',
    minMeaningfulChangedFiles,
    minMeaningfulPageFiles,
    minDeltaCategoryCoverage,
    requiredOutputClasses: REQUIRED_OUTPUT_STRUCTURE_CLASSES,
    requiredDeltaClasses,
    missingOutputClasses,
    missingDeltaClasses,
    deltaCategoryCoverage,
    buckets,
  };
  const requiredBucketMatches: Partial<Record<OutputStructureClassId, string[]>> = {};
  for (const id of requiredDeltaClasses) {
    const bucket = buckets.find((b) => b.id === id);
    requiredBucketMatches[id] = bucket?.keyPaths.filter((p) => uniqueChangedPaths.includes(p)) ?? [];
  }
  const skeletonDelta: OutputSkeletonDeltaSummary = {
    skeletonFileCount: skeletonBackedPaths.length,
    deltaFileCount: uniqueChangedPaths.length,
    meaningfulDeltaCount: meaningfulChangedFiles.length,
    modifiedExistingCount: modifiedExistingFiles.length,
    newFileCount: newFiles.length,
    keySkeletonPaths: skeletonBackedPaths.slice(0, 8),
    keyDeltaPaths: meaningfulChangedFiles.length > 0 ? meaningfulChangedFiles.slice(0, 8) : uniqueChangedPaths.slice(0, 8),
    keyModifiedPaths: modifiedExistingFiles.slice(0, 8),
    keyNewPaths: newFiles.slice(0, 8),
    normalizedDeltaPaths: uniqueChangedPaths,
    bucketMatches: requiredBucketMatches,
  };

  if (placeholderHits.length > 0) {
    pushBlocker(
      blockers,
      'placeholder-text',
      'Placeholder-like copy is present in the generated output.',
      Array.from(new Set(placeholderHits.map((hit) => hit.path))),
    );
  }

  if (genericFallbackHits.length > 0) {
    pushBlocker(
      blockers,
      'generic-fallback',
      'Generic fallback/bootstrap preview patterns are still present.',
      Array.from(new Set(genericFallbackHits.map((hit) => hit.path))),
    );
  }

  const homePath = uniqueChangedPaths.find((path) => /\/Home\.tsx$/i.test(path));
  if (homePath && isBareHeadingHome(files[homePath] ?? '')) {
    pushBlocker(
      blockers,
      'home-bare-heading',
      'Home screen is still a bare heading instead of a real feature screen.',
      [homePath],
    );
  }

  if (meaningfulChangedFiles.length < minMeaningfulChangedFiles) {
    pushBlocker(
      blockers,
      'delta-too-small',
      `Real delta is too small: ${meaningfulChangedFiles.length} meaningful changed file(s) (need >= ${minMeaningfulChangedFiles}).`,
      meaningfulChangedFiles,
    );
  }

  if (!outputStructurePassed) {
    pushBlocker(
      blockers,
      'missing-output-structure',
      `Output structure is too thin: missing ${missingOutputClasses.join(', ')}.`,
      buckets
        .filter((bucket) => missingOutputClasses.includes(bucket.id))
        .flatMap((bucket) => bucket.keyPaths),
    );
  }

  if (!deltaStructurePassed) {
    pushBlocker(
      blockers,
      'missing-delta-structure',
      `Meaningful delta is missing skeleton-expected structure: ${effectiveMissingDeltaClasses.join(', ')}.`,
      buckets
        .filter((bucket) => effectiveMissingDeltaClasses.includes(bucket.id))
        .flatMap((bucket) => bucket.keyPaths.length > 0 ? bucket.keyPaths : skeletonDelta.keyDeltaPaths),
    );
  }

  if (meaningfulPageFiles.length < minMeaningfulPageFiles) {
    pushBlocker(
      blockers,
      'weak-screen-structure',
      `Preview proof failed: only ${meaningfulPageFiles.length} meaningful screen file(s) changed (need >= ${minMeaningfulPageFiles}).`,
      meaningfulPageFiles,
    );
  }

  if (interactiveFiles.length === 0) {
    pushBlocker(
      blockers,
      'missing-feature-interactions',
      'Preview proof failed: no working feature interactions were detected in the changed UI.',
    );
  }

  if (featureFiles.length < 2) {
    pushBlocker(
      blockers,
      'missing-feature-signals',
      'Changed files still look cosmetic or static; feature-level state/data logic is missing.',
      featureFiles,
    );
  }

  if (meaningfulChangedFiles.length <= 2) {
    pushBlocker(
      blockers,
      'placeholder-structure',
      'Placeholder-like structure detected: only 1–2 meaningful product files exist in the delta.',
      meaningfulChangedFiles,
    );
  }

  if (uniqueChangedPaths.length > 0 && uniqueChangedPaths.every((path) => DEMO_TEST_PATH_PATTERN.test(path) || DEMO_TEST_FILE_PATTERN.test(path))) {
    pushBlocker(
      blockers,
      'demo-test-structure',
      'Delta only touches demo/test/placeholder structure, not product architecture.',
      uniqueChangedPaths,
    );
  }

  if (homePath && meaningfulChangedFiles.length <= 2 && meaningfulSupportFiles.length === 0) {
    pushBlocker(
      blockers,
      'single-screen-monolith',
      'Output still collapses into a single Home screen without supporting modules, data, or config split.',
      [homePath],
    );
  }

  if (!architecturalRichnessPassed) {
    pushBlocker(
      blockers,
      'architectural-richness',
      'Architectural richness gate failed: output still lacks enough page/support/module separation to prove a real product system.',
      skeletonDelta.keyDeltaPaths,
    );
  }

  const staticDemoFiles = meaningfulPageFiles.filter((path) => {
    const content = files[path] ?? '';
    return STATIC_DEMO_PATTERN.test(content) && !INTERACTION_SIGNAL_PATTERN.test(content);
  });
  if (staticDemoFiles.length > 0 && interactiveFiles.length === 0) {
    pushBlocker(
      blockers,
      'static-demo-surface',
      'Preview still looks like a dead static chart/card demo instead of a working product surface.',
      staticDemoFiles,
    );
  }

  if (
    meaningfulPageFiles.length === 0
    || (meaningfulChangedFiles.length < minMeaningfulChangedFiles && meaningfulPageFiles.length < minMeaningfulPageFiles)
    || (meaningfulPageFiles.length === 0 && !uniqueChangedPaths.some((path) => isSupportFeaturePath(path)))
  ) {
    pushBlocker(
      blockers,
      'skeleton-only-ui',
      'Preview still looks like untouched skeleton UI; a non-trivial product delta is missing.',
      uniqueChangedPaths,
    );
  }

  return {
    passed: blockers.length === 0,
    blockers,
    placeholderHits,
    genericFallbackHits,
    meaningfulChangedFiles,
    meaningfulSupportFiles,
    meaningfulOutputFiles,
    meaningfulPageFiles,
    interactiveFiles,
    featureFiles,
    outputStructurePassed,
    deltaStructurePassed,
    architecturalRichnessPassed,
    placeholderStructureClean,
    structure,
    skeletonDelta,
  };
}

export function analyzeArchitectPlanTruth(input: ArchitectPlanTruthInput): ArchitectPlanTruthResult {
  const fileTree = Object.fromEntries(
    Object.entries(input.fileTree).map(([path, purpose]) => [normalizeProjectPath(path), purpose]),
  );
  const filePaths = Object.keys(fileTree);
  const forbiddenPaths = new Set((input.forbiddenPaths ?? []).map(normalizeProjectPath));
  const pageFileCount = filePaths.filter((path) => isPageLikePath(path)).length;
  const supportFileCount = filePaths.filter((path) => isSupportFeaturePath(path)).length;
  const fileCount = filePaths.length;
  const blockers: string[] = [];
  const minDeltaFiles = input.minDeltaFiles ?? 5;

  if (!input.skeleton.trim()) {
    blockers.push('Architect output is missing skeleton id.');
  }

  if (fileCount < minDeltaFiles) {
    blockers.push(`Architect fileTree is too small: ${fileCount} file(s) (need >= ${minDeltaFiles}).`);
  }

  const invalidPaths = filePaths.filter((path) => !/^src\/[\w./-]+\.(?:tsx?|jsx?|css|json)$/i.test(path));
  if (invalidPaths.length > 0) {
    blockers.push(`Architect fileTree contains invalid paths: ${invalidPaths.join(', ')}.`);
  }

  const forbiddenMatches = filePaths.filter((path) => forbiddenPaths.has(path) || /^src\/components\/ui\//.test(path));
  if (forbiddenMatches.length > 0) {
    blockers.push(`Architect fileTree still references skeleton-locked files: ${forbiddenMatches.join(', ')}.`);
  }

  if (pageFileCount < 2 || supportFileCount < 1) {
    blockers.push('Architect plan is not skeleton-aware enough: need multiple real screens plus supporting product files.');
  }

  if (!input.contextContract?.trim() && !input.dataModel?.trim() && !(input.pages?.length)) {
    blockers.push('Architect plan is too shallow: missing context contract, data model, or routed page mapping.');
  }

  const planTextEntries = [
    input.appName,
    input.summary ?? '',
    input.contextContract ?? '',
    input.dataModel ?? '',
    ...Object.entries(fileTree).flatMap(([path, purpose]) => [path, purpose]),
  ];
  const placeholderLike = planTextEntries.some((entry) =>
    PLACEHOLDER_RULES.some((rule) => rule.pattern.test(entry)) || GENERIC_FALLBACK_RULES.some((rule) => rule.pattern.test(entry)),
  );
  if (placeholderLike) {
    blockers.push('Architect plan still contains placeholder or generic fallback language.');
  }

  const thinPurposes = Object.entries(fileTree)
    .filter(([, purpose]) => purpose.trim().length < 24)
    .map(([path]) => path);
  if (thinPurposes.length > 0) {
    blockers.push(`Architect fileTree purposes are too thin for real planning: ${thinPurposes.join(', ')}.`);
  }

  return {
    passed: blockers.length === 0,
    blockers,
    pageFileCount,
    supportFileCount,
    fileCount,
  };
}

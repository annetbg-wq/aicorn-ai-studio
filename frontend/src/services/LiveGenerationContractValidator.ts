import { isProtectedSkeletonFile, type SkeletonId } from './SkeletonRegistry';
import { compileSkeletonContract } from './SkeletonContractCompiler';
import { getProductDeltaScope } from './ProductDeltaContract';
import {
  LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
  LIVE_GENERATION_UI_IMPORT_CATALOG,
  buildLiveGenerationUiPrimitiveImportCatalog,
  canonicalUiPrimitiveId,
  filterAdvertisedUiPrimitiveNames,
  toPascalCaseUiPrimitiveName,
  type CanonicalUiPrimitive,
  uiPrimitiveWorkspaceCandidates,
} from './LiveGenerationUiPrimitives';

export {
  LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
  LIVE_GENERATION_UI_IMPORT_CATALOG,
  buildLiveGenerationUiPrimitiveImportCatalog,
  filterAdvertisedUiPrimitiveNames,
} from './LiveGenerationUiPrimitives';

export type LiveGenerationRootCauseType =
  | 'missing_ui_primitive'
  | 'missing_local_import'
  | 'missing_required_manifest_file'
  | 'invalid_default_import'
  | 'missing_named_export'
  | 'protected_shell_import'
  | 'missing_entry_file'
  | 'missing_root_shell'
  | 'thin_output'
  | 'prompt_catalog_mismatch'
  | 'launch_flow_not_wired'
  | 'quality_controls_unhealthy'
  | 'not_testable'
  | 'vite_build_error';

export interface CandidateGraphSummary {
  totalFiles: number;
  sourceModuleCount: number;
  pageFileCount: number;
  meaningfulSourceCount: number;
  generatedDeltaCount: number;
  materializedFileCount: number;
  skeletonFileCount: number;
  hasMain: boolean;
  hasApp: boolean;
  hasRouteManifest: boolean;
  shellOwnerFiles: string[];
}

export interface LiveGenerationContractDiagnostic {
  root_cause_type: LiveGenerationRootCauseType;
  file: string | null;
  import_path: string | null;
  expected: string | null;
  actual: string | null;
  suggested_fix: string;
  candidate_graph_summary: CandidateGraphSummary;
  raw_error_excerpt: string | null;
}

export interface LiveGenerationContractValidationResult {
  ok: boolean;
  diagnostics: LiveGenerationContractDiagnostic[];
  candidateGraphSummary: CandidateGraphSummary;
}

export interface LiveGenerationContractValidationInput {
  finalFiles: Record<string, string>;
  skeletonId?: SkeletonId;
  generatedDeltaFiles?: Record<string, string>;
  materializedFiles?: Record<string, string>;
  requiredLocalFiles?: readonly string[];
  rawErrorExcerpt?: string;
}

export interface UiPrimitiveCatalogValidationInput {
  advertisedPrimitives: readonly string[];
  workspaceFiles: readonly string[];
  rawErrorExcerpt?: string;
}

interface ParsedImport {
  importer: string;
  specifier: string;
  defaultImport: string | null;
  namedImports: string[];
  namespaceImport: string | null;
  typeOnly: boolean;
}

interface ModuleExportInfo {
  hasDefault: boolean;
  namedExports: Set<string>;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;
const LOCAL_GRAPH_EXTENSIONS = [...SOURCE_EXTENSIONS, '.css', '.json'] as const;

/**
 * Import specifiers for non-code assets (images / fonts / media) that Vite resolves
 * from disk as URL strings — they are NOT text modules in the candidate graph, so the
 * import/export contract must not treat them as missing local modules. Their on-disk
 * presence is ensured by media/placeholder materialization; Vite reports any that are
 * genuinely absent. (.css and .json ARE collected into the graph and remain checked.)
 */
const NON_GRAPH_ASSET_IMPORT_RE =
  /\.(?:svg|png|jpe?g|webp|gif|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav)(?:\?[^'"`]*)?$/i;
function isNonGraphAssetSpecifier(specifier: string): boolean {
  return NON_GRAPH_ASSET_IMPORT_RE.test(specifier.trim());
}

const ROOT_SHELL_OWNERS = ['src/App.tsx', 'src/components/AppShell.tsx', 'src/components/DashboardShell.tsx'];

const PROTECTED_SHELL_COMPONENTS_BY_SKELETON: Partial<Record<SkeletonId, readonly string[]>> = {
  'mobile-app': ['BottomTabs', 'AppShell', 'NavigationShell'],
  'super-app': ['BottomTabs', 'AppShell', 'NavigationShell'],
  'b2b-operations-workspace': ['Sidebar', 'TopBar', 'Topbar', 'DashboardShell', 'AppShell'],
  'creator-editor-workspace': ['Sidebar', 'TopBar', 'Topbar', 'DashboardShell', 'AppShell'],
  ecommerce: ['BottomTabs', 'AppShell', 'NavigationShell'],
  'productivity-tool': ['Sidebar', 'TopBar', 'Topbar', 'DashboardShell', 'AppShell'],
  'saas-dashboard': ['Sidebar', 'TopBar', 'Topbar', 'DashboardShell', 'AppShell'],
};

const GLOBAL_PROTECTED_SHELL_COMPONENTS = new Set([
  'AppShell',
  'BottomTabs',
  'DashboardShell',
  'NavigationShell',
  'Sidebar',
  'TopBar',
  'Topbar',
]);

const SHELL_CONTRACT_PATHS = new Set([
  'src/config/navigation.ts',
  'src/config/routes.ts',
  'src/route-manifest.json',
]);

const DISALLOWED_REACT_ROUTER_IMPORTS = new Set([
  'BrowserRouter',
  'HashRouter',
  'Navigate',
  'Outlet',
  'Route',
  'RouterProvider',
  'Routes',
  'createBrowserRouter',
  'createHashRouter',
  'createMemoryRouter',
  'createRoutesFromChildren',
  'createRoutesFromElements',
  'useRoutes',
]);

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function trimSourcePrefix(value: string): string {
  return normalizeSlashes(value).replace(/^\.\//, '').replace(/^\//, '').replace(/^src\//i, '');
}

function normalizeCandidatePath(value: string): string {
  const trimmed = trimSourcePrefix(value);
  return trimmed ? `src/${trimmed}` : 'src';
}

function normalizeWorkspacePath(value: string): string {
  return normalizeSlashes(value).replace(/^\.\//, '').replace(/^\//, '');
}

function isSourceModule(path: string): boolean {
  const normalized = normalizeCandidatePath(path).toLowerCase();
  return SOURCE_EXTENSIONS.some(ext => normalized.endsWith(ext));
}

function directoryOf(path: string): string {
  const normalized = normalizeCandidatePath(path);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? 'src' : normalized.slice(0, idx);
}

function joinPath(base: string, segment: string): string {
  const parts = `${base}/${segment}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values))).sort((left, right) => left.localeCompare(right));
}

function resolveRequiredDataContractFiles(skeletonId: SkeletonId): string[] {
  const contract = compileSkeletonContract(skeletonId);
  const candidates = [
    ...contract.infrastructure.installed,
    ...contract.requiredSlots,
    ...contract.optionalSlots,
    ...contract.editable,
  ];
  return uniqueSorted(candidates.filter(file => (
    file === 'src/data/seed.ts' || file === 'src/data/types.ts'
  )));
}

function normalizeGraph(files: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(files ?? {})) {
    out[normalizeCandidatePath(filePath)] = content;
  }
  return out;
}

function meaningfulSourceFiles(files: Record<string, string>): string[] {
  return Object.keys(files).filter(filePath => {
    if (!isSourceModule(filePath)) return false;
    if (filePath.startsWith('src/assets/generated/')) return false;
    if (filePath.startsWith('src/design-pack/')) return false;
    if (filePath.startsWith('src/components/ui/')) return false;
    return true;
  });
}

function pageFiles(files: Record<string, string>): string[] {
  return Object.keys(files).filter(filePath => /^src\/pages\/[^/]+\.(?:tsx?|jsx?)$/i.test(filePath));
}

function resolveRouteManifestExpectation(skeletonId?: SkeletonId): boolean {
  if (!skeletonId) return false;
  return compileSkeletonContract(skeletonId).infrastructure.installed.includes('src/route-manifest.json');
}

function resolveShellOwnerFiles(files: Record<string, string>, skeletonId?: SkeletonId): string[] {
  const protectedNames = getProtectedShellComponents(skeletonId);
  const shellFiles = Object.keys(files).filter(filePath => {
    if (ROOT_SHELL_OWNERS.includes(filePath)) return true;
    const name = filePath.split('/').pop()?.replace(/\.(?:tsx?|jsx?)$/i, '') ?? '';
    return protectedNames.has(name);
  });
  return uniqueSorted(shellFiles);
}

function buildCandidateGraphSummary(input: LiveGenerationContractValidationInput): CandidateGraphSummary {
  const finalFiles = normalizeGraph(input.finalFiles);
  const skeletonFiles = new Set(
    input.skeletonId
      ? compileSkeletonContract(input.skeletonId).infrastructure.installed.map(path => normalizeCandidatePath(path))
      : [],
  );
  const generatedFiles = new Set(Object.keys(normalizeGraph(input.generatedDeltaFiles)));
  const materializedFiles = new Set(Object.keys(normalizeGraph(input.materializedFiles)));
  const shellOwnerFiles = resolveShellOwnerFiles(finalFiles, input.skeletonId);

  return {
    totalFiles: Object.keys(finalFiles).length,
    sourceModuleCount: Object.keys(finalFiles).filter(isSourceModule).length,
    pageFileCount: pageFiles(finalFiles).length,
    meaningfulSourceCount: meaningfulSourceFiles(finalFiles).length,
    generatedDeltaCount: generatedFiles.size,
    materializedFileCount: materializedFiles.size,
    skeletonFileCount: Object.keys(finalFiles).filter(filePath => skeletonFiles.has(filePath)).length,
    hasMain: Object.prototype.hasOwnProperty.call(finalFiles, 'src/main.tsx'),
    hasApp: Object.prototype.hasOwnProperty.call(finalFiles, 'src/App.tsx'),
    hasRouteManifest: Object.prototype.hasOwnProperty.call(finalFiles, 'src/route-manifest.json'),
    shellOwnerFiles,
  };
}

function resolveRequiredLocalFiles(input: LiveGenerationContractValidationInput): string[] {
  const skeletonRequiredFiles = input.skeletonId ? resolveRequiredDataContractFiles(input.skeletonId) : [];
  return uniqueSorted([
    ...skeletonRequiredFiles,
    ...(input.requiredLocalFiles ?? []),
  ].map(filePath => normalizeCandidatePath(filePath)));
}

function createDiagnostic(
  summary: CandidateGraphSummary,
  root_cause_type: LiveGenerationRootCauseType,
  options: {
    file?: string | null;
    import_path?: string | null;
    expected?: string | null;
    actual?: string | null;
    suggested_fix: string;
    raw_error_excerpt?: string | null;
  },
): LiveGenerationContractDiagnostic {
  return {
    root_cause_type,
    file: options.file ?? null,
    import_path: options.import_path ?? null,
    expected: options.expected ?? null,
    actual: options.actual ?? null,
    suggested_fix: options.suggested_fix,
    candidate_graph_summary: summary,
    raw_error_excerpt: options.raw_error_excerpt ?? null,
  };
}

export function validateUiPrimitiveCatalogAvailability(
  input: UiPrimitiveCatalogValidationInput,
): LiveGenerationContractDiagnostic[] {
  const summary: CandidateGraphSummary = {
    totalFiles: input.workspaceFiles.length,
    sourceModuleCount: input.workspaceFiles.filter(path => /\.(?:tsx?|jsx?)$/i.test(path)).length,
    pageFileCount: 0,
    meaningfulSourceCount: 0,
    generatedDeltaCount: 0,
    materializedFileCount: 0,
    skeletonFileCount: 0,
    hasMain: false,
    hasApp: false,
    hasRouteManifest: false,
    shellOwnerFiles: [],
  };
  const available = new Set(input.workspaceFiles.map(normalizeWorkspacePath));
  const diagnostics: LiveGenerationContractDiagnostic[] = [];

  for (const primitiveName of input.advertisedPrimitives) {
    const primitive = canonicalUiPrimitiveId(primitiveName);
    if (!primitive) {
      diagnostics.push(createDiagnostic(summary, 'missing_ui_primitive', {
        file: null,
        import_path: primitiveName,
        expected: 'advertised primitive must map to the canonical live-generation primitive catalog',
        actual: 'primitive is not in the canonical contract list',
        suggested_fix: 'Remove the unsupported primitive from the coder prompt or add a canonical component source for it.',
        raw_error_excerpt: input.rawErrorExcerpt,
      }));
      continue;
    }

    const hasPhysicalSource = uiPrimitiveWorkspaceCandidates(primitive).some(candidate => available.has(candidate));
    if (!hasPhysicalSource) {
      diagnostics.push(createDiagnostic(summary, 'missing_ui_primitive', {
        file: uiPrimitiveWorkspaceCandidates(primitive)[0] ?? null,
        import_path: `@/components/ui/${primitive}`,
        expected: 'advertised UI primitive must have a physical canonical source',
        actual: 'no canonical source file exists in frontend or skeleton UI roots',
        suggested_fix: `Add a canonical ${primitive} component source or stop advertising it in the coder prompt.`,
        raw_error_excerpt: input.rawErrorExcerpt,
      }));
    }
  }

  return diagnostics;
}

function parseImports(source: string, importer: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const pattern = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  for (const match of source.matchAll(pattern)) {
    const clause = (match[1] ?? '').trim();
    const specifier = match[2] ?? '';
    if (!clause || !specifier) continue;

    let typeOnly = false;
    let defaultImport: string | null = null;
    let namespaceImport: string | null = null;
    const namedImports: string[] = [];
    let sawTypeOnlyBinding = false;
    let sawValueBinding = false;
    let normalizedClause = clause;

    if (normalizedClause.startsWith('type ')) {
      typeOnly = true;
      normalizedClause = normalizedClause.slice(5).trim();
    }

    const namedMatch = normalizedClause.match(/\{([\s\S]*?)\}/);
    if (namedMatch) {
      for (const part of namedMatch[1].split(',')) {
        const rawToken = part.trim();
        const partTypeOnly = rawToken.startsWith('type ');
        if (partTypeOnly) sawTypeOnlyBinding = true;
        const token = partTypeOnly ? rawToken.slice(5).trim() : rawToken;
        if (!token) continue;
        const exportedName = token.split(/\s+as\s+/i)[0]?.trim();
        if (!exportedName) continue;
        if (partTypeOnly) continue;
        if (exportedName === 'default') {
          defaultImport = defaultImport ?? token.split(/\s+as\s+/i)[1]?.trim() ?? 'default';
        } else {
          namedImports.push(exportedName);
        }
        sawValueBinding = true;
      }
      normalizedClause = normalizedClause.replace(namedMatch[0], '').replace(/,+/g, ',').trim();
    }

    const namespaceMatch = normalizedClause.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (namespaceMatch) {
      namespaceImport = namespaceMatch[1];
      sawValueBinding = true;
      normalizedClause = normalizedClause.replace(namespaceMatch[0], '').replace(/,+/g, ',').trim();
    }

    const head = normalizedClause.split(',')[0]?.trim();
    if (head && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(head)) {
      defaultImport = head;
      sawValueBinding = true;
    }
    if (!typeOnly && sawTypeOnlyBinding && !sawValueBinding) {
      typeOnly = true;
    }

    imports.push({
      importer,
      specifier,
      defaultImport,
      namedImports,
      namespaceImport,
      typeOnly,
    });
  }

  const sideEffectPattern = /^\s*import\s+['"]([^'"]+)['"];?/gm;
  for (const match of source.matchAll(sideEffectPattern)) {
    const specifier = match[1] ?? '';
    if (!specifier) continue;
    imports.push({
      importer,
      specifier,
      defaultImport: null,
      namedImports: [],
      namespaceImport: null,
      typeOnly: false,
    });
  }

  const exportFromPattern = /^\s*export\s+(type\s+)?(\*|\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*|\{([\s\S]*?)\})\s+from\s+['"]([^'"]+)['"];?/gm;
  for (const match of source.matchAll(exportFromPattern)) {
    const wholeExportTypeOnly = Boolean(match[1]);
    const exportClause = match[2] ?? '';
    const namedSegment = match[3] ?? '';
    const specifier = match[4] ?? '';
    if (!specifier) continue;

    let defaultImport: string | null = null;
    const namedImports: string[] = [];
    let typeOnly = wholeExportTypeOnly;
    let sawTypeOnlyBinding = false;
    let sawValueBinding = exportClause.startsWith('*') && !wholeExportTypeOnly;

    if (namedSegment) {
      for (const part of namedSegment.split(',')) {
        const rawToken = part.trim();
        const partTypeOnly = rawToken.startsWith('type ');
        if (partTypeOnly) sawTypeOnlyBinding = true;
        const token = partTypeOnly ? rawToken.slice(5).trim() : rawToken;
        if (!token) continue;
        const exportedName = token.split(/\s+as\s+/i)[0]?.trim();
        if (!exportedName) continue;
        if (partTypeOnly) continue;
        if (exportedName === 'default') {
          defaultImport = token.split(/\s+as\s+/i)[1]?.trim() ?? 'default';
        } else {
          namedImports.push(exportedName);
        }
        sawValueBinding = true;
      }
      if (!wholeExportTypeOnly && sawTypeOnlyBinding && !sawValueBinding) {
        typeOnly = true;
      }
    }

    imports.push({
      importer,
      specifier,
      defaultImport,
      namedImports,
      namespaceImport: null,
      typeOnly,
    });
  }

  return imports;
}

function parseNamedExports(segment: string): string[] {
  const names: string[] = [];
  for (const rawPart of segment.split(',')) {
    const part = rawPart.trim().replace(/^type\s+/, '');
    if (!part) continue;
    const aliasMatch = part.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/i);
    if (!aliasMatch) continue;
    names.push(aliasMatch[2] ?? aliasMatch[1]);
  }
  return names;
}

function collectModuleExports(
  filePath: string,
  files: Record<string, string>,
  cache: Map<string, ModuleExportInfo>,
  visiting = new Set<string>(),
): ModuleExportInfo {
  const normalizedPath = normalizeCandidatePath(filePath);
  const cached = cache.get(normalizedPath);
  if (cached) return cached;

  if (visiting.has(normalizedPath)) {
    return { hasDefault: false, namedExports: new Set<string>() };
  }

  visiting.add(normalizedPath);
  const source = files[normalizedPath] ?? '';
  const info: ModuleExportInfo = {
    hasDefault: /\bexport\s+default\b/.test(source) || /\bexport\s*\{[^}]*\bdefault\b[^}]*\}/.test(source),
    namedExports: new Set<string>(),
  };

  for (const match of source.matchAll(/\bexport\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    info.namedExports.add(match[1]);
  }

  for (const match of source.matchAll(/\bexport\s+\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
    info.namedExports.add(match[1]);
  }

  for (const match of source.matchAll(/\bexport\s*\{([\s\S]*?)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
    const segment = match[1] ?? '';
    for (const exportedName of parseNamedExports(segment)) {
      if (exportedName === 'default') {
        info.hasDefault = true;
      } else {
        info.namedExports.add(exportedName);
      }
    }
  }

  for (const match of source.matchAll(/\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    const resolved = resolveLocalImportTarget(normalizedPath, specifier, files);
    if (!resolved) continue;
    const reexportInfo = collectModuleExports(resolved, files, cache, visiting);
    for (const namedExport of reexportInfo.namedExports) {
      info.namedExports.add(namedExport);
    }
  }

  visiting.delete(normalizedPath);
  cache.set(normalizedPath, info);
  return info;
}

function resolveLocalImportTarget(
  importerPath: string,
  specifier: string,
  files: Record<string, string>,
): string | null {
  const normalizedSpecifier = normalizeSlashes(specifier.trim());
  if (!normalizedSpecifier) return null;

  let basePath: string | null = null;
  if (normalizedSpecifier.startsWith('@/')) {
    basePath = joinPath('src', normalizedSpecifier.slice(2));
  } else if (normalizedSpecifier.startsWith('./') || normalizedSpecifier.startsWith('../')) {
    basePath = joinPath(directoryOf(importerPath), normalizedSpecifier);
  }

  if (!basePath) return null;

  const candidates = LOCAL_GRAPH_EXTENSIONS.map(ext => `${basePath}${ext}`);
  candidates.unshift(basePath);
  for (const ext of LOCAL_GRAPH_EXTENSIONS) {
    candidates.push(`${basePath}/index${ext}`);
  }

  const normalizedCandidates = uniqueSorted(candidates.map(path => normalizeCandidatePath(path)));
  for (const candidate of normalizedCandidates) {
    if (Object.prototype.hasOwnProperty.call(files, candidate)) {
      return candidate;
    }
  }

  const primitive = isUiPrimitiveSpecifier(normalizedSpecifier, normalizeCandidatePath(basePath));
  if (primitive && normalizeCandidatePath(basePath).startsWith('src/components/ui/')) {
    const primitiveCandidates = uniqueSorted(
      [primitive, toPascalCaseUiPrimitiveName(primitive)].flatMap(name => [
        ...SOURCE_EXTENSIONS.map(ext => normalizeCandidatePath(`src/components/ui/${name}${ext}`)),
        ...SOURCE_EXTENSIONS.map(ext => normalizeCandidatePath(`src/components/ui/${name}/index${ext}`)),
      ]),
    );

    for (const candidate of primitiveCandidates) {
      if (Object.prototype.hasOwnProperty.call(files, candidate)) {
        return candidate;
      }
    }
  }

  return normalizeCandidatePath(basePath);
}

function isUiPrimitiveSpecifier(specifier: string, resolvedTarget: string | null): CanonicalUiPrimitive | null {
  const normalizedSpecifier = normalizeSlashes(specifier);
  const specifierMatch = normalizedSpecifier.match(/(?:^@\/components\/ui\/|components\/ui\/)([^/]+)$/i);
  if (specifierMatch) {
    return canonicalUiPrimitiveId(specifierMatch[1]);
  }
  if (resolvedTarget?.startsWith('src/components/ui/')) {
    const fileName = resolvedTarget.split('/').pop()?.replace(/\.(?:tsx?|jsx?)$/i, '') ?? '';
    return canonicalUiPrimitiveId(fileName);
  }
  return null;
}

function createInvalidDefaultImportSuggestedFix(
  parsedImport: ParsedImport,
  resolvedTarget: string,
  exportInfo: ModuleExportInfo,
): string {
  const matchingNamedExport = parsedImport.defaultImport && exportInfo.namedExports.has(parsedImport.defaultImport)
    ? parsedImport.defaultImport
    : null;
  if (matchingNamedExport) {
    if (resolvedTarget.startsWith('src/hooks/')) {
      return `Use named import { ${matchingNamedExport} } or add a safe default export to the canonical hook.`;
    }
    return `Use named import { ${matchingNamedExport} } or add a default export to ${resolvedTarget}.`;
  }
  if (resolvedTarget.startsWith('src/hooks/')) {
    return 'Use a named hook import or add a safe default export to the canonical hook.';
  }
  return 'Switch to a named import or add a default export in the imported module.';
}

function getProtectedShellComponents(skeletonId?: SkeletonId): Set<string> {
  const names = new Set<string>(GLOBAL_PROTECTED_SHELL_COMPONENTS);
  for (const componentName of skeletonId ? PROTECTED_SHELL_COMPONENTS_BY_SKELETON[skeletonId] ?? [] : []) {
    names.add(componentName);
  }
  return names;
}

function isShellBoundaryConsumerFile(filePath: string): boolean {
  return /^src\/(?:pages|components)\/[^/].*\.(?:tsx?|jsx?)$/i.test(filePath)
    && !/^src\/components\/ui\//i.test(filePath);
}

function importedBindingNames(parsedImport: ParsedImport): string[] {
  return [
    parsedImport.defaultImport,
    parsedImport.namespaceImport,
    ...parsedImport.namedImports,
  ].filter((value): value is string => !!value);
}

function describeShellLayerFromPath(path: string): string {
  if (path === 'src/config/routes.ts' || path === 'src/route-manifest.json') {
    return 'route contract';
  }
  if (path === 'src/config/navigation.ts') {
    return 'navigation contract';
  }
  if (/\/context\//i.test(path) || /\/providers?\//i.test(path)) {
    return 'provider layer';
  }
  if (/\/components\/(?:BottomTabs|Nav|NavigationShell|Sidebar|TopBar|Topbar)\.tsx$/i.test(path)) {
    return 'navigation shell';
  }
  if (/\/components\/(?:AppShell|DashboardShell)\.tsx$/i.test(path) || path === 'src/App.tsx') {
    return 'layout shell';
  }
  if (path === 'src/main.tsx') {
    return 'preview bootstrap';
  }
  return 'shell infrastructure';
}

function buildProtectedShellDiagnostic(
  summary: CandidateGraphSummary,
  input: LiveGenerationContractValidationInput,
  filePath: string,
  importPath: string,
  layer: string,
  detail: string,
): LiveGenerationContractDiagnostic {
  return createDiagnostic(summary, 'protected_shell_import', {
    file: filePath,
    import_path: importPath,
    expected: 'product slot files must leave router, providers, layout shell, and navigation ownership to the skeleton shell',
    actual: `${filePath} tries to own shell layer ${layer}: ${detail}`,
    suggested_fix: `Remove the shell ownership from ${filePath}. Keep ${layer} logic in the skeleton shell or its dedicated product-slot config file instead.`,
    raw_error_excerpt: input.rawErrorExcerpt,
  });
}

export function validateCandidateGraphContract(
  input: LiveGenerationContractValidationInput,
): LiveGenerationContractValidationResult {
  const finalFiles = normalizeGraph(input.finalFiles);
  const diagnostics: LiveGenerationContractDiagnostic[] = [];
  const summary = buildCandidateGraphSummary(input);
  const requiredLocalFiles = resolveRequiredLocalFiles(input);

  if (!summary.hasMain) {
    diagnostics.push(createDiagnostic(summary, 'missing_entry_file', {
      file: 'src/main.tsx',
      expected: 'final candidate graph must contain src/main.tsx',
      actual: 'missing from final candidate graph',
      suggested_fix: 'Preserve or materialize src/main.tsx before compile so the preview bootstrap can mount the root shell.',
      raw_error_excerpt: input.rawErrorExcerpt,
    }));
  }

  if (!summary.hasApp) {
    diagnostics.push(createDiagnostic(summary, 'missing_entry_file', {
      file: 'src/App.tsx',
      expected: 'final candidate graph must contain src/App.tsx, including skeleton-provided App.tsx',
      actual: 'missing from final candidate graph',
      suggested_fix: 'Carry skeleton src/App.tsx into the final candidate graph or generate a valid App.tsx delta.',
      raw_error_excerpt: input.rawErrorExcerpt,
    }));
  }

  if (resolveRouteManifestExpectation(input.skeletonId) && !summary.hasRouteManifest) {
    diagnostics.push(createDiagnostic(summary, 'missing_entry_file', {
      file: 'src/route-manifest.json',
      expected: 'skeleton-backed candidate graph must preserve route-manifest.json when the skeleton installs one',
      actual: 'route manifest missing',
      suggested_fix: 'Keep the skeleton route-manifest.json in the final candidate graph so route ownership and shell contracts remain intact.',
      raw_error_excerpt: input.rawErrorExcerpt,
    }));
  }

  if (summary.shellOwnerFiles.length === 0) {
    diagnostics.push(createDiagnostic(summary, 'missing_root_shell', {
      file: null,
      expected: 'candidate graph must contain an App.tsx or a protected shell owner file',
      actual: 'no root shell owner detected',
      suggested_fix: 'Preserve the skeleton root shell or add a root App.tsx that owns shell layout components.',
      raw_error_excerpt: input.rawErrorExcerpt,
    }));
  }

  for (const requiredFile of requiredLocalFiles) {
    if (Object.prototype.hasOwnProperty.call(finalFiles, requiredFile)) continue;
    diagnostics.push(createDiagnostic(summary, 'missing_required_manifest_file', {
      file: requiredFile,
      import_path: requiredFile.startsWith('src/')
        ? `@/${requiredFile.slice(4).replace(/\.(?:tsx?|jsx?)$/i, '')}`
        : null,
      expected: 'required manifest-driven local file to exist in the final candidate graph before compile',
      actual: `${requiredFile} is required by the skeleton data-layer contract but missing from the final candidate graph`,
      suggested_fix: `Preserve or generate ${requiredFile} whenever the selected skeleton manifest requires it.`,
      raw_error_excerpt: input.rawErrorExcerpt,
    }));
  }

  const hasSkeletonFoundation = Boolean(
    input.skeletonId && summary.hasMain && summary.hasApp && summary.skeletonFileCount >= 3,
  );
  if (!hasSkeletonFoundation && summary.meaningfulSourceCount < 2) {
    diagnostics.push(createDiagnostic(summary, 'thin_output', {
      file: null,
      expected: 'combined skeleton + generated output should contain more than a single thin surface',
      actual: `meaningful source count=${summary.meaningfulSourceCount}`,
      suggested_fix: 'Carry the skeleton foundation into the final graph or generate enough connected source files for a viable app shell.',
      raw_error_excerpt: input.rawErrorExcerpt,
    }));
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    candidateGraphSummary: summary,
  };
}

export function validateImportExportContract(
  input: LiveGenerationContractValidationInput,
): LiveGenerationContractValidationResult {
  const finalFiles = normalizeGraph(input.finalFiles);
  const summary = buildCandidateGraphSummary(input);
  const diagnostics: LiveGenerationContractDiagnostic[] = [];
  const exportCache = new Map<string, ModuleExportInfo>();

  for (const [filePath, content] of Object.entries(finalFiles)) {
    if (!isSourceModule(filePath)) continue;
    for (const parsedImport of parseImports(content, filePath)) {
      if (parsedImport.typeOnly) continue;
      // Asset imports (svg/png/fonts/media) are Vite URL resolutions, not text
      // modules in the candidate graph — skip them here; Vite resolves from disk.
      if (isNonGraphAssetSpecifier(parsedImport.specifier)) continue;
      const resolvedTarget = resolveLocalImportTarget(filePath, parsedImport.specifier, finalFiles);
      if (!resolvedTarget) continue;

      if (!Object.prototype.hasOwnProperty.call(finalFiles, resolvedTarget)) {
        const primitive = isUiPrimitiveSpecifier(parsedImport.specifier, resolvedTarget);
        if (primitive) {
          diagnostics.push(createDiagnostic(summary, 'missing_ui_primitive', {
            file: filePath,
            import_path: parsedImport.specifier,
            expected: `@/components/ui/${primitive} to exist before vite build`,
            actual: `missing target module ${resolvedTarget}`,
            suggested_fix: `Materialize ${primitive} from a canonical UI source or stop importing it from ${filePath}.`,
            raw_error_excerpt: input.rawErrorExcerpt,
          }));
        } else {
          diagnostics.push(createDiagnostic(summary, 'missing_local_import', {
            file: filePath,
            import_path: parsedImport.specifier,
            expected: 'local import target to exist in the final candidate graph',
            actual: `missing target module ${resolvedTarget}`,
            suggested_fix: 'Add the missing local module to the candidate graph or correct the import path before compile.',
            raw_error_excerpt: input.rawErrorExcerpt,
          }));
        }
        continue;
      }

      if (!isSourceModule(resolvedTarget)) continue;

      const exportInfo = collectModuleExports(resolvedTarget, finalFiles, exportCache);
      if (parsedImport.defaultImport && !parsedImport.typeOnly && !exportInfo.hasDefault) {
        diagnostics.push(createDiagnostic(summary, 'invalid_default_import', {
          file: filePath,
          import_path: parsedImport.specifier,
          expected: 'default export',
          actual: exportInfo.namedExports.size > 0 ? 'named exports only' : 'no exports detected',
          suggested_fix: createInvalidDefaultImportSuggestedFix(parsedImport, resolvedTarget, exportInfo),
          raw_error_excerpt: input.rawErrorExcerpt,
        }));
      }

      for (const namedImport of parsedImport.namedImports) {
        if (namedImport === 'default') continue;
        if (!exportInfo.namedExports.has(namedImport)) {
          diagnostics.push(createDiagnostic(summary, 'missing_named_export', {
            file: filePath,
            import_path: parsedImport.specifier,
            expected: `named export ${namedImport}`,
            actual: exportInfo.namedExports.size > 0
              ? `available exports: ${Array.from(exportInfo.namedExports).sort().join(', ')}`
              : 'no named exports detected',
            suggested_fix: `Export ${namedImport} from ${resolvedTarget} or change the import in ${filePath}.`,
            raw_error_excerpt: input.rawErrorExcerpt,
          }));
        }
      }
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    candidateGraphSummary: summary,
  };
}

export function validateProtectedShellBoundary(
  input: LiveGenerationContractValidationInput,
): LiveGenerationContractValidationResult {
  const finalFiles = normalizeGraph(input.finalFiles);
  const generatedDeltaFiles = normalizeGraph(input.generatedDeltaFiles);
  const summary = buildCandidateGraphSummary(input);
  const diagnostics: LiveGenerationContractDiagnostic[] = [];
  const protectedShellComponents = getProtectedShellComponents(input.skeletonId);
  const productSlotPaths = new Set(
    (input.skeletonId ? getProductDeltaScope(input.skeletonId).allowed : [])
      .map(path => normalizeCandidatePath(path)),
  );
  const hasGeneratedDelta = Object.keys(generatedDeltaFiles).length > 0;
  const filesToInspect = hasGeneratedDelta ? generatedDeltaFiles : finalFiles;

  for (const [filePath, content] of Object.entries(filesToInspect)) {
    if (!isSourceModule(filePath)) continue;
    if (!isShellBoundaryConsumerFile(filePath)) continue;
    // Ownership boundary validation is about product-owned code. When no explicit
    // generated delta is available, inspect manifest product slots only — never
    // infer shell ownership from the broader skeletonOwned/readOnly file set.
    if (!hasGeneratedDelta && input.skeletonId && !productSlotPaths.has(filePath)) continue;
    if (productSlotPaths.has(filePath) && !/^src\/pages\//i.test(filePath)) {
      // Product-slot config/data files may define their manifest-declared contracts.
      continue;
    }

    for (const parsedImport of parseImports(content, filePath)) {
      const importPath = parsedImport.specifier;
      const importedBindings = importedBindingNames(parsedImport);
      const resolvedTarget = resolveLocalImportTarget(filePath, importPath, finalFiles);
      const componentName = importPath.split('/').pop()?.replace(/\.(?:tsx?|jsx?)$/i, '') ?? '';
      if (importPath === 'react-router-dom') {
        const owningBindings = importedBindings.filter(binding => DISALLOWED_REACT_ROUTER_IMPORTS.has(binding));
        if (owningBindings.length > 0) {
          diagnostics.push(buildProtectedShellDiagnostic(
            summary,
            input,
            filePath,
            importPath,
            'router',
            `imports ${owningBindings.join(', ')} from react-router-dom`,
          ));
          continue;
        }

        if (
          parsedImport.namespaceImport
          && /\b(?:BrowserRouter|HashRouter|RouterProvider|Routes|Route|createBrowserRouter|createHashRouter|useRoutes|Outlet)\b/.test(content)
        ) {
          diagnostics.push(buildProtectedShellDiagnostic(
            summary,
            input,
            filePath,
            importPath,
            'router',
            `uses router ownership APIs via namespace import ${parsedImport.namespaceImport}`,
          ));
          continue;
        }
      }

      const providerBindings = importedBindings.filter(binding => /Provider$/.test(binding));
      if (
        providerBindings.length > 0 &&
        (
          resolvedTarget?.includes('/context/')
          || resolvedTarget?.includes('/providers/')
          || importPath.includes('/context/')
          || importPath.includes('/providers/')
        )
      ) {
        diagnostics.push(buildProtectedShellDiagnostic(
          summary,
          input,
          filePath,
          importPath,
          'provider layer',
          `imports ${providerBindings.join(', ')} from ${resolvedTarget ?? importPath}`,
        ));
        continue;
      }

      const resolvedTargetIsProductSlot = Boolean(
        resolvedTarget && productSlotPaths.has(resolvedTarget),
      );
      if (
        resolvedTarget &&
        SHELL_CONTRACT_PATHS.has(resolvedTarget) &&
        !resolvedTargetIsProductSlot
      ) {
        diagnostics.push(buildProtectedShellDiagnostic(
          summary,
          input,
          filePath,
          importPath,
          describeShellLayerFromPath(resolvedTarget),
          `imports ${resolvedTarget}`,
        ));
        continue;
      }

      // skeletonOwned / agentReadOnly describes edit ownership, not import visibility.
      // Product pages may consume reusable shell-provided components (EmptyState,
      // LoadingScreen, cards, hooks, etc.) without taking ownership of the shell.
      // Only explicit shell-owner component families remain forbidden here.
      if (protectedShellComponents.has(componentName)) {
        const layerPath = resolvedTarget ?? `src/components/${componentName}.tsx`;
        diagnostics.push(buildProtectedShellDiagnostic(
          summary,
          input,
          filePath,
          importPath,
          describeShellLayerFromPath(layerPath),
          `imports protected shell module ${resolvedTarget ?? componentName}`,
        ));
      }
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    candidateGraphSummary: summary,
  };
}

function dedupeDiagnostics(diagnostics: LiveGenerationContractDiagnostic[]): LiveGenerationContractDiagnostic[] {
  const seen = new Set<string>();
  const out: LiveGenerationContractDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.root_cause_type,
      diagnostic.file ?? '',
      diagnostic.import_path ?? '',
      diagnostic.expected ?? '',
      diagnostic.actual ?? '',
    ].join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }
  return out;
}

export function validateLiveGenerationContract(
  input: LiveGenerationContractValidationInput,
): LiveGenerationContractValidationResult {
  const candidateGraph = validateCandidateGraphContract(input);
  const importExport = validateImportExportContract(input);
  const protectedShell = validateProtectedShellBoundary(input);
  const diagnostics = dedupeDiagnostics([
    ...candidateGraph.diagnostics,
    ...importExport.diagnostics,
    ...protectedShell.diagnostics,
  ]);

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    candidateGraphSummary: candidateGraph.candidateGraphSummary,
  };
}

export class LiveGenerationContractError extends Error {
  readonly diagnostics: LiveGenerationContractDiagnostic[];
  readonly candidateGraphSummary: CandidateGraphSummary;

  constructor(
    diagnostics: LiveGenerationContractDiagnostic[],
    candidateGraphSummary: CandidateGraphSummary,
    message?: string,
  ) {
    super(message ?? formatLiveGenerationContractFailure(diagnostics, candidateGraphSummary));
    this.name = 'LiveGenerationContractError';
    this.diagnostics = diagnostics;
    this.candidateGraphSummary = candidateGraphSummary;
  }
}

export function isLiveGenerationContractError(value: unknown): value is LiveGenerationContractError {
  return value instanceof LiveGenerationContractError
    || Boolean(
      value
      && typeof value === 'object'
      && 'diagnostics' in value
      && 'candidateGraphSummary' in value,
    );
}

export function formatLiveGenerationContractFailure(
  diagnostics: readonly LiveGenerationContractDiagnostic[],
  summary: CandidateGraphSummary,
): string {
  const first = diagnostics[0];
  if (!first) {
    return `Live generation contract passed. files=${summary.totalFiles}`;
  }

  const headline = [
    `root_cause_type=${first.root_cause_type}`,
    first.file ? `file=${first.file}` : null,
    first.import_path ? `import=${first.import_path}` : null,
  ].filter(Boolean).join(' ');

  return [
    `Live generation contract failed: ${headline}`,
    JSON.stringify(first, null, 2),
  ].join('\n');
}

export function createViteBuildDiagnostic(
  summary: CandidateGraphSummary,
  rawErrorExcerpt: string,
): LiveGenerationContractDiagnostic {
  return createDiagnostic(summary, 'vite_build_error', {
    file: null,
    expected: 'vite build to complete after contract validation passed',
    actual: rawErrorExcerpt.trim() || 'vite build failed with no stderr excerpt',
    suggested_fix: 'Use the raw Vite excerpt together with the candidate graph summary to repair the remaining compile error.',
    raw_error_excerpt: rawErrorExcerpt,
  });
}

export function validateGeneratedDeltaAgainstProtectedSkeletonFiles(
  skeletonId: SkeletonId,
  files: Record<string, string>,
): string[] {
  return Object.keys(files)
    .map(path => normalizeCandidatePath(path))
    .filter(path => isProtectedSkeletonFile(skeletonId, path));
}

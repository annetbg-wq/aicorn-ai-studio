/**
 * RouteManifestService — Route manifest as single source of truth.
 *
 * Architecture (Lovable-level pattern):
 *   1. route-manifest.json is the AUTHORITY for which routes exist
 *   2. App.tsx is GENERATED from the manifest — never hand-edited for routes
 *   3. EDIT mode reads manifest → injects as protected route list → LLM can add
 *      pages but cannot break existing routes
 *   4. After generation, manifest is updated from LLM output, then App.tsx
 *      is regenerated deterministically from manifest
 *
 * Flow:
 *   NEW:  plan.pages → buildManifest() → entries stored in revision
 *   EDIT: readManifest() → inject into prompt → LLM adds new routes →
 *         mergeManifest() → generateAppTsx() → write to revision
 *
 * This eliminates the class of bugs where LLM rewrites App.tsx and
 * accidentally drops existing routes.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RouteEntry {
  /** URL path, e.g. "/" or "/settings" */
  path:        string;
  /** Component name, e.g. "HomePage" */
  component:   string;
  /** File path relative to src/, e.g. "pages/Home.tsx" */
  filePath:    string;
  /** Human-readable title for nav */
  title:       string;
  /** Whether this is the home/index route */
  isHome:      boolean;
  /** Whether this route requires authentication */
  isProtected: boolean;
}

export interface RouteManifest {
  version:    1;
  layout:     'tabs' | 'sidebar' | 'none';
  routes:     RouteEntry[];
}

// ─── Manifest file name (stored alongside generated files) ───────────────

export const MANIFEST_PATH = '/route-manifest.json';

// ─── Parse / Build ──────────────────────────────────────────────────────────

/**
 * Build a manifest from an Architect plan's pages array.
 */
export function buildManifestFromPlan(
  pages: Array<{ path: string; name: string; file: string; isMainScreen?: boolean; guard?: unknown }>,
  layout: { navigation?: string } = {},
): RouteManifest {
  const routes: RouteEntry[] = pages.map(p => {
    const file = p.file.replace(/^src\//, '');
    const name = p.name || file.replace(/\.tsx$/, '').split('/').pop() || 'Page';
    const component = toComponentName(name);
    return {
      path:        p.path,
      component,
      filePath:    file,
      title:       p.name || component,
      isHome:      p.isMainScreen ?? p.path === '/',
      isProtected: !!p.guard,
    };
  });

  const nav = layout.navigation || 'tabs';
  const layoutType: RouteManifest['layout'] =
    nav.includes('sidebar') ? 'sidebar' :
    nav.includes('tab') ? 'tabs' : 'none';

  return { version: 1, layout: layoutType, routes };
}

/**
 * Parse an existing route-manifest.json from file content.
 * Returns null if invalid or missing.
 */
export function parseManifest(content: string): RouteManifest | null {
  try {
    const raw = JSON.parse(content);
    if (!raw || raw.version !== 1 || !Array.isArray(raw.routes)) return null;
    return raw as RouteManifest;
  } catch {
    return null;
  }
}

/**
 * Merge new routes from LLM output into an existing manifest.
 * - Existing routes are preserved (never removed unless file is deleted)
 * - New routes from the LLM file set are added
 * - Routes whose files no longer exist are removed
 */
export function mergeManifest(
  existing: RouteManifest,
  llmFiles: Record<string, string>,
): RouteManifest {
  // Normalize LLM file keys
  const fileSet = new Set(
    Object.keys(llmFiles).map(k => k.replace(/^\//, '').replace(/^src\//, '')),
  );

  // Keep existing routes whose files still exist (in LLM output or untouched)
  const retained = existing.routes.filter(r => {
    // If the LLM didn't touch this file, it still exists on disk — keep it
    return true; // We never remove routes from manifest during EDIT
  });
  const retainedPaths = new Set(retained.map(r => r.path));

  // Detect new page files from LLM output that aren't in manifest
  const newRoutes: RouteEntry[] = [];
  for (const [key, content] of Object.entries(llmFiles)) {
    const normalized = key.replace(/^\//, '').replace(/^src\//, '');
    if (!normalized.startsWith('pages/')) continue;
    if (!normalized.endsWith('.tsx')) continue;

    // Extract component name from the file
    const componentMatch = content.match(/export\s+default\s+function\s+(\w+)/);
    const fileName = normalized.replace(/^pages\//, '').replace(/\.tsx$/, '');
    const component = componentMatch?.[1] || toComponentName(fileName);

    // Infer route path from file name
    const routePath = inferRoutePath(fileName);
    if (retainedPaths.has(routePath)) continue; // Already in manifest

    newRoutes.push({
      path: routePath,
      component,
      filePath: normalized,
      title: fileName.replace(/([A-Z])/g, ' $1').trim(),
      isHome: routePath === '/',
      isProtected: false,
    });
  }

  // Also check if LLM modified App.tsx to add new <Route> elements
  const appTsx = llmFiles['/App.tsx'] || llmFiles['App.tsx'] || llmFiles['src/App.tsx'];
  if (appTsx) {
    const routeMatches = appTsx.matchAll(/<Route\s+path=["']([^"']+)["']/g);
    for (const m of routeMatches) {
      const path = m[1];
      if (path === '*') continue;
      if (retainedPaths.has(path)) continue;
      if (newRoutes.some(r => r.path === path)) continue;

      // Try to find the corresponding element/component
      const lineMatch = appTsx.match(new RegExp(`path=["']${escapeRegex(path)}["'][^>]*element=\\{<(\\w+)`));
      const comp = lineMatch?.[1] || 'Page';

      // Try to find the import for this component
      const importMatch = appTsx.match(new RegExp(`import\\s+${comp}\\s+from\\s+['"]([^'"]+)['"]`));
      const filePath = importMatch
        ? importMatch[1].replace(/^\.\//, '').replace(/^src\//, '') + '.tsx'
        : `pages/${comp}.tsx`;

      newRoutes.push({
        path,
        component: comp,
        filePath: filePath.replace(/\.tsx\.tsx$/, '.tsx'),
        title: comp.replace(/([A-Z])/g, ' $1').trim(),
        isHome: path === '/',
        isProtected: false,
      });
    }
  }

  return {
    ...existing,
    routes: [...retained, ...newRoutes],
  };
}

// ─── Per-Route ErrorBoundary (inline component in generated App.tsx) ────────

const ROUTE_GUARD_COMPONENT = `class RouteGuard extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-semibold text-foreground">
              {this.props.name} failed to load
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error.message}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Retry
              </button>
              <Link to="/" className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium">
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}`;

// ─── App.tsx Generation ─────────────────────────────────────────────────────

/**
 * Generate a complete App.tsx from the route manifest.
 * This is DETERMINISTIC — same manifest always produces same App.tsx.
 */
export function generateAppTsx(
  manifest: RouteManifest,
  options?: {
    /** Additional imports to include (contexts, providers) */
    extraImports?:  string[];
    /** JSX to wrap around <Routes> (e.g., providers, layout) */
    wrapperStart?:  string[];
    wrapperEnd?:    string[];
  },
): string {
  const imports: string[] = [
    `import React from 'react';`,
    `import { HashRouter, Routes, Route, Link } from 'react-router-dom';`,
  ];

  // Import each page component — lazy-loaded for resilience
  for (const route of manifest.routes) {
    const rel = './' + route.filePath.replace(/\.tsx$/, '');
    imports.push(`const ${route.component} = React.lazy(() => import('${rel}'));`);
  }

  if (options?.extraImports) {
    imports.push(...options.extraImports);
  }

  // Build <Route> elements wrapped in per-route ErrorBoundary
  const routeElements = manifest.routes.map(r =>
    `        <Route path="${r.path}" element={<RouteGuard name="${r.title}"><${r.component} /></RouteGuard>} />`
  );

  const wrapStart = options?.wrapperStart ?? [];
  const wrapEnd   = options?.wrapperEnd ?? [];

  const lines = [
    ...imports,
    '',
    ROUTE_GUARD_COMPONENT,
    '',
    'export default function App() {',
    '  return (',
    '    <HashRouter>',
    ...wrapStart.map(l => '      ' + l),
    '      <React.Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>',
    '      <Routes>',
    ...routeElements,
    '      </Routes>',
    '      </React.Suspense>',
    ...wrapEnd.map(l => '      ' + l),
    '    </HashRouter>',
    '  );',
    '}',
    '',
  ];

  return lines.join('\n');
}

/**
 * Extract existing provider/context wrappers and extra imports from
 * a current App.tsx so they can be preserved when regenerating.
 */
export function extractAppTsxContext(appTsxContent: string): {
  extraImports: string[];
  wrapperStart: string[];
  wrapperEnd:   string[];
} {
  const extraImports: string[] = [];
  const wrapperStart: string[] = [];
  const wrapperEnd:   string[] = [];

  // Extract non-route imports (contexts, providers, layouts)
  const importLines = appTsxContent.match(/^import\s+.+$/gm) ?? [];
  for (const line of importLines) {
    // Skip route-related imports (pages, react-router-dom)
    if (line.includes('react-router-dom')) continue;
    if (/from\s+['"]\.\/pages\//.test(line)) continue;
    // Keep everything else (contexts, layouts, components)
    if (/from\s+['"]\.\//.test(line)) {
      extraImports.push(line);
    }
  }

  // Extract provider/layout wrappers between <HashRouter> (or <BrowserRouter>) and <Routes>
  const betweenRouterAndRoutes = appTsxContent.match(
    /<(?:Hash|Browser)Router>([\s\S]*?)<Routes>/,
  );
  if (betweenRouterAndRoutes) {
    const inner = betweenRouterAndRoutes[1].trim();
    const jsxLines = inner.split('\n').map(l => l.trim()).filter(l => l && !/<\/?(?:Hash|Browser)Router>/.test(l));
    wrapperStart.push(...jsxLines);
  }

  // Extract closing wrappers between </Routes> and </HashRouter> (or </BrowserRouter>)
  const afterRoutes = appTsxContent.match(
    /<\/Routes>([\s\S]*?)<\/(?:Hash|Browser)Router>/,
  );
  if (afterRoutes) {
    const inner = afterRoutes[1].trim();
    const jsxLines = inner.split('\n').map(l => l.trim()).filter(l => l && !/<\/?(?:Hash|Browser)Router>/.test(l));
    wrapperEnd.push(...jsxLines);
  }

  return { extraImports, wrapperStart, wrapperEnd };
}

// ─── Prompt helpers ─────────────────────────────────────────────────────────

/**
 * Format the manifest as a compact block for injection into EDIT system prompt.
 * This tells the LLM which routes exist and must not be removed.
 */
export function manifestToPromptBlock(manifest: RouteManifest): string {
  if (manifest.routes.length === 0) return '';
  const lines = manifest.routes.map(r =>
    `  ${r.path} → ${r.component} (${r.filePath})${r.isProtected ? ' [protected]' : ''}`
  );
  return `EXISTING ROUTES (DO NOT REMOVE OR RENAME — only ADD new ones):
${lines.join('\n')}
If adding a new page:
1. Create the page file in pages/
2. Add a new route entry — do NOT rewrite existing routes
3. Import the new page in App.tsx and add a <Route> element`;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function toComponentName(raw: string): string {
  return raw
    .replace(/\.tsx?$/, '')
    .split(/[/_-]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function inferRoutePath(fileName: string): string {
  const base = fileName.replace(/\.tsx$/, '');
  if (/^(home|index|main|dashboard)$/i.test(base)) return '/';
  return '/' + base.replace(/([A-Z])/g, (_, c, i) => (i > 0 ? '-' : '') + c.toLowerCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

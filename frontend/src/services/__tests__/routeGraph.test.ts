/**
 * routeGraph — Tests for route graph population, drift detection, and validation.
 *
 * Covers:
 *   1. syncRoutes: populating graph routes from page files
 *   2. extractRoutesFromAppTsx: parsing <Route> patterns from App.tsx
 *   3. validateRouteFileExistence: route→file and file→route consistency
 *   4. validateAppTsxAgainstGraph: Layer 1 ↔ Layer 2 drift
 *   5. validateRoutesJsonAgainstGraph: Layer 3 ↔ Layer 2 drift
 *   6. validateAllRouteLayers: combined validation
 *   7. Single-page app (no routes, no drift)
 *   8. Multi-page app (routes populated, consistent)
 *   9. Drift scenarios (missing files, orphan pages, layer disagreements)
 */

import { describe, it, expect } from 'vitest';
import {
  syncRoutes,
  inferFileRole,
  extractRoutesFromAppTsx,
  validateRouteFileExistence,
  validateAppTsxAgainstGraph,
  validateRoutesJsonAgainstGraph,
  validateAllRouteLayers,
  parseRoutesJson,
  fileMapToProjectGraph,
  djb2Hash,
  fileBlueprintId,
  type FileBlueprint,
  type RouteSpec,
  type RoutesJsonEntry,
  type ProjectGraph,
} from '../../shared/projectModel';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeBlueprint(path: string, content = ''): FileBlueprint {
  return {
    id: fileBlueprintId(path),
    path,
    content,
    role: inferFileRole(path),
    language: 'ts',
    exports: [],
    dependencies: [],
    hash: djb2Hash(content),
    generatedAt: new Date().toISOString(),
    generatedBy: 'ai',
    isProtected: false,
    userZones: [],
  };
}

function makeRoute(path: string, filePath: string, overrides: Partial<RouteSpec> = {}): RouteSpec {
  return {
    id: djb2Hash(`route:${filePath}`),
    path,
    fileBlueprintId: fileBlueprintId(filePath),
    filePath,
    title: filePath.split('/').pop()?.replace(/\.tsx?$/, '') ?? '',
    isIndex: path === '/',
    isProtected: false,
    params: [],
    children: [],
    ...overrides,
  };
}

// ── syncRoutes ──────────────────────────────────────────────────────────────

describe('syncRoutes', () => {
  it('infers routes from page-role files', () => {
    const files = [
      makeBlueprint('App.tsx', 'export default function App() {}'),
      makeBlueprint('pages/HomePage.tsx', 'export default function HomePage() {}'),
      makeBlueprint('pages/AboutPage.tsx', 'export default function AboutPage() {}'),
      makeBlueprint('pages/Settings.tsx', 'export default function Settings() {}'),
      makeBlueprint('index.css', ''),
    ];

    const routes = syncRoutes(files, []);

    expect(routes).toHaveLength(3);

    const homePath = routes.find(r => r.filePath === 'pages/HomePage.tsx');
    expect(homePath).toBeDefined();
    expect(homePath!.path).toBe('/');
    expect(homePath!.isIndex).toBe(true);

    const aboutPath = routes.find(r => r.filePath === 'pages/AboutPage.tsx');
    expect(aboutPath).toBeDefined();
    expect(aboutPath!.path).toBe('/about');
    expect(aboutPath!.isIndex).toBe(false);

    const settingsPath = routes.find(r => r.filePath === 'pages/Settings.tsx');
    expect(settingsPath).toBeDefined();
    expect(settingsPath!.path).toBe('/settings');
  });

  it('returns empty for single-page app (no page files)', () => {
    const files = [
      makeBlueprint('App.tsx', 'export default function App() {}'),
      makeBlueprint('index.css', ''),
      makeBlueprint('components/Button.tsx', ''),
    ];

    const routes = syncRoutes(files, []);
    expect(routes).toHaveLength(0);
  });

  it('preserves existing hand-authored routes', () => {
    const existing = [makeRoute('/custom', 'pages/HomePage.tsx', { title: 'Custom Home' })];
    const files = [
      makeBlueprint('pages/HomePage.tsx', ''),
      makeBlueprint('pages/AboutPage.tsx', ''),
    ];

    const routes = syncRoutes(files, existing);
    // existing HomePage route preserved (not re-inferred)
    const home = routes.find(r => r.filePath === 'pages/HomePage.tsx');
    expect(home!.path).toBe('/custom');
    expect(home!.title).toBe('Custom Home');

    // AboutPage route added
    const about = routes.find(r => r.filePath === 'pages/AboutPage.tsx');
    expect(about).toBeDefined();
    expect(about!.path).toBe('/about');
  });

  it('removes routes for deleted files', () => {
    const existing = [
      makeRoute('/', 'pages/HomePage.tsx'),
      makeRoute('/deleted', 'pages/DeletedPage.tsx'),
    ];
    const files = [makeBlueprint('pages/HomePage.tsx', '')];

    const routes = syncRoutes(files, existing);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/');
  });
});

// ── extractRoutesFromAppTsx ─────────────────────────────────────────────────

describe('extractRoutesFromAppTsx', () => {
  it('extracts standard react-router Route patterns', () => {
    const appTsx = `
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}`;

    const routes = extractRoutesFromAppTsx(appTsx);
    expect(routes).toHaveLength(3);

    expect(routes[0]).toEqual({ path: '/', component: 'HomePage', isCatchAll: false });
    expect(routes[1]).toEqual({ path: '/about', component: 'AboutPage', isCatchAll: false });
    expect(routes[2]).toEqual({ path: '*', component: 'NotFound', isCatchAll: true });
  });

  it('extracts routes with single quotes', () => {
    const appTsx = `<Route path='/' element={<Home />} />`;
    const routes = extractRoutesFromAppTsx(appTsx);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/');
  });

  it('returns empty for single-page app with no routes', () => {
    const appTsx = `
export default function App() {
  return <div>Hello World</div>;
}`;
    const routes = extractRoutesFromAppTsx(appTsx);
    expect(routes).toHaveLength(0);
  });

  it('handles routes with dynamic params', () => {
    const appTsx = `<Route path="/users/:id" element={<UserDetail />} />`;
    const routes = extractRoutesFromAppTsx(appTsx);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/users/:id');
    expect(routes[0].component).toBe('UserDetail');
  });
});

// ── validateRouteFileExistence ──────────────────────────────────────────────

describe('validateRouteFileExistence', () => {
  it('no drift when all routes have backing files', () => {
    const routes = [
      makeRoute('/', 'pages/HomePage.tsx'),
      makeRoute('/about', 'pages/AboutPage.tsx'),
    ];
    const files = [
      makeBlueprint('pages/HomePage.tsx', ''),
      makeBlueprint('pages/AboutPage.tsx', ''),
      makeBlueprint('App.tsx', ''),
    ];
    const drifts = validateRouteFileExistence(routes, files);
    expect(drifts).toHaveLength(0);
  });

  it('detects missing-file: route references nonexistent file', () => {
    const routes = [
      makeRoute('/', 'pages/HomePage.tsx'),
      makeRoute('/ghost', 'pages/GhostPage.tsx'),
    ];
    const files = [makeBlueprint('pages/HomePage.tsx', '')];

    const drifts = validateRouteFileExistence(routes, files);
    const missing = drifts.filter(d => d.kind === 'missing-file');
    expect(missing).toHaveLength(1);
    expect(missing[0].filePath).toBe('pages/GhostPage.tsx');
  });

  it('detects orphan-page-file: page file with no route', () => {
    const routes = [makeRoute('/', 'pages/HomePage.tsx')];
    const files = [
      makeBlueprint('pages/HomePage.tsx', ''),
      makeBlueprint('pages/OrphanPage.tsx', ''),
    ];

    const drifts = validateRouteFileExistence(routes, files);
    const orphans = drifts.filter(d => d.kind === 'orphan-page-file');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].filePath).toBe('pages/OrphanPage.tsx');
  });
});

// ── validateAppTsxAgainstGraph ──────────────────────────────────────────────

describe('validateAppTsxAgainstGraph', () => {
  it('no drift when App.tsx and graph agree', () => {
    const appRoutes = [
      { path: '/', component: 'HomePage', isCatchAll: false },
      { path: '/about', component: 'AboutPage', isCatchAll: false },
    ];
    const graphRoutes = [
      makeRoute('/', 'pages/HomePage.tsx'),
      makeRoute('/about', 'pages/AboutPage.tsx'),
    ];
    const drifts = validateAppTsxAgainstGraph(appRoutes, graphRoutes);
    expect(drifts).toHaveLength(0);
  });

  it('detects app-tsx-extra-route: route in App.tsx not in graph', () => {
    const appRoutes = [
      { path: '/', component: 'HomePage', isCatchAll: false },
      { path: '/secret', component: 'SecretPage', isCatchAll: false },
    ];
    const graphRoutes = [makeRoute('/', 'pages/HomePage.tsx')];

    const drifts = validateAppTsxAgainstGraph(appRoutes, graphRoutes);
    const extra = drifts.filter(d => d.kind === 'app-tsx-extra-route');
    expect(extra).toHaveLength(1);
    expect(extra[0].path).toBe('/secret');
  });

  it('detects app-tsx-missing-route: graph route not in App.tsx', () => {
    const appRoutes = [{ path: '/', component: 'HomePage', isCatchAll: false }];
    const graphRoutes = [
      makeRoute('/', 'pages/HomePage.tsx'),
      makeRoute('/about', 'pages/AboutPage.tsx'),
    ];

    const drifts = validateAppTsxAgainstGraph(appRoutes, graphRoutes);
    const missing = drifts.filter(d => d.kind === 'app-tsx-missing-route');
    expect(missing).toHaveLength(1);
    expect(missing[0].path).toBe('/about');
  });

  it('ignores catch-all route (*)', () => {
    const appRoutes = [
      { path: '/', component: 'HomePage', isCatchAll: false },
      { path: '*', component: 'NotFound', isCatchAll: true },
    ];
    const graphRoutes = [makeRoute('/', 'pages/HomePage.tsx')];

    const drifts = validateAppTsxAgainstGraph(appRoutes, graphRoutes);
    // No drift — catch-all is structural, not a content route
    expect(drifts).toHaveLength(0);
  });
});

// ── validateRoutesJsonAgainstGraph ──────────────────────────────────────────

describe('validateRoutesJsonAgainstGraph', () => {
  it('no drift when routes.json and graph agree', () => {
    const jsonRoutes: RoutesJsonEntry[] = [
      { path: '/', filePath: 'pages/HomePage.tsx', title: 'Home', isHome: true },
      { path: '/about', filePath: 'pages/AboutPage.tsx', title: 'About', isHome: false },
    ];
    const graphRoutes = [
      makeRoute('/', 'pages/HomePage.tsx'),
      makeRoute('/about', 'pages/AboutPage.tsx'),
    ];
    const drifts = validateRoutesJsonAgainstGraph(jsonRoutes, graphRoutes);
    expect(drifts).toHaveLength(0);
  });

  it('detects path-mismatch: same file, different paths', () => {
    const jsonRoutes: RoutesJsonEntry[] = [
      { path: '/home', filePath: 'pages/HomePage.tsx', isHome: false },
    ];
    const graphRoutes = [makeRoute('/', 'pages/HomePage.tsx')];

    const drifts = validateRoutesJsonAgainstGraph(jsonRoutes, graphRoutes);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].kind).toBe('path-mismatch');
  });

  it('normalizes paths for comparison (strips src/)', () => {
    const jsonRoutes: RoutesJsonEntry[] = [
      { path: '/', filePath: 'src/pages/HomePage.tsx', isHome: true },
    ];
    const graphRoutes = [makeRoute('/', 'pages/HomePage.tsx')];

    const drifts = validateRoutesJsonAgainstGraph(jsonRoutes, graphRoutes);
    expect(drifts).toHaveLength(0); // src/ stripped, no drift
  });
});

// ── validateAllRouteLayers (integrated) ─────────────────────────────────────

describe('validateAllRouteLayers', () => {
  it('returns empty for single-page app (no routes in graph)', () => {
    const graph = fileMapToProjectGraph(
      { 'App.tsx': 'export default function App() { return <div>Hello</div>; }' },
      'proj-1', 'rev-1',
    );
    // Single-page: no pages/ files → no routes → skip validation
    expect(graph.routes).toHaveLength(0);
    const drifts = validateAllRouteLayers(graph);
    expect(drifts).toHaveLength(0);
  });

  it('multi-page: consistent layers → no drift', () => {
    const appTsx = `
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  );
}`;

    const routesJson = JSON.stringify({
      version: 1,
      routes: [
        { path: '/', filePath: 'pages/HomePage.tsx', title: 'Home', isHome: true },
        { path: '/about', filePath: 'pages/AboutPage.tsx', title: 'About', isHome: false },
      ],
    });

    const graph = fileMapToProjectGraph({
      'App.tsx': appTsx,
      'pages/HomePage.tsx': 'export default function HomePage() { return <div>Home</div>; }',
      'pages/AboutPage.tsx': 'export default function AboutPage() { return <div>About</div>; }',
      'routes.json': routesJson,
    }, 'proj-2', 'rev-2');

    // Graph should have 2 routes inferred from page files
    expect(graph.routes).toHaveLength(2);

    const drifts = validateAllRouteLayers(graph);
    expect(drifts).toHaveLength(0);
  });

  it('multi-page: drift detected across all layers', () => {
    const appTsx = `
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SecretPage from './pages/SecretPage';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/secret" element={<SecretPage />} />
      </Routes>
    </BrowserRouter>
  );
}`;

    // routes.json mentions /about but NOT /secret
    const routesJson = JSON.stringify({
      version: 1,
      routes: [
        { path: '/', filePath: 'pages/HomePage.tsx', title: 'Home', isHome: true },
        { path: '/about', filePath: 'pages/AboutPage.tsx', title: 'About', isHome: false },
      ],
    });

    // Files: HomePage exists, AboutPage exists (orphan — no App.tsx route),
    // SecretPage MISSING (referenced in App.tsx but no file)
    const graph = fileMapToProjectGraph({
      'App.tsx': appTsx,
      'pages/HomePage.tsx': 'export default function HomePage() { return <div>Home</div>; }',
      'pages/AboutPage.tsx': 'export default function AboutPage() { return <div>About</div>; }',
      'routes.json': routesJson,
    }, 'proj-3', 'rev-3');

    // Graph should have 2 routes: HomePage, AboutPage (from page files)
    expect(graph.routes).toHaveLength(2);

    const drifts = validateAllRouteLayers(graph);

    // Expected drifts:
    // 1. app-tsx-extra-route: /secret is in App.tsx but not in graph
    // 2. app-tsx-missing-route: /about is in graph but not in App.tsx
    // 3. Layer 3: routes.json has /about which IS in graph — no json drift for that
    //    But routes.json also has no entry for /about's graph route... wait:
    //    routes.json HAS /about, graph HAS /about → no json drift there
    //    routes.json does NOT have / at graph path... let me think:
    //    Graph: / (HomePage), /about (AboutPage)
    //    routes.json: / (HomePage), /about (AboutPage)
    //    → Layer 3 ↔ Layer 2: no drift (they agree)
    //    → Layer 1 ↔ Layer 2: /secret in App.tsx not in graph, /about in graph not in App.tsx

    const appExtra = drifts.filter(d => d.kind === 'app-tsx-extra-route');
    expect(appExtra.length).toBeGreaterThanOrEqual(1);
    expect(appExtra.some(d => d.path === '/secret')).toBe(true);

    const appMissing = drifts.filter(d => d.kind === 'app-tsx-missing-route');
    expect(appMissing.length).toBeGreaterThanOrEqual(1);
    expect(appMissing.some(d => d.path === '/about')).toBe(true);
  });

  it('detects routes.json ↔ graph drift (missing and extra entries)', () => {
    const routesJson = JSON.stringify({
      version: 1,
      routes: [
        { path: '/', filePath: 'pages/HomePage.tsx', title: 'Home', isHome: true },
        { path: '/ghost', filePath: 'pages/GhostPage.tsx', title: 'Ghost', isHome: false },
      ],
    });

    const graph = fileMapToProjectGraph({
      'App.tsx': 'export default function App() { return <div/>; }',
      'pages/HomePage.tsx': 'export default function HomePage() { return <div>Home</div>; }',
      'pages/AboutPage.tsx': 'export default function AboutPage() { return <div>About</div>; }',
      'routes.json': routesJson,
    }, 'proj-4', 'rev-4');

    // Graph routes: / (HomePage), /about (AboutPage)
    // routes.json: / (HomePage), /ghost (GhostPage)
    // Drift: /ghost in json not in graph, /about in graph not in json

    const drifts = validateAllRouteLayers(graph);

    const missingInJson = drifts.filter(d => d.kind === 'missing-in-json');
    expect(missingInJson.some(d => d.filePath === 'pages/AboutPage.tsx')).toBe(true);

    const missingInGraph = drifts.filter(d => d.kind === 'missing-in-graph');
    expect(missingInGraph.some(d => d.filePath === 'pages/GhostPage.tsx')).toBe(true);
  });
});

// ── parseRoutesJson ─────────────────────────────────────────────────────────

describe('parseRoutesJson', () => {
  it('parses valid routes.json', () => {
    const content = JSON.stringify({
      version: 1,
      routes: [
        { path: '/', filePath: 'pages/HomePage.tsx', title: 'Home', isHome: true },
        { path: '/about', filePath: 'pages/AboutPage.tsx', title: 'About' },
      ],
    });
    const result = parseRoutesJson(content);
    expect(result.ok).toBe(true);
    expect(result.shape!.routes).toHaveLength(2);
    expect(result.shape!.version).toBe(1);
  });

  it('rejects invalid JSON', () => {
    const result = parseRoutesJson('not json');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('not valid JSON');
  });

  it('rejects missing routes array', () => {
    const result = parseRoutesJson(JSON.stringify({ version: 1 }));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('routes'))).toBe(true);
  });

  it('rejects route entries without path', () => {
    const result = parseRoutesJson(JSON.stringify({
      version: 1,
      routes: [{ filePath: 'pages/Home.tsx' }],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('path'))).toBe(true);
  });
});

// ── Integration: fileMapToProjectGraph populates routes ─────────────────────

describe('fileMapToProjectGraph route population', () => {
  it('populates routes from page files in fileMap', () => {
    const graph = fileMapToProjectGraph({
      'App.tsx': '',
      'pages/HomePage.tsx': '',
      'pages/AboutPage.tsx': '',
      'pages/ContactPage.tsx': '',
      'components/Header.tsx': '',
      'index.css': '',
    }, 'proj-5', 'rev-5');

    expect(graph.routes).toHaveLength(3);
    expect(graph.routes.map(r => r.path).sort()).toEqual(['/', '/about', '/contact']);
  });

  it('sets empty routes for single-page app', () => {
    const graph = fileMapToProjectGraph({
      'App.tsx': '',
      'components/Button.tsx': '',
      'index.css': '',
    }, 'proj-6', 'rev-6');

    expect(graph.routes).toHaveLength(0);
  });
});

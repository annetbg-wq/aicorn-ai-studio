import { describe, expect, it, vi } from 'vitest';

import { runFinalPreviewAcceptanceHarness } from '../FinalPreviewAcceptanceHarness';
import {
  runRuntimeAcceptanceGate,
  type PreviewRuntimeAcceptanceDriver,
  type PreviewRuntimeDiagnostic,
  type PreviewRuntimeDiagnosticsSnapshot,
  type RuntimeAcceptanceResult,
} from '../PreviewRuntimeAcceptanceGate';
import type { RouteManifest } from '../RouteManifestService';
import type { FinalLivePreviewCheckResult } from '../WhiteScreenDetector';

const BUILD_ID = 'rev-runtime-1';

function makeWhiteScreenResult(
  overrides: Partial<FinalLivePreviewCheckResult> = {},
): FinalLivePreviewCheckResult {
  return {
    buildId: BUILD_ID,
    status: 'passed',
    reason: null,
    message: 'Final live-preview check passed.',
    controllerStatus: 'ready',
    controllerRevisionId: BUILD_ID,
    immediateBlank: false,
    probeOutcome: 'healthy',
    probeReason: null,
    ...overrides,
  };
}

function makeManifest(paths: string[]): RouteManifest {
  return {
    version: 1,
    layout: 'tabs',
    routes: paths.map((path, index) => ({
      path,
      component: index === 0 ? 'HomePage' : `Route${index}`,
      filePath: index === 0 ? 'pages/Home.tsx' : `pages/Route${index}.tsx`,
      title: index === 0 ? 'Home' : `Route ${index}`,
      isHome: path === '/',
      isProtected: false,
    })),
  };
}

function makeDiagnostic(
  kind: PreviewRuntimeDiagnostic['kind'],
  routePath: string,
  message: string,
): PreviewRuntimeDiagnostic {
  return {
    buildId: BUILD_ID,
    kind,
    message,
    routePath,
    locationHref: `http://localhost/preview/${BUILD_ID}#${routePath === '/' ? '/' : routePath}`,
    stack: null,
    timestamp: Date.now(),
  };
}

function makeSnapshot(
  overrides: Partial<PreviewRuntimeDiagnosticsSnapshot> = {},
): PreviewRuntimeDiagnosticsSnapshot {
  return {
    buildId: BUILD_ID,
    routePath: '/',
    locationHref: `http://localhost/preview/${BUILD_ID}#/`,
    pageErrors: [],
    consoleErrors: [],
    ...overrides,
  };
}

function makeDriver(
  overrides: Partial<PreviewRuntimeAcceptanceDriver> = {},
): PreviewRuntimeAcceptanceDriver {
  const manifest = makeManifest(['/', '/settings']);

  return {
    runWhiteScreenCheck: vi.fn().mockResolvedValue(makeWhiteScreenResult()),
    readRouteManifest: vi.fn().mockResolvedValue({
      status: 'ok',
      manifest,
      sourcePath: '/route-manifest.json',
    }),
    getDiagnostics: vi.fn().mockResolvedValue(makeSnapshot()),
    resetDiagnostics: vi.fn().mockResolvedValue(undefined),
    visitRoute: vi.fn().mockImplementation(async (_buildId: string, routePath: string) => (
      makeSnapshot({
        routePath,
        locationHref: `http://localhost/preview/${BUILD_ID}#${routePath === '/' ? '/' : routePath}`,
      })
    )),
    ...overrides,
  };
}

describe('runRuntimeAcceptanceGate', () => {
  it('passes when the mounted preview is healthy and every declared route stays clean', async () => {
    const driver = makeDriver();

    const result = await runRuntimeAcceptanceGate(BUILD_ID, driver);

    expect(result.status).toBe('passed');
    expect(result.checkedRoutes).toEqual(['/', '/settings']);
    expect(result.failure).toBeNull();
    expect(result.routeReports).toEqual([
      { routePath: '/', pageErrorCount: 0, consoleErrorCount: 0 },
      { routePath: '/settings', pageErrorCount: 0, consoleErrorCount: 0 },
    ]);
    expect(driver.resetDiagnostics).toHaveBeenCalledTimes(2);
    expect(driver.visitRoute).toHaveBeenNthCalledWith(1, BUILD_ID, '/');
    expect(driver.visitRoute).toHaveBeenNthCalledWith(2, BUILD_ID, '/settings');
  });

  it('fails fast when the white-screen check rejects the mounted preview', async () => {
    const driver = makeDriver({
      runWhiteScreenCheck: vi.fn().mockResolvedValue(makeWhiteScreenResult({
        status: 'failed',
        reason: 'blank_root',
        message: 'Final live-preview check failed: preview rendered blank root content.',
        probeOutcome: 'unhealthy',
      })),
    });

    const result = await runRuntimeAcceptanceGate(BUILD_ID, driver);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('white_screen');
    expect(result.failure?.message).toContain('blank root');
    expect(driver.readRouteManifest).not.toHaveBeenCalled();
  });

  it('fails when the mounted preview already recorded a page error before route traversal', async () => {
    const driver = makeDriver({
      getDiagnostics: vi.fn().mockResolvedValue(makeSnapshot({
        pageErrors: [
          makeDiagnostic('page-error', '/', 'ReferenceError: bootstrapCrashed is not defined'),
        ],
      })),
    });

    const result = await runRuntimeAcceptanceGate(BUILD_ID, driver);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('page_error');
    expect(result.failure?.message).toContain('initial mount');
    expect(result.failure?.message).toContain('bootstrapCrashed');
    expect(driver.visitRoute).not.toHaveBeenCalled();
  });

  it('fails when visiting a declared route emits console.error even if the app stays mounted', async () => {
    const driver = makeDriver({
      visitRoute: vi.fn()
        .mockResolvedValueOnce(makeSnapshot({ routePath: '/' }))
        .mockResolvedValueOnce(makeSnapshot({
          routePath: '/settings',
          consoleErrors: [
            makeDiagnostic('console-error', '/settings', 'Failed to load settings model'),
          ],
        })),
    });

    const result = await runRuntimeAcceptanceGate(BUILD_ID, driver);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('console_error');
    expect(result.failure?.routePath).toBe('/settings');
    expect(result.failure?.message).toContain('/settings');
    expect(result.failure?.message).toContain('console.error emitted');
  });

  it('fails when route-manifest.json is missing from the mounted preview', async () => {
    const driver = makeDriver({
      readRouteManifest: vi.fn().mockResolvedValue({
        status: 'missing',
        sourcePath: null,
      }),
    });

    const result = await runRuntimeAcceptanceGate(BUILD_ID, driver);

    expect(result.status).toBe('failed');
    expect(result.failure?.code).toBe('route_manifest_missing');
    expect(result.failure?.message).toContain('route-manifest.json is missing');
    expect(driver.getDiagnostics).not.toHaveBeenCalled();
  });
});

describe('runFinalPreviewAcceptanceHarness', () => {
  it('surfaces the runtime gate result as a failed acceptance harness verdict', async () => {
    const runtimeFailure: RuntimeAcceptanceResult = {
      status: 'failed',
      buildId: BUILD_ID,
      checkedRoutes: ['/'],
      routeReports: [
        { routePath: '/', pageErrorCount: 1, consoleErrorCount: 0 },
      ],
      whiteScreen: makeWhiteScreenResult(),
      manifestStatus: 'ok',
      initialDiagnostics: makeSnapshot(),
      failure: {
        code: 'route_crash',
        message: 'Runtime acceptance failed on route "/": Cannot read properties of undefined',
        routePath: '/',
        diagnostic: makeDiagnostic('page-error', '/', 'Cannot read properties of undefined'),
      },
    };

    const result = await runFinalPreviewAcceptanceHarness(BUILD_ID, {
      runRuntimeGate: vi.fn().mockResolvedValue(runtimeFailure),
    });

    expect(result.status).toBe('failed');
    expect(result.failedGate).toBe('runtime');
    expect(result.reasonCode).toBe('route_crash');
    expect(result.reasonMessage).toContain('Cannot read properties of undefined');
    expect(result.runtime).toBe(runtimeFailure);
  });
});

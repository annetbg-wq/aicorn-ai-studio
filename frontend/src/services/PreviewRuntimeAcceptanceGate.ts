import { appendPreviewSessionToUrl } from './PreviewSessionService';
import {
  MANIFEST_PATH,
  parseManifest,
  type RouteManifest,
} from './RouteManifestService';
import {
  runFinalLivePreviewCheck,
  type FinalLivePreviewCheckResult,
} from './WhiteScreenDetector';

const STUDIO_ORIGIN = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://aic-preview.local';

const RUNTIME_ACCEPTANCE_REQUEST = 'preview-runtime-acceptance-request';
const RUNTIME_ACCEPTANCE_RESULT = 'preview-runtime-acceptance-result';
const RUNTIME_ACCEPTANCE_TIMEOUT_MS = 5_000;
const PREVIEW_MANIFEST_CANDIDATES = [MANIFEST_PATH, '/src/route-manifest.json'] as const;

export type PreviewRuntimeDiagnosticKind =
  | 'page-error'
  | 'unhandled-rejection'
  | 'console-error';

export interface PreviewRuntimeDiagnostic {
  buildId: string;
  kind: PreviewRuntimeDiagnosticKind;
  message: string;
  routePath: string;
  locationHref: string;
  stack: string | null;
  timestamp: number;
}

export interface PreviewRuntimeDiagnosticsSnapshot {
  buildId: string;
  routePath: string;
  locationHref: string;
  pageErrors: PreviewRuntimeDiagnostic[];
  consoleErrors: PreviewRuntimeDiagnostic[];
}

export type RuntimeRouteManifestLoadResult =
  | {
      status: 'ok';
      manifest: RouteManifest;
      sourcePath: string;
    }
  | {
      status: 'missing' | 'invalid';
      sourcePath: string | null;
    };

export interface PreviewRuntimeAcceptanceDriver {
  runWhiteScreenCheck(buildId: string): Promise<FinalLivePreviewCheckResult>;
  readRouteManifest(buildId: string): Promise<RuntimeRouteManifestLoadResult>;
  getDiagnostics(buildId: string): Promise<PreviewRuntimeDiagnosticsSnapshot>;
  resetDiagnostics(buildId: string): Promise<void>;
  visitRoute(buildId: string, routePath: string): Promise<PreviewRuntimeDiagnosticsSnapshot>;
}

export type RuntimeAcceptanceFailureCode =
  | 'white_screen'
  | 'route_manifest_missing'
  | 'route_manifest_invalid'
  | 'page_error'
  | 'console_error'
  | 'route_crash';

export interface RuntimeAcceptanceFailure {
  code: RuntimeAcceptanceFailureCode;
  message: string;
  routePath?: string;
  diagnostic?: PreviewRuntimeDiagnostic | null;
}

export interface RuntimeRouteAcceptanceReport {
  routePath: string;
  pageErrorCount: number;
  consoleErrorCount: number;
}

export interface RuntimeAcceptanceResult {
  status: 'passed' | 'failed';
  buildId: string;
  checkedRoutes: string[];
  routeReports: RuntimeRouteAcceptanceReport[];
  whiteScreen: FinalLivePreviewCheckResult;
  manifestStatus: RuntimeRouteManifestLoadResult['status'];
  initialDiagnostics: PreviewRuntimeDiagnosticsSnapshot | null;
  failure: RuntimeAcceptanceFailure | null;
}

interface RuntimeAcceptanceBridgeResponse {
  type: typeof RUNTIME_ACCEPTANCE_RESULT;
  requestId: string;
  buildId: string;
  ok: boolean;
  snapshot?: PreviewRuntimeDiagnosticsSnapshot;
  error?: string;
}

export function normalizeAcceptanceRoutePath(routePath: string): string {
  const trimmed = routePath.trim();
  if (!trimmed || trimmed === '#' || trimmed === '#/' || trimmed === '/') {
    return '/';
  }

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const withLeadingSlash = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const normalized = collapsed === '/' ? '/' : collapsed.replace(/\/+$/, '');
  return normalized || '/';
}

export function collectAcceptanceRoutes(manifest: RouteManifest): string[] {
  const routes: string[] = [];
  const seen = new Set<string>();

  for (const entry of manifest.routes) {
    const normalized = normalizeAcceptanceRoutePath(entry.path);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    routes.push(normalized);
  }

  return routes.length > 0 ? routes : ['/'];
}

export function evaluateRuntimeDiagnosticsSnapshot(
  snapshot: PreviewRuntimeDiagnosticsSnapshot,
  phase: 'mount' | 'route',
): RuntimeAcceptanceFailure | null {
  const firstPageError = snapshot.pageErrors[0];
  if (firstPageError) {
    const routePath = normalizeAcceptanceRoutePath(firstPageError.routePath || snapshot.routePath || '/');
    const prefix = phase === 'route'
      ? `Runtime acceptance failed on route "${routePath}"`
      : 'Runtime acceptance failed during initial mount';
    return {
      code: phase === 'route' ? 'route_crash' : 'page_error',
      message: `${prefix}: ${truncateRuntimeMessage(firstPageError.message)}`,
      routePath,
      diagnostic: firstPageError,
    };
  }

  const firstConsoleError = snapshot.consoleErrors[0];
  if (firstConsoleError) {
    const routePath = normalizeAcceptanceRoutePath(firstConsoleError.routePath || snapshot.routePath || '/');
    const prefix = phase === 'route'
      ? `Runtime acceptance failed on route "${routePath}"`
      : 'Runtime acceptance failed during initial mount';
    return {
      code: 'console_error',
      message: `${prefix}: console.error emitted "${truncateRuntimeMessage(firstConsoleError.message)}"`,
      routePath,
      diagnostic: firstConsoleError,
    };
  }

  return null;
}

export async function runRuntimeAcceptanceGate(
  buildId: string,
  driver: PreviewRuntimeAcceptanceDriver,
): Promise<RuntimeAcceptanceResult> {
  const whiteScreen = await driver.runWhiteScreenCheck(buildId);
  if (whiteScreen.status === 'failed') {
    return {
      status: 'failed',
      buildId,
      checkedRoutes: [],
      routeReports: [],
      whiteScreen,
      manifestStatus: 'missing',
      initialDiagnostics: null,
      failure: {
        code: 'white_screen',
        message: whiteScreen.message,
        diagnostic: null,
      },
    };
  }

  const manifestResult = await driver.readRouteManifest(buildId);
  if (manifestResult.status !== 'ok') {
    const isMissing = manifestResult.status === 'missing';
    return {
      status: 'failed',
      buildId,
      checkedRoutes: [],
      routeReports: [],
      whiteScreen,
      manifestStatus: manifestResult.status,
      initialDiagnostics: null,
      failure: {
        code: isMissing ? 'route_manifest_missing' : 'route_manifest_invalid',
        message: isMissing
          ? 'Runtime acceptance failed: route-manifest.json is missing from the mounted preview.'
          : 'Runtime acceptance failed: route-manifest.json is invalid, so declared routes could not be exercised.',
        diagnostic: null,
      },
    };
  }

  const initialDiagnostics = await driver.getDiagnostics(buildId);
  const initialFailure = evaluateRuntimeDiagnosticsSnapshot(initialDiagnostics, 'mount');
  if (initialFailure) {
    return {
      status: 'failed',
      buildId,
      checkedRoutes: [],
      routeReports: [],
      whiteScreen,
      manifestStatus: manifestResult.status,
      initialDiagnostics,
      failure: initialFailure,
    };
  }

  const checkedRoutes = collectAcceptanceRoutes(manifestResult.manifest);
  const routeReports: RuntimeRouteAcceptanceReport[] = [];

  for (const routePath of checkedRoutes) {
    await driver.resetDiagnostics(buildId);
    const snapshot = await driver.visitRoute(buildId, routePath);
    routeReports.push({
      routePath,
      pageErrorCount: snapshot.pageErrors.length,
      consoleErrorCount: snapshot.consoleErrors.length,
    });

    const routeFailure = evaluateRuntimeDiagnosticsSnapshot(snapshot, 'route');
    if (routeFailure) {
      return {
        status: 'failed',
        buildId,
        checkedRoutes,
        routeReports,
        whiteScreen,
        manifestStatus: manifestResult.status,
        initialDiagnostics,
        failure: routeFailure,
      };
    }
  }

  return {
    status: 'passed',
    buildId,
    checkedRoutes,
    routeReports,
    whiteScreen,
    manifestStatus: manifestResult.status,
    initialDiagnostics,
    failure: null,
  };
}

export function createBrowserPreviewRuntimeAcceptanceDriver(): PreviewRuntimeAcceptanceDriver {
  return {
    runWhiteScreenCheck: runFinalLivePreviewCheck,
    readRouteManifest: readPreviewRouteManifest,
    getDiagnostics: async (buildId) => {
      const response = await postRuntimeAcceptanceRequest(buildId, 'snapshot');
      return response.snapshot ?? createEmptyDiagnosticsSnapshot(buildId);
    },
    resetDiagnostics: async (buildId) => {
      await postRuntimeAcceptanceRequest(buildId, 'reset-diagnostics');
    },
    visitRoute: async (buildId, routePath) => {
      const response = await postRuntimeAcceptanceRequest(buildId, 'visit-route', routePath);
      return response.snapshot ?? createEmptyDiagnosticsSnapshot(buildId, routePath);
    },
  };
}

async function readPreviewRouteManifest(buildId: string): Promise<RuntimeRouteManifestLoadResult> {
  let sawReadableManifest = false;
  let lastSourcePath: string | null = null;

  for (const candidatePath of PREVIEW_MANIFEST_CANDIDATES) {
    lastSourcePath = candidatePath;
    const url = appendPreviewSessionToUrl(`/preview/${buildId}${candidatePath}`);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1',
        },
      });
      if (!response.ok) continue;

      sawReadableManifest = true;
      const raw = await response.text();
      const manifest = parseManifest(raw);
      if (manifest) {
        return {
          status: 'ok',
          manifest,
          sourcePath: candidatePath,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    status: sawReadableManifest ? 'invalid' : 'missing',
    sourcePath: lastSourcePath,
  };
}

async function postRuntimeAcceptanceRequest(
  buildId: string,
  action: 'snapshot' | 'reset-diagnostics' | 'visit-route',
  routePath?: string,
): Promise<RuntimeAcceptanceBridgeResponse> {
  const iframe = findPreviewIframe(buildId);
  if (!iframe?.contentWindow) {
    throw new Error(`Runtime acceptance failed: preview iframe for ${buildId} is not available.`);
  }
  const targetWindow = iframe.contentWindow;

  const requestId = `${buildId}:${action}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      callback();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== STUDIO_ORIGIN) return;
      if (event.source !== targetWindow) return;
      const data = event.data as Partial<RuntimeAcceptanceBridgeResponse> | null;
      if (!data || data.type !== RUNTIME_ACCEPTANCE_RESULT) return;
      if (data.requestId !== requestId || data.buildId !== buildId) return;

      settle(() => {
        if (data.ok === false) {
          reject(new Error(data.error ?? 'Runtime acceptance bridge request failed.'));
          return;
        }
        resolve({
          type: RUNTIME_ACCEPTANCE_RESULT,
          requestId,
          buildId,
          ok: true,
          snapshot: data.snapshot,
          error: data.error,
        });
      });
    };

    const timer = window.setTimeout(() => {
      settle(() => reject(new Error(`Runtime acceptance bridge timed out while handling ${action}.`)));
    }, RUNTIME_ACCEPTANCE_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    targetWindow.postMessage(
      {
        type: RUNTIME_ACCEPTANCE_REQUEST,
        requestId,
        buildId,
        action,
        routePath,
      },
      STUDIO_ORIGIN,
    );
  });
}

function findPreviewIframe(buildId: string): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(
    `iframe[data-build-id="${buildId}"], iframe[data-testid="preview-iframe"], iframe[src*="/preview/${buildId}"]`,
  );
}

function createEmptyDiagnosticsSnapshot(
  buildId: string,
  routePath = '/',
): PreviewRuntimeDiagnosticsSnapshot {
  return {
    buildId,
    routePath,
    locationHref: '',
    pageErrors: [],
    consoleErrors: [],
  };
}

function truncateRuntimeMessage(message: string): string {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 217)}...`;
}

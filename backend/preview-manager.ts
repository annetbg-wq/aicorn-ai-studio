import express from 'express';
import fs from 'fs';
import path from 'path';
import * as core from './preview-manager-core';
import {
  DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
  fingerprintPreviewSession,
  getPrototypeRun,
  listPrototypeRuns,
  recordPreviewSessionBinding,
  restorePreviewSessionBindings,
  touchPinnedBuilds,
  upsertPrototypeRun,
  type PrototypeApiMode,
  type PrototypeRunKind,
  type PrototypeRunRetention,
  type PrototypeRunStatus,
} from './prototype-run-registry';

export * from './preview-manager-core';

const BUILDS_ROOT = path.resolve(__dirname, '..', 'builds');
const registryRouteApps = new WeakSet<express.Express>();
let bindingsRestored = false;

function restoreBindingsOnce(): void {
  if (bindingsRestored) return;
  bindingsRestored = true;
  const result = restorePreviewSessionBindings(
    (buildId, sessionToken) => core.bindPreviewBuildSession(buildId, sessionToken),
    BUILDS_ROOT,
  );
  if (result.restored > 0 || result.pruned > 0) {
    console.log(
      `[prototype-run-registry] restored=${result.restored} pruned=${result.pruned}`,
    );
  }
}

function normalizeHeaderToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length >= 16 && token.length <= 200 ? token : null;
}

function registerPrototypeRunRoutes(app: express.Express): void {
  if (registryRouteApps.has(app)) return;
  registryRouteApps.add(app);

  app.get('/api/prototype-runs', (_req, res) => {
    res.json({ schemaVersion: 1, runs: listPrototypeRuns() });
  });

  app.get('/api/prototype-runs/:runId', (req, res) => {
    const record = getPrototypeRun(req.params.runId);
    if (!record) return res.status(404).json({ error: 'Prototype run not found' });
    return res.json(record);
  });

  app.post(
    '/api/prototype-runs/:runId',
    express.json({ limit: '256kb' }),
    (req, res) => {
      const runId = req.params.runId;
      const token = normalizeHeaderToken(req.get('X-Preview-Session'));
      if (!token || !core.validatePreviewBuildSession(runId, token)) {
        return res.status(403).json({ error: 'Preview session does not own this prototype run' });
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as {
            apiMode?: PrototypeApiMode;
            skeletonId?: string;
            kind?: PrototypeRunKind;
            retention?: PrototypeRunRetention;
            status?: PrototypeRunStatus;
            qaSummary?: {
              passed: boolean;
              consoleErrorCount: number;
              pageErrorCount: number;
              brokenLinkCount: number;
              deadButtonCount: number;
              failedFlowCount: number;
            };
          }
        : {};

      try {
        const record = upsertPrototypeRun({
          runId,
          buildId: runId,
          apiMode: body.apiMode as PrototypeApiMode,
          skeletonId: body.skeletonId ?? '',
          kind: body.kind ?? 'generation',
          retention: body.retention ?? 'rolling',
          status: body.status ?? 'ready',
          sessionFingerprint: fingerprintPreviewSession(token),
          qaSummary: body.qaSummary,
        });
        touchPinnedBuilds(BUILDS_ROOT);
        return res.json(record);
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

export function registerPreviewBuildRoute(app: express.Express): void {
  restoreBindingsOnce();
  registerPrototypeRunRoutes(app);
  core.registerPreviewBuildRoute(app);
}

export function registerPreviewCompileRoute(app: express.Express): void {
  restoreBindingsOnce();

  app.use('/api/preview/:buildId/compile', (req, res, next) => {
    const buildId = req.params.buildId;
    const token = normalizeHeaderToken(req.get('X-Preview-Session'));

    // Persist ownership only after the canonical core compile route has accepted
    // the request and returned success. Persisting before core validation could
    // let a conflicting or malformed compile poison the restart binding store.
    if (token && /^[\w-]{8,}$/.test(buildId)) {
      res.once('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        if (!core.validatePreviewBuildSession(buildId, token)) return;
        try {
          recordPreviewSessionBinding(buildId, token);
        } catch (error) {
          console.warn(
            `[prototype-run-registry] failed to persist binding for ${buildId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      });
    }

    // The core compiler evicts by build-dir mtime. Refresh pinned directories
    // before the compile so pinned runs remain outside the oldest LRU cohort.
    touchPinnedBuilds(BUILDS_ROOT);
    next();
  });

  core.registerPreviewCompileRoute(app);
}

export function registerPreviewStatusRoute(app: express.Express): void {
  restoreBindingsOnce();
  core.registerPreviewStatusRoute(app);
}

export async function runCompileJob(
  ...args: Parameters<typeof core.runCompileJob>
): Promise<void> {
  restoreBindingsOnce();
  touchPinnedBuilds(BUILDS_ROOT);
  return core.runCompileJob(...args);
}

export function getPrototypeRunRegistryRoot(): string {
  return DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT;
}

export function prototypeRunRegistryExists(): boolean {
  return fs.existsSync(DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT);
}

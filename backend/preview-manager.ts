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
import {
  getPrototypeRunRemote,
  getRemoteArtifactManifest,
  listPrototypeRunsRemote,
  persistBuildArtifactRemote,
  persistPrototypeRunRemote,
  remotePrototypeDurabilityConfigured,
  restoreBuildArtifactRemote,
} from './prototype-run-remote';

export * from './preview-manager-core';

const BUILDS_ROOT = path.resolve(__dirname, '..', 'builds');
const registryRouteApps = new WeakSet<express.Express>();
const remoteHydratedBuilds = new Set<string>();
const remoteHydrationJobs = new Map<string, Promise<boolean>>();
let bindingsRestored = false;

function restoreBindingsOnce(): void {
  if (bindingsRestored) return;
  bindingsRestored = true;
  const result = restorePreviewSessionBindings(
    (buildId, sessionToken) => core.bindPreviewBuildSession(buildId, sessionToken),
    BUILDS_ROOT,
  );
  if (result.restored > 0 || result.pruned > 0) {
    console.log(`[prototype-run-registry] restored=${result.restored} pruned=${result.pruned}`);
  }
}

function normalizeHeaderToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length >= 16 && token.length <= 200 ? token : null;
}

async function ensureRemoteBuildHydrated(buildId: string): Promise<boolean> {
  if (!remotePrototypeDurabilityConfigured()) return false;
  if (!/^[\w-]{8,}$/.test(buildId)) return false;
  if (remoteHydratedBuilds.has(buildId) && fs.existsSync(path.join(BUILDS_ROOT, buildId))) return true;

  const existingJob = remoteHydrationJobs.get(buildId);
  if (existingJob) return existingJob;

  const job = (async () => {
    const buildPath = path.join(BUILDS_ROOT, buildId);
    const manifest = fs.existsSync(buildPath)
      ? await getRemoteArtifactManifest(buildId)
      : await restoreBuildArtifactRemote(buildId, BUILDS_ROOT);
    if (!manifest) return false;

    const binding = core.bindPreviewBuildSession(buildId, manifest.sessionToken);
    if (binding === 'conflict') throw new Error(`remote preview binding conflict for ${buildId}`);
    recordPreviewSessionBinding(buildId, manifest.sessionToken);
    if (!core.getPreviewBuildStatus(buildId)) {
      core.setPreviewBuildStatus({
        buildId,
        status: 'ready',
        previewPath: `/preview/${buildId}`,
        updatedAt: new Date().toISOString(),
      });
    }
    remoteHydratedBuilds.add(buildId);
    return true;
  })().finally(() => remoteHydrationJobs.delete(buildId));

  remoteHydrationJobs.set(buildId, job);
  return job;
}

function registerPrototypeRunRoutes(app: express.Express): void {
  if (registryRouteApps.has(app)) return;
  registryRouteApps.add(app);

  app.get('/api/prototype-runs', async (_req, res) => {
    try {
      const runs = remotePrototypeDurabilityConfigured()
        ? await listPrototypeRunsRemote()
        : listPrototypeRuns();
      return res.json({ schemaVersion: 1, runs });
    } catch (error) {
      return res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/prototype-runs/:runId', async (req, res) => {
    try {
      const record = remotePrototypeDurabilityConfigured()
        ? await getPrototypeRunRemote(req.params.runId)
        : getPrototypeRun(req.params.runId);
      if (!record) return res.status(404).json({ error: 'Prototype run not found' });
      return res.json(record);
    } catch (error) {
      return res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(
    '/api/prototype-runs/:runId',
    express.json({ limit: '256kb' }),
    async (req, res) => {
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
        if (remotePrototypeDurabilityConfigured()) await persistPrototypeRunRemote(record);
        return res.json(record);
      } catch (error) {
        return res.status(remotePrototypeDurabilityConfigured() ? 502 : 400).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

export function registerPreviewBuildRoute(app: express.Express): void {
  restoreBindingsOnce();
  registerPrototypeRunRoutes(app);

  app.use('/preview/:buildId', async (req, res, next) => {
    if (!remotePrototypeDurabilityConfigured()) return next();
    try {
      await ensureRemoteBuildHydrated(req.params.buildId);
      return next();
    } catch (error) {
      console.warn('[prototype-run-remote] hydrate failed:', error instanceof Error ? error.message : String(error));
      return res.status(503).send('Durable preview restore failed');
    }
  });

  core.registerPreviewBuildRoute(app);
}

export function registerPreviewCompileRoute(app: express.Express): void {
  restoreBindingsOnce();

  app.use('/api/preview/:buildId/compile', (req, res, next) => {
    const buildId = req.params.buildId;
    const token = normalizeHeaderToken(req.get('X-Preview-Session'));
    const originalJson = res.json.bind(res);

    if (token && /^[\w-]{8,}$/.test(buildId)) {
      res.json = ((body: any) => {
        if (!body?.success || res.statusCode < 200 || res.statusCode >= 300) return originalJson(body);

        void (async () => {
          if (!core.validatePreviewBuildSession(buildId, token)) {
            throw new Error('canonical preview ownership disappeared before durability commit');
          }
          recordPreviewSessionBinding(buildId, token);

          if (remotePrototypeDurabilityConfigured()) {
            await persistBuildArtifactRemote(
              buildId,
              path.join(BUILDS_ROOT, buildId),
              token,
              fingerprintPreviewSession(token),
            );
            remoteHydratedBuilds.add(buildId);
          }
          originalJson(body);
        })().catch(error => {
          const message = error instanceof Error ? error.message : String(error);
          core.setPreviewBuildStatus({
            buildId,
            status: 'failed',
            error: `External durability failed: ${message}`,
            updatedAt: new Date().toISOString(),
          });
          if (!res.headersSent) {
            res.status(502);
            originalJson({ success: false, buildId, error: `External durability failed: ${message}` });
          }
        });
        return res;
      }) as typeof res.json;
    }

    touchPinnedBuilds(BUILDS_ROOT);
    next();
  });

  core.registerPreviewCompileRoute(app);
}

export function registerPreviewStatusRoute(app: express.Express): void {
  restoreBindingsOnce();
  app.use('/api/preview/:buildId/status', async (req, res, next) => {
    if (!remotePrototypeDurabilityConfigured() || core.getPreviewBuildStatus(req.params.buildId)) return next();
    try {
      await ensureRemoteBuildHydrated(req.params.buildId);
      return next();
    } catch (error) {
      return res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  core.registerPreviewStatusRoute(app);
}

export async function runCompileJob(...args: Parameters<typeof core.runCompileJob>): Promise<void> {
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

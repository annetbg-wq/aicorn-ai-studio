import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fingerprintPreviewSession,
  getPrototypeRun,
  listPrototypeRuns,
  pruneMissingPreviewSessionBindings,
  readStoredPreviewSessionToken,
  recordPreviewSessionBinding,
  restorePreviewSessionBindings,
  setPrototypeRunRetention,
  touchPinnedBuilds,
  upsertPrototypeRun,
} from './prototype-run-registry';

const roots: string[] = [];

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function createBuild(buildsRoot: string, buildId: string): string {
  const buildPath = path.join(buildsRoot, buildId);
  fs.mkdirSync(buildPath, { recursive: true });
  fs.writeFileSync(path.join(buildPath, 'index.html'), '<main>preview</main>');
  return buildPath;
}

function runInput(runId: string, token: string, retention: 'rolling' | 'pinned' = 'rolling') {
  return {
    runId,
    apiMode: 'mock' as const,
    skeletonId: 'landing-page',
    kind: 'reference' as const,
    retention,
    status: 'ready' as const,
    sessionFingerprint: fingerprintPreviewSession(token),
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('durable prototype run registry', () => {
  it('restores preview-session ownership after a simulated backend restart', () => {
    const registryRoot = tempRoot('prototype-registry-');
    const buildsRoot = tempRoot('prototype-builds-');
    const buildId = 'restart-build-001';
    const staleBuildId = 'stale-build-002';
    const token = 'restart-session-token-1234567890';
    const staleToken = 'stale-session-token-123456789012';

    createBuild(buildsRoot, buildId);
    createBuild(buildsRoot, staleBuildId);
    recordPreviewSessionBinding(buildId, token, registryRoot);
    recordPreviewSessionBinding(staleBuildId, staleToken, registryRoot);

    // Process exits: in-memory previewSessionBindings disappears. The stale build
    // is also evicted from disk before the next process starts.
    fs.rmSync(path.join(buildsRoot, staleBuildId), { recursive: true, force: true });

    const rebound = new Map<string, string>();
    const restored = restorePreviewSessionBindings(
      (id, restoredToken) => rebound.set(id, restoredToken),
      buildsRoot,
      registryRoot,
    );

    expect(restored).toEqual({ restored: 1, pruned: 1 });
    expect(rebound.get(buildId)).toBe(token);
    expect(rebound.has(staleBuildId)).toBe(false);
    expect(readStoredPreviewSessionToken(buildId, registryRoot)).toBe(token);
    expect(readStoredPreviewSessionToken(staleBuildId, registryRoot)).toBeNull();
  });

  it('keeps raw preview capabilities only in the private binding store', () => {
    const registryRoot = tempRoot('prototype-registry-secret-');
    const runId = 'secure-run-0001';
    const token = 'secure-preview-session-token-123456';

    recordPreviewSessionBinding(runId, token, registryRoot);
    upsertPrototypeRun(runInput(runId, token), registryRoot);

    const publicRun = getPrototypeRun(runId, registryRoot);
    expect(publicRun?.sessionFingerprint).toBe(fingerprintPreviewSession(token));
    expect(JSON.stringify(publicRun)).not.toContain(token);

    const runsFile = fs.readFileSync(path.join(registryRoot, 'runs.json'), 'utf8');
    const bindingsFile = fs.readFileSync(
      path.join(registryRoot, 'preview-session-bindings.json'),
      'utf8',
    );
    expect(runsFile).not.toContain(token);
    expect(bindingsFile).toContain(token);

    if (process.platform !== 'win32') {
      expect(fs.statSync(registryRoot).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(registryRoot, 'runs.json')).mode & 0o777).toBe(0o600);
      expect(
        fs.statSync(path.join(registryRoot, 'preview-session-bindings.json')).mode & 0o777,
      ).toBe(0o600);
    }
  });

  it('bounds rolling metadata while pinned runs survive registry cleanup', () => {
    const registryRoot = tempRoot('prototype-registry-retention-');
    const token = 'retention-preview-session-token-1234';

    upsertPrototypeRun(runInput('pinned-run-0001', token, 'pinned'), registryRoot, 2);
    upsertPrototypeRun(runInput('rolling-run-0001', token), registryRoot, 2);
    upsertPrototypeRun(runInput('rolling-run-0002', token), registryRoot, 2);
    upsertPrototypeRun(runInput('rolling-run-0003', token), registryRoot, 2);

    const runs = listPrototypeRuns(registryRoot);
    expect(runs.filter(run => run.retention === 'pinned').map(run => run.runId)).toEqual([
      'pinned-run-0001',
    ]);
    expect(runs.filter(run => run.retention === 'rolling')).toHaveLength(2);
    expect(runs).toHaveLength(3);
  });

  it('refreshes pinned build mtimes before the core LRU cleanup runs', () => {
    const registryRoot = tempRoot('prototype-registry-pin-');
    const buildsRoot = tempRoot('prototype-build-pin-');
    const runId = 'pinned-build-0001';
    const token = 'pinned-preview-session-token-123456';
    const buildPath = createBuild(buildsRoot, runId);

    upsertPrototypeRun(runInput(runId, token), registryRoot);
    setPrototypeRunRetention(runId, 'pinned', registryRoot);

    const old = new Date('2000-01-01T00:00:00.000Z');
    fs.utimesSync(buildPath, old, old);
    const before = fs.statSync(buildPath).mtimeMs;

    expect(touchPinnedBuilds(buildsRoot, registryRoot)).toBe(1);
    expect(fs.statSync(buildPath).mtimeMs).toBeGreaterThan(before);
  });

  it('prunes bindings only when the corresponding immutable build is gone', () => {
    const registryRoot = tempRoot('prototype-registry-prune-');
    const buildsRoot = tempRoot('prototype-build-prune-');
    const token = 'binding-prune-session-token-123456';

    createBuild(buildsRoot, 'live-build-0001');
    recordPreviewSessionBinding('live-build-0001', token, registryRoot);
    recordPreviewSessionBinding('gone-build-0002', token, registryRoot);

    expect(pruneMissingPreviewSessionBindings(buildsRoot, registryRoot)).toBe(1);
    expect(readStoredPreviewSessionToken('live-build-0001', registryRoot)).toBe(token);
    expect(readStoredPreviewSessionToken('gone-build-0002', registryRoot)).toBeNull();
  });
});

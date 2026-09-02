// @ts-check
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { recordExistingPrototypeRunQa } = require('../scripts/prototype-run-qa.cjs');

const BASE_URL = process.env.STUDIO_URL || 'http://localhost:5183';
const BUILDS_DIR = path.resolve(__dirname, '..', 'builds');
const ARCHIVE_ROOT = path.resolve(process.cwd(), '.prototype-runs');
const SERVER_REGISTRY_ROOT = path.resolve(
  process.cwd(),
  process.env.AIC_PROTOTYPE_RUN_REGISTRY_DIR || '.prototype-run-registry',
);

test.setTimeout(180_000);

async function readCanaryMarker(buildDir) {
  const assetsDir = path.join(buildDir, 'assets');
  let entries;
  try {
    entries = await fs.readdir(assetsDir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:js|mjs)$/i.test(entry.name)) continue;
    const content = await fs.readFile(path.join(assetsDir, entry.name), 'utf8').catch(() => '');
    if (content.includes('Live preview canary') && content.includes('Counter ready')) return true;
  }
  return false;
}

async function findLatestGeneratedCanaryBuild() {
  const entries = await fs.readdir(BUILDS_DIR, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(BUILDS_DIR, entry.name);
    const stat = await fs.stat(fullPath);
    candidates.push({ buildId: entry.name, fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of candidates) {
    if (await readCanaryMarker(candidate.fullPath)) return candidate.buildId;
  }
  throw new Error('No generated Live Preview Canary build found. Run test:e2e:preview-live before this gate.');
}

async function readPersistedPreviewSession(buildId) {
  const bindingPath = path.join(SERVER_REGISTRY_ROOT, 'preview-session-bindings.json');
  const state = JSON.parse(await fs.readFile(bindingPath, 'utf8'));
  const token = state?.bindings?.[buildId]?.sessionToken;
  if (typeof token !== 'string' || token.length < 16) {
    throw new Error(`No durable preview-session binding found for generated build ${buildId}`);
  }
  return token;
}

test('real reference generation survives backend restart and becomes a persisted interactive run', async ({ page }) => {
  const buildId = await findLatestGeneratedCanaryBuild();

  // The preceding preview-live command has exited, which terminates its backend.
  // This Playwright command starts a fresh backend process. The only valid token
  // is therefore the one persisted server-side during the original compile and
  // restored into the new preview-manager process at startup.
  const sessionId = await readPersistedPreviewSession(buildId);

  const result = await recordExistingPrototypeRunQa({
    page,
    buildId,
    sessionId,
    apiMode: 'mock',
    skeletonId: 'landing-page',
    archiveRoot: ARCHIVE_ROOT,
    maxRuns: 10,
    kind: 'reference',
    retention: 'rolling',
    flows: [
      {
        name: 'generated counter increments',
        steps: [
          { action: 'expectVisible', selector: '[data-testid="live-canary-surface"]' },
          { action: 'click', selector: 'button:has-text("Increment")' },
          { action: 'expectText', selector: '[data-testid="count-value"]', value: '1' },
        ],
      },
    ],
  });

  expect(result.runId).toBe(buildId);
  expect(result.buildId).toBe(buildId);
  expect(result.report.passed).toBe(true);
  expect(result.report.consoleErrors).toEqual([]);
  expect(result.report.pageErrors).toEqual([]);
  expect(result.report.brokenLinks).toEqual([]);
  expect(result.report.deadButtons).toEqual([]);
  expect(result.report.flows).toEqual([
    expect.objectContaining({ name: 'generated counter increments', status: 'passed' }),
  ]);

  const manifest = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'));
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.runId).toBe(buildId);
  expect(manifest.buildId).toBe(buildId);
  expect(manifest.apiMode).toBe('mock');
  expect(manifest.skeletonId).toBe('landing-page');
  expect(manifest.status).toBe('ready');
  expect(manifest.previewPath).toBe(`/preview/${buildId}/`);
  expect(manifest.sessionFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.sessionId).toBeUndefined();
  expect(JSON.stringify(manifest)).not.toContain(sessionId);

  const registryResponse = await page.request.get(`${BASE_URL}/api/prototype-runs/${buildId}`);
  expect(registryResponse.ok()).toBe(true);
  const registryRun = await registryResponse.json();
  expect(registryRun).toEqual(expect.objectContaining({
    schemaVersion: 1,
    runId: buildId,
    buildId,
    apiMode: 'mock',
    skeletonId: 'landing-page',
    kind: 'reference',
    retention: 'rolling',
    status: 'ready',
    previewPath: `/preview/${buildId}/`,
    sessionFingerprint: manifest.sessionFingerprint,
    qaSummary: expect.objectContaining({ passed: true, failedFlowCount: 0 }),
  }));
  expect(JSON.stringify(registryRun)).not.toContain(sessionId);
});

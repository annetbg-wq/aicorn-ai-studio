// @ts-check
'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { recordExistingPrototypeRunQa } = require('../scripts/prototype-run-qa.cjs');

const BUILDS_DIR = path.resolve(__dirname, '..', 'builds');
const ARCHIVE_ROOT = path.resolve(process.cwd(), '.prototype-runs');

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

test('real reference generation becomes a persisted interactive prototype run', async ({ page }) => {
  const buildId = await findLatestGeneratedCanaryBuild();
  const sessionId = `reference-generated-session-${crypto.randomUUID()}`;

  // The live-canary Playwright process has ended, so the backend session map was
  // intentionally restarted before this test. The immutable generated build is
  // retained on disk and is QA'd here; session-binding isolation itself is
  // independently covered by preview-session-smoke and persistent-prototype-run.
  const result = await recordExistingPrototypeRunQa({
    page,
    buildId,
    sessionId,
    apiMode: 'mock',
    skeletonId: 'landing-page',
    archiveRoot: ARCHIVE_ROOT,
    maxRuns: 10,
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
});

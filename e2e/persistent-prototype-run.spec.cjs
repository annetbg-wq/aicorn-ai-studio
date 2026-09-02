// @ts-check
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { assertApiMode, assertSkeletonId, runPrototypeQa } = require('../scripts/prototype-run-qa.cjs');

const ARCHIVE_ROOT = path.resolve(process.cwd(), '.prototype-runs');

const FILES = {
  'src/App.tsx': [
    "import { useState } from 'react';",
    '',
    'export default function App() {',
    '  const [count, setCount] = useState(0);',
    '  return (',
    '    <main data-testid="prototype-root">',
    '      <h1>Persistent Prototype</h1>',
    '      <p data-testid="count-value">{count}</p>',
    '      <button type="button" onClick={() => setCount(value => value + 1)}>Increment</button>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
};

test.describe('Step 8 persistent prototype run', () => {
  test('requires explicit API mode and skeleton isolation', async () => {
    expect(() => assertApiMode(undefined)).toThrow(/explicitly "mock" or "staging"/i);
    expect(assertApiMode('mock')).toBe('mock');
    expect(assertApiMode('staging')).toBe('staging');
    expect(() => assertSkeletonId(undefined)).toThrow(/explicit skeletonId/i);
    expect(assertSkeletonId('landing-page')).toBe('landing-page');
  });

  test('creates an isolated saved run and passes interactive QA', async ({ page }) => {
    const result = await runPrototypeQa({
      page,
      files: FILES,
      apiMode: 'mock',
      skeletonId: 'landing-page',
      archiveRoot: ARCHIVE_ROOT,
      maxRuns: 3,
      flows: [
        {
          name: 'counter increments',
          steps: [
            { action: 'expectVisible', selector: '[data-testid="prototype-root"]' },
            { action: 'click', selector: 'button:has-text("Increment")' },
            { action: 'expectText', selector: '[data-testid="count-value"]', value: '1' },
          ],
        },
      ],
    });

    expect(result.report.passed).toBe(true);
    expect(result.report.consoleErrors).toEqual([]);
    expect(result.report.pageErrors).toEqual([]);
    expect(result.report.brokenLinks).toEqual([]);
    expect(result.report.deadButtons).toEqual([]);
    expect(result.report.flows).toEqual([
      expect.objectContaining({ name: 'counter increments', status: 'passed' }),
    ]);

    const manifest = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'));
    expect(manifest.runId).toBe(result.runId);
    expect(manifest.buildId).toBe(result.runId);
    expect(manifest.apiMode).toBe('mock');
    expect(manifest.skeletonId).toBe('landing-page');
    expect(manifest.status).toBe('ready');
    expect(manifest.previewUrl).toContain(`/preview/${result.runId}/`);

    const entries = await fs.readdir(ARCHIVE_ROOT, { withFileTypes: true });
    expect(entries.filter(entry => entry.isDirectory()).length).toBeLessThanOrEqual(3);
  });
});

/**
 * eval-admin-s21b.mjs — launcher for the S2.1-b admin-users export-integrity probe.
 *
 * Delegates to vitest (same mechanism as eval-baseline.mjs) so TypeScript imports
 * resolve correctly. Runs eval-admin-s21b.runner.test.ts via vitest.eval.config.ts.
 *
 * Usage (from repo root or frontend/):
 *   node frontend/scripts/eval-admin-s21b.mjs
 *
 * Requires: DEEPSEEK_API_KEY in .env.local
 * Output:   diag-admin-s21b.json (repo root — gitignored)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const vitestCli   = path.join(frontendDir, 'node_modules', 'vitest', 'vitest.mjs');

const child = spawnSync(
  process.execPath,
  [
    vitestCli,
    'run',
    'scripts/eval-admin-s21b.runner.test.ts',
    '--config=vitest.eval.config.ts',
    '--reporter=verbose',
  ],
  {
    cwd:   frontendDir,
    stdio: 'inherit',
    env:   { ...process.env },
  },
);

process.exit(child.status ?? 1);

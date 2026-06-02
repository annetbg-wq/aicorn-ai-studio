/**
 * benchmark-gate.mjs — compatibility wrapper.
 *
 * Prefer `npm run eval:gate`; this file remains so older CI/scripts keep working.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const evalGate = path.join(frontendDir, 'scripts', 'eval-gate.mjs');

const out = spawnSync(process.execPath, [evalGate, ...process.argv.slice(2)], {
  cwd: frontendDir,
  stdio: 'inherit',
  env: process.env,
});

process.exit(out.status ?? 1);

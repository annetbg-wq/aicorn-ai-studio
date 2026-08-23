import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const vitestCli = path.join(frontendDir, 'node_modules', 'vitest', 'vitest.mjs');

function parseSuiteArg(argv, fallback = process.env.BENCHMARK_SUITE ?? 'fast') {
  const suiteIndex = argv.findIndex((arg) => arg === '--suite');
  if (suiteIndex >= 0) {
    return argv[suiteIndex + 1] ?? fallback;
  }

  const inline = argv.find((arg) => arg.startsWith('--suite='));
  if (inline) {
    return inline.slice('--suite='.length) || fallback;
  }

  return fallback;
}

const suite = parseSuiteArg(process.argv.slice(2));
const child = spawnSync(
  process.execPath,
  [
    vitestCli,
    'run',
    'scripts/eval-gate.runner.test.ts',
    '--config=vitest.eval.config.ts',
    '--reporter=verbose',
  ],
  {
    cwd: frontendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      BENCHMARK_SUITE: suite,
    },
  },
);

process.exit(child.status ?? 1);

import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const vitestCli = path.join(frontendDir, 'node_modules', 'vitest', 'vitest.mjs');

function parseSuiteArg(argv, fallback = process.env.BENCHMARK_SUITE ?? 'all') {
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

function hasFlag(argv, name) {
  return argv.includes(name);
}

function readOption(argv, name, fallback = '') {
  const directIndex = argv.findIndex((arg) => arg === name);
  if (directIndex >= 0) {
    return argv[directIndex + 1] ?? fallback;
  }

  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1) || fallback;
  }

  return fallback;
}

const argv = process.argv.slice(2);
const suite = parseSuiteArg(argv);
const diagnosticDump = hasFlag(argv, '--diagnostic-dump');
const diagnosticOnly = hasFlag(argv, '--diagnostic-only');
const diagnosticPath = readOption(argv, '--diagnostic-path', '');
const child = spawnSync(
  process.execPath,
  [
    vitestCli,
    'run',
    'scripts/eval-baseline.runner.test.ts',
    '--config=vitest.eval.config.ts',
    '--reporter=verbose',
  ],
  {
    cwd: frontendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      BENCHMARK_SUITE: suite,
      ...(diagnosticDump ? { BENCHMARK_DIAGNOSTIC_DUMP: '1' } : {}),
      ...(diagnosticOnly ? { BENCHMARK_DIAGNOSTIC_ONLY: '1' } : {}),
      ...(diagnosticPath ? { BENCHMARK_DIAGNOSTIC_PATH: diagnosticPath } : {}),
    },
  },
);

process.exit(child.status ?? 1);

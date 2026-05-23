// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const configServiceMock = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  getKeyForAgent: vi.fn(),
  getAgentConfig: vi.fn(),
}));

const orchestratorMock = vi.hoisted(() => ({
  getEndpoint: vi.fn(),
  normalizeModelId: vi.fn(),
}));

vi.mock('../../../components/BenchmarkDashboard', () => ({
  BenchmarkDashboard: () => null,
}));

vi.mock('../../../services/ConfigService', () => ({
  ConfigService: configServiceMock,
}));

vi.mock('../../../services/Orchestrator', () => ({
  Orchestrator: orchestratorMock,
}));

import QualityPanel from '../QualityPanel';

const STEP_DEFS_LABELS = [
  'Canary',
  'Idea Validate',
  'Architecture',
  'Code Delta',
  'Compile',
  'Preview HTTP',
  'Preview Mounted',
  'Save Ready',
  'No Premature Save',
  'Architect Real',
] as const;

const STEP_DEFS_IDS = [
  'canary',
  'idea-validate',
  'architecture',
  'code-delta',
  'compile',
  'preview-http',
  'preview-mounted',
  'save-ready',
  'no-premature-save',
  'architect-real',
] as const;

function makeJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function qualityStorageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith('quality.')) keys.push(key);
  }
  return keys.sort();
}

function clickFlowRun(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Run ${label}` }));
}

function openClearMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
}

function clickClearAction(label: 'Clear Flow Chain' | 'Clear Preflight' | 'Clear All Quality State') {
  openClearMenu();
  fireEvent.click(screen.getByRole('button', { name: label }));
}

function seedPassingFlowChainHistory() {
  const timestamp = '2026-05-19T00:00:00.000Z';
  for (const id of STEP_DEFS_IDS) {
    localStorage.setItem(`quality.test.${id}`, JSON.stringify([
      {
        timestamp,
        status: 'pass',
        duration_ms: 5,
      },
    ]));
  }
  localStorage.setItem('quality.lastRunAll', timestamp);
}

describe('QualityPanel flow-chain baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('writes Idea Validate history after a successful single run', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/quality/test/idea-validate');
      return makeJsonResponse({
        status: 'pass',
        duration_ms: 12,
        summary: '43 chars OK',
        details: {
          prompt: 'Habit tracker: daily check-ins, streak, stats',
          length: 43,
          valid: true,
        },
        warnings: ['Fixture data - not real LLM output'],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    clickFlowRun('Idea Validate');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(localStorage.getItem('quality.test.idea-validate')).toContain('"status":"pass"');
    });

    const history = localStorage.getItem('quality.test.idea-validate');
    expect(history).toContain('"status":"pass"');
    expect(history).toContain('"duration_ms":12');
  });

  it('passes the Code Delta buildId to Compile in the step chain', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/quality/test/code-delta') {
        return makeJsonResponse({
          status: 'pass',
          duration_ms: 34,
          summary: 'compiled OK, buildId: qt-build',
          details: {
            buildId: 'qt-build',
            files: [{ path: 'src/pages/Home.tsx', size: 42, content: 'export default function Home(){return null;}' }],
          },
        });
      }

      if (url === '/api/quality/test/compile?buildId=qt-build') {
        return makeJsonResponse({
          status: 'pass',
          duration_ms: 21,
          summary: 'build: qt-build, 2 asset(s)',
          details: {
            buildId: 'qt-build',
            assets: [
              { name: 'index.js', size: 111 },
              { name: 'index.css', size: 22 },
            ],
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    clickFlowRun('Code Delta');
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/quality/test/code-delta')).toBe(true));

    clickFlowRun('Compile');
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/quality/test/compile?buildId=qt-build')).toBe(true));
    await waitFor(() => {
      expect(localStorage.getItem('quality.test.compile')).toContain('"status":"pass"');
    });
  });

  it('stops Run All at the first failing step', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/quality/test/canary') {
        return makeJsonResponse({
          status: 'pass',
          duration_ms: 5,
          summary: 'HTTP 200, provider: claude',
          details: { httpStatus: 200, response: { status: 'ok', provider: 'claude' } },
        });
      }
      if (url === '/api/quality/test/idea-validate') {
        return makeJsonResponse({
          status: 'fail',
          duration_ms: 8,
          error: 'Too short: 5 chars (need > 10)',
        });
      }
      throw new Error(`Unexpected fetch after failure: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Run All' })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/quality/test/canary',
      '/api/quality/test/idea-validate',
    ]);
    expect(screen.getAllByText('Too short: 5 chars (need > 10)').length).toBeGreaterThan(0);
  });

  it('clears visible results, run metadata, and all quality localStorage keys', async () => {
    localStorage.setItem('quality.compare.last', '{"stale":true}');
    localStorage.setItem('quality.real-suite.last', '{"stale":true}');
    localStorage.setItem('quality.benchmark.last', '{"stale":true}');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/quality/test/canary') {
        return makeJsonResponse({
          status: 'pass',
          duration_ms: 5,
          summary: 'HTTP 200, provider: claude',
          details: { httpStatus: 200, response: { status: 'ok', provider: 'claude' } },
        });
      }
      if (url === '/api/quality/test/idea-validate') {
        return makeJsonResponse({
          status: 'fail',
          duration_ms: 8,
          error: 'Too short: 5 chars (need > 10)',
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Run All' }));

    await waitFor(() => expect(screen.getAllByText('stopped at idea-validate').length).toBeGreaterThan(0));
    expect(screen.getAllByText('1/10').length).toBeGreaterThan(0);
    expect(localStorage.getItem('quality.lastRunAll')).toBeTruthy();
    expect(localStorage.getItem('quality.test.canary')).toContain('"status":"pass"');

    clickClearAction('Clear All Quality State');

    expect(qualityStorageKeys()).toEqual([]);
    expect(screen.queryAllByText('1/10')).toHaveLength(0);
    expect(screen.queryAllByText('stopped at idea-validate')).toHaveLength(0);
    expect(screen.getByText(/Clear All Quality State/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run All' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Run All' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it('stops a running Run All, ignores late results, and allows rerun', async () => {
    const firstCanary = makeDeferred<Response>();
    let canaryCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/quality/test/canary') {
        canaryCalls += 1;
        if (canaryCalls === 1) return firstCanary.promise;
        return Promise.resolve(makeJsonResponse({
          status: 'pass',
          duration_ms: 5,
          summary: 'HTTP 200, provider: claude',
          details: { httpStatus: 200, response: { status: 'ok', provider: 'claude' } },
        }));
      }
      if (url === '/api/quality/test/idea-validate') {
        return Promise.resolve(makeJsonResponse({
          status: 'fail',
          duration_ms: 8,
          error: 'Too short: 5 chars (need > 10)',
        }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Run All' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getAllByText('Cancelled by user').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Run All' })).toBeEnabled();
    expect(screen.queryByText('1/10')).not.toBeInTheDocument();

    firstCanary.resolve(makeJsonResponse({
      status: 'pass',
      duration_ms: 5,
      summary: 'late pass must be ignored',
      details: { httpStatus: 200, response: { status: 'ok', provider: 'claude' } },
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(localStorage.getItem('quality.test.canary')).toBeNull();
    expect(screen.queryByText('late pass must be ignored')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run All' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(localStorage.getItem('quality.test.canary')).toContain('"status":"pass"'));
  });

  it('labels fixture-backed and real checks at row level', () => {
    render(<QualityPanel />);

    expect(screen.getByText('Idea Validate')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('Code Delta')).toBeInTheDocument();
    expect(screen.getAllByText('Baseline fixture')).toHaveLength(3);
    expect(screen.queryByText('Not real LLM output')).not.toBeInTheDocument();
    expect(screen.getAllByText('Real runtime')).toHaveLength(6);
    expect(screen.getByText('Real LLM')).toBeInTheDocument();
  });

  it('shows Architect Real as real LLM with model and token metadata', async () => {
    configServiceMock.resolveModel.mockReturnValue('openai/gpt-4.1');
    configServiceMock.getKeyForAgent.mockReturnValue('sk-test');
    configServiceMock.getAgentConfig.mockReturnValue({ provider: 'openrouter' });
    orchestratorMock.getEndpoint.mockReturnValue('https://llm.test/chat/completions');
    orchestratorMock.normalizeModelId.mockReturnValue('openai/gpt-4.1');

    const fetchMock = vi.fn(async () => makeJsonResponse({
      model: 'openai/gpt-4.1',
      choices: [{
        message: {
          content: [
            'Architect plan below:',
            '```json',
            JSON.stringify({
              appName: 'Habit Tracker',
              skeleton: 'mobile-app',
              fileTree: {
                'src/pages/Home.tsx': 'Shows today habit checklist.',
                'src/pages/Stats.tsx': 'Shows streak statistics.',
                'src/pages/Profile.tsx': 'Shows user settings.',
                'src/data/types.ts': 'Defines habit records.',
                'src/data/seed.ts': 'Seeds starter habits.',
              },
              contextContract: 'Shared habit state.',
              dataModel: 'Habit: { id: string; title: string }',
            }),
            '```',
            'Use the object exactly as returned.',
          ].join('\n'),
        },
      }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 34,
        total_tokens: 46,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    clickFlowRun('Architect Real');

    // The model name appears in both the meta line and the auto-expanded detail panel.
    await waitFor(() => expect(screen.getAllByText(/openai\/gpt-4\.1/).length).toBeGreaterThan(0));
    expect(screen.getAllByText('Real LLM').length).toBeGreaterThan(0);
    expect(screen.getByText(/12 prompt \/ 34 completion tokens/)).toBeInTheDocument();
  });

  it('exports fixture and real evidence fields in the quality report', async () => {
    const reportCapture: { blob?: Blob } = {};
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        reportCapture.blob = blob;
        return 'blob:quality-report';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const fetchMock = vi.fn(async () => makeJsonResponse({
      status: 'pass',
      duration_ms: 12,
      summary: '43 chars OK',
      details: {
        prompt: 'Habit tracker: daily check-ins, streak, stats',
        length: 43,
        valid: true,
      },
      warnings: ['Fixture data - not real LLM output'],
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(<QualityPanel />);

      clickFlowRun('Idea Validate');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Report' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Report' }));

      if (!reportCapture.blob) throw new Error('Expected report blob');
      const report = JSON.parse(await reportCapture.blob.text());
      const idea = report.tests.find((test: any) => test.id === 'idea-validate');
      const architect = report.tests.find((test: any) => test.id === 'architect-real');

      expect(idea.fixtureBacked).toBe(true);
      expect(idea.truthLabel).toBe('Baseline fixture');
      expect(idea.realLlm).toBe(false);
      expect(architect.fixtureBacked).toBe(false);
      expect(architect.realLlm).toBe(true);
      expect(architect.truthLabel).toBe('Real LLM');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it('runs the live readiness preflight from a separate control and stores the result', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected fetch during preflight: ${String(input)}`);
    }));

    render(<QualityPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Preflight' }));

    await waitFor(() => expect(localStorage.getItem('quality.preflight.last')).toContain('"checks"'));
    expect(screen.getByText('Live Readiness Preflight')).toBeInTheDocument();
    expect(screen.getByText('Launch flow wiring')).toBeInTheDocument();
    expect(screen.getByText('Quality controls contract')).toBeInTheDocument();
  });

  it('reruns a single preflight check, stores only that slice, and exposes copyable diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected fetch during targeted preflight: ${String(input)}`);
    }));

    render(<QualityPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Run preflight check Import/export contract' }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('quality.preflight.last') ?? 'null');
      expect(stored?.checks).toHaveLength(1);
      expect(stored?.checks[0]?.id).toBe('import-export-contract');
      expect(stored?.checks[0]?.status).toBe('pass');
    });
    expect(screen.getByRole('button', { name: 'Hide details for Import/export contract' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copy diagnostics/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Copy full result/ }).length).toBeGreaterThan(0);
  });

  it('keeps Flow Chain and Preflight separate and reports overall FAIL when preflight fails after a passing flow chain', async () => {
    seedPassingFlowChainHistory();
    localStorage.setItem('quality.preflight.last', JSON.stringify({
      status: 'fail',
      checkedAt: '2026-05-19T00:00:00.000Z',
      passCount: 0,
      failCount: 1,
      warningCount: 0,
      checks: [
        {
          id: 'import-export-contract',
          label: 'Import/export contract',
          status: 'fail',
          summary: 'named exports only',
          rootCauseType: 'invalid_default_import',
          suggestedFix: 'Use named import { useLocalStorage } or add default export to the canonical hook.',
          diagnostics: [
            {
              root_cause_type: 'invalid_default_import',
              file: 'src/hooks/useSymptoms.ts',
              import_path: '@/hooks/useLocalStorage',
              expected: 'default export',
              actual: 'named exports only',
              suggested_fix: 'Use named import { useLocalStorage } or add default export to the canonical hook.',
              candidate_graph_summary: {
                totalFiles: 2,
                sourceModuleCount: 2,
                pageFileCount: 0,
                meaningfulSourceCount: 2,
                generatedDeltaCount: 0,
                materializedFileCount: 0,
                skeletonFileCount: 0,
                hasMain: false,
                hasApp: false,
                hasRouteManifest: false,
                shellOwnerFiles: [],
              },
              raw_error_excerpt: null,
            },
          ],
        },
      ],
    }));

    const reportCapture: { blob?: Blob } = {};
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        reportCapture.blob = blob;
        return 'blob:quality-report-overall';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(<QualityPanel />);

      expect(screen.getByRole('button', { name: 'Flow Chain' })).toBeInTheDocument();
      expect(screen.getAllByText('Live Readiness Preflight').length).toBeGreaterThan(0);
      expect(screen.getByText('Overall: FAIL')).toBeInTheDocument();
      expect(screen.getByText('Live Readiness Preflight failed. Live generation is likely to crash.')).toBeInTheDocument();
      expect(screen.getByText('Fast deterministic preflight. No LLM. No Vite build. Checks contracts before live generation.')).toBeInTheDocument();

      await waitFor(() => expect(screen.getByRole('button', { name: 'Report' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Report' }));

      if (!reportCapture.blob) throw new Error('Expected report blob');
      const report = JSON.parse(await reportCapture.blob.text());
      expect(report.overallStatus).toBe('fail');
      expect(report.flowChainStatus).toBe('pass');
      expect(report.preflightStatus).toBe('fail');
      expect(report.blockingFailures).toContain('Import/export contract: named exports only');
      expect(report.nextRecommendedAction).toContain('Fix the failing Live Readiness Preflight checks');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it('displays failed live readiness import/export diagnostics without counting them as pass', () => {
    localStorage.setItem('quality.preflight.last', JSON.stringify({
      status: 'fail',
      checkedAt: '2026-05-19T00:00:00.000Z',
      passCount: 0,
      failCount: 1,
      warningCount: 1,
      checks: [
        {
          id: 'import-export-contract',
          label: 'Import/export contract',
          status: 'fail',
          summary: 'named exports only',
          rootCauseType: 'invalid_default_import',
          suggestedFix: 'Use named import { useLocalStorage } or add default export to the canonical hook.',
          diagnostics: [
            {
              root_cause_type: 'invalid_default_import',
              file: 'src/hooks/useSymptoms.ts',
              import_path: '@/hooks/useLocalStorage',
              expected: 'default export',
              actual: 'named exports only',
              suggested_fix: 'Use named import { useLocalStorage } or add default export to the canonical hook.',
              candidate_graph_summary: {
                totalFiles: 2,
                sourceModuleCount: 2,
                pageFileCount: 0,
                meaningfulSourceCount: 2,
                generatedDeltaCount: 0,
                materializedFileCount: 0,
                skeletonFileCount: 0,
                hasMain: false,
                hasApp: false,
                hasRouteManifest: false,
                shellOwnerFiles: [],
              },
              raw_error_excerpt: null,
            },
          ],
        },
        {
          id: 'real-llm-availability',
          label: 'Real LLM availability',
          status: 'warning',
          summary: 'Real LLM not configured for this deterministic preflight.',
          rootCauseType: 'not_testable',
          suggestedFix: 'Configure a model slot only when running real LLM checks.',
        },
      ],
    }));

    render(<QualityPanel />);

    expect(screen.getByText('Live generation is likely to crash until these contract failures are fixed.')).toBeInTheDocument();
    expect(screen.getByText(/0 pass .* 1 fail .* 1 warning/)).toBeInTheDocument();
    expect(screen.getByText('invalid_default_import')).toBeInTheDocument();
    expect(screen.getByText('src/hooks/useSymptoms.ts')).toBeInTheDocument();
    expect(screen.getByText('@/hooks/useLocalStorage')).toBeInTheDocument();
    expect(screen.getAllByText('Use named import { useLocalStorage } or add default export to the canonical hook.').length).toBeGreaterThan(0);
  });

  it('exports preflight results in the quality report and clears them', async () => {
    const reportCapture: { blob?: Blob } = {};
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        reportCapture.blob = blob;
        return 'blob:quality-report-preflight';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected fetch during preflight report test: ${String(input)}`);
    }));

    try {
      render(<QualityPanel />);

      fireEvent.click(screen.getByRole('button', { name: 'Run Preflight' }));
      await waitFor(() => expect(localStorage.getItem('quality.preflight.last')).toContain('"checks"'));

      fireEvent.click(screen.getByRole('button', { name: 'Report' }));

      if (!reportCapture.blob) throw new Error('Expected report blob');
      const report = JSON.parse(await reportCapture.blob.text());
      expect(report.preflight).toBeTruthy();
      expect(report.preflight.checks.some((check: any) => check.id === 'launch-flow-wiring')).toBe(true);

      clickClearAction('Clear Preflight');
      expect(localStorage.getItem('quality.preflight.last')).toBeNull();
      expect(screen.getByText(/Clear Preflight/)).toBeInTheDocument();
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });
});

// ── Clear / Stop / Run navigation-safety tests ────────────────────────────────

describe('QualityPanel — Clear does not navigate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* never resolves */ })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('Clear button has type="button"', () => {
    render(<QualityPanel />);
    const btn = screen.getByRole('button', { name: 'Clear' });
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('Clear button is enabled on initial render', () => {
    render(<QualityPanel />);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
  });

  it('Clear button is enabled when only hidden quality localStorage keys exist', () => {
    localStorage.setItem('quality.compare.last', '{"stale":true}');
    localStorage.setItem('quality.benchmark.last', '{"stale":true}');

    render(<QualityPanel />);

    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    expect(screen.queryByText(/Last run:/)).not.toBeInTheDocument();
  });

  it('Stop button has type="button"', async () => {
    render(<QualityPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Run All/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('type', 'button');
  });

  it('Run All button has type="button"', () => {
    render(<QualityPanel />);
    expect(screen.getByRole('button', { name: /Run All/i })).toHaveAttribute('type', 'button');
  });

  it('Run buttons have type="button"', () => {
    render(<QualityPanel />);
    const runBtns = STEP_DEFS_LABELS.map(label => screen.getByRole('button', { name: `Run ${label}` }));
    expect(runBtns.length).toBeGreaterThan(0);
    runBtns.forEach(btn => expect(btn).toHaveAttribute('type', 'button'));
  });

  it('Clear removes only quality.* localStorage keys and preserves unrelated keys', () => {
    localStorage.setItem('quality.test.canary', JSON.stringify([{ status: 'pass', duration_ms: 10, timestamp: new Date().toISOString() }]));
    localStorage.setItem('quality.lastRunAll', new Date().toISOString());
    localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
    localStorage.setItem('active-view', 'quality');
    localStorage.setItem('supabase.auth.token', 'fake-token');

    render(<QualityPanel />);
    clickClearAction('Clear Flow Chain');

    expect(localStorage.getItem('quality.test.canary')).toBeNull();
    expect(localStorage.getItem('quality.lastRunAll')).toBeNull();
    expect(localStorage.getItem('AIC_DEV_AUTH_BYPASS')).toBe('1');
    expect(localStorage.getItem('active-view')).toBe('quality');
    expect(localStorage.getItem('supabase.auth.token')).toBe('fake-token');
  });

  it('Clear does not call any window.location navigation', () => {
    const assignSpy = vi.fn();
    const replaceSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy, replace: replaceSpy },
    });

    render(<QualityPanel />);
    openClearMenu();

    expect(assignSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('Clear resets test states to idle (visible quality results clear)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'pass', duration_ms: 5, summary: 'ok',
      details: { prompt: 'x'.repeat(20), length: 20, valid: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);
    clickFlowRun('Idea Validate');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Quality key written to storage on pass
    await waitFor(() => expect(localStorage.getItem('quality.test.idea-validate')).not.toBeNull());

    clickClearAction('Clear Flow Chain');

    // After clear, all quality storage should be gone
    expect(localStorage.getItem('quality.test.idea-validate')).toBeNull();
    expect(screen.queryByText('⚠ Fixture data - not real LLM output')).not.toBeInTheDocument();
    expect(screen.queryByText('Not real LLM output')).not.toBeInTheDocument();
  });

  it('Clear removes idle-looking fixture note lines for fixture-backed tests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'pass',
      duration_ms: 5,
      summary: 'ok',
      details: { prompt: 'x'.repeat(20), length: 20, valid: true },
      warnings: ['Fixture data - not real LLM output'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<QualityPanel />);

    clickFlowRun('Idea Validate');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('⚠ Fixture data - not real LLM output')).toBeInTheDocument());

    clickClearAction('Clear Flow Chain');

    expect(screen.queryByText('⚠ Fixture data - not real LLM output')).not.toBeInTheDocument();
    expect(screen.queryByText('Not real LLM output')).not.toBeInTheDocument();
    expect(screen.getAllByText('Baseline fixture')).toHaveLength(3);
  });

  it('Clear leaves the panel on Quality / Flow Chain', () => {
    localStorage.setItem('quality.compare.last', '{"stale":true}');

    render(<QualityPanel />);
    openClearMenu();

    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flow Chain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run All' })).toBeInTheDocument();
  });
});

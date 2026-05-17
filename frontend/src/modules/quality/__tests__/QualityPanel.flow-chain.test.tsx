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

    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[1]);

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

    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[3]);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/quality/test/code-delta')).toBe(true));

    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[4]);
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
    expect(screen.getByText('Too short: 5 chars (need > 10)')).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText('stopped at idea-validate')).toBeInTheDocument());
    expect(screen.getByText('1/10')).toBeInTheDocument();
    expect(localStorage.getItem('quality.lastRunAll')).toBeTruthy();
    expect(localStorage.getItem('quality.test.canary')).toContain('"status":"pass"');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(qualityStorageKeys()).toEqual([]);
    expect(screen.queryByText('1/10')).not.toBeInTheDocument();
    expect(screen.queryByText('stopped at idea-validate')).not.toBeInTheDocument();
    expect(screen.queryByText(/Last run:/)).not.toBeInTheDocument();
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
    expect(screen.getByText('Cancelled by user')).toBeInTheDocument();
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
    expect(screen.getAllByText('Not real LLM output')).toHaveLength(3);
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
          content: JSON.stringify({
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

    const runButtons = screen.getAllByRole('button', { name: 'Run' });
    fireEvent.click(runButtons[runButtons.length - 1]);

    // The model name appears in both the meta line and the auto-expanded detail panel.
    await waitFor(() => expect(screen.getAllByText(/openai\/gpt-4\.1/).length).toBeGreaterThan(0));
    expect(screen.getByText('Real LLM')).toBeInTheDocument();
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

      fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[1]);
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
});

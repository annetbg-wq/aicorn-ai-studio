// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../components/BenchmarkDashboard', () => ({
  BenchmarkDashboard: () => null,
}));

import QualityPanel from '../QualityPanel';

function makeJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('QualityPanel flow-chain baseline', () => {
  beforeEach(() => {
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/quality/test/code-delta'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[4]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/quality/test/compile?buildId=qt-build'));
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
});

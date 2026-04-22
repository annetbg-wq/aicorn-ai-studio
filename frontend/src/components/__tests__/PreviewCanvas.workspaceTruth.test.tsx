// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PreviewCanvas,
  buildScopedTraceRows,
  resolveWorkspaceBinding,
} from '../PreviewCanvas';
import { generationTracer } from '../../services/GenerationTracer';

const baseProps = {
  device: 'desktop',
  setDevice: vi.fn(),
  files: { '/App.tsx': 'export default function App() { return <main>ok</main>; }' },
  setFiles: vi.fn(),
  activeFile: '/App.tsx',
  setActiveFile: vi.fn(),
  currentTheme: 'dark' as const,
  currentVersion: 1,
  totalVersions: 1,
  currentProjectId: 'project-a',
  projectId: 'project-a',
  projectName: 'Project A',
  activeBranch: 'main',
  persistedProjectExists: true,
  previewLifecycle: 'preview-ready',
  previewUrl: '/preview/test-build',
};

afterEach(() => {
  cleanup();
  generationTracer.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

function finishTrace(input: {
  projectId: string;
  branchId?: string;
  summary?: string;
  stopReason?: string;
  errorSummary?: string;
}) {
  const trace = generationTracer.start({
    intent: input.summary ?? 'build app',
    model: 'test-model',
    mode: 'new',
    projectId: input.projectId,
    branchId: input.branchId ?? 'main',
  });
  if (input.summary) {
    trace.appendStep({
      kind: 'coder_generation',
      summary: input.summary,
    });
  }
  trace.finish(input.errorSummary ? 'error' : 'ok', {
    stopReason: input.stopReason,
    errorSummary: input.errorSummary,
    finalOutcome: input.errorSummary ? 'ship_fail' : 'ship_ok',
  });
  return generationTracer.getRecent(1)[0];
}

describe('PreviewCanvas workspace truth', () => {
  it('shows the active current-run reasoning trace instead of old project history', () => {
    finishTrace({
      projectId: 'project-a',
      summary: 'Old history step',
    });
    const active = generationTracer.start({
      intent: 'current request',
      model: 'test-model',
      mode: 'new',
      projectId: 'project-a',
      branchId: 'main',
    });
    active.beginStep({
      kind: 'coder_generation',
      summary: 'Current run step',
    });

    render(<PreviewCanvas {...baseProps} isGenerating previewLifecycle="generating" />);
    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));

    expect(screen.getAllByText('Current run step').length).toBeGreaterThan(0);
    expect(screen.queryByText('Old history step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reasoning-empty')).not.toBeInTheDocument();
  });

  it('does not fall back to old history while a new current run is starting', () => {
    finishTrace({
      projectId: 'project-a',
      summary: 'Old history step',
    });

    render(<PreviewCanvas {...baseProps} isGenerating previewLifecycle="generating" />);
    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));

    expect(screen.queryByText('Old history step')).not.toBeInTheDocument();
    expect(screen.getAllByText(/current generation is starting/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('reasoning-scope-label')).toHaveTextContent(/current run/i);
  });

  it('keeps successful current-run reasoning visible after preview success', () => {
    finishTrace({
      projectId: 'project-a',
      summary: 'Successful current-run reasoning',
    });

    render(<PreviewCanvas {...baseProps} previewLifecycle="preview-ready" />);
    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));

    expect(screen.getByText('Successful current-run reasoning')).toBeInTheDocument();
    expect(screen.getByTestId('reasoning-final-outcome')).toHaveTextContent('Completed successfully');
    expect(screen.queryByTestId('reasoning-empty')).not.toBeInTheDocument();
  });

  it('keeps failed current-run reasoning visible after failure', () => {
    finishTrace({
      projectId: 'project-a',
      summary: 'Tried to materialize candidate files',
      stopReason: 'fast_gate_failed',
      errorSummary: 'Compile failed before promotion',
    });

    render(<PreviewCanvas {...baseProps} previewLifecycle="failed" />);
    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));

    expect(screen.getByText('Tried to materialize candidate files')).toBeInTheDocument();
    expect(screen.getByTestId('reasoning-final-outcome')).toHaveTextContent('Run failed before promotion');
    expect(screen.getByTestId('reasoning-diagnostic-banner')).toHaveAttribute('data-diagnostic-code', 'candidate_compile_failed');
  });

  it('shows current-run failure diagnostics in Code and Reasoning instead of blank states', () => {
    finishTrace({
      projectId: 'project-a',
      stopReason: 'artifact_ingress_failed',
      errorSummary: 'Artifact ingress failed before usable files existed',
    });

    render(
      <PreviewCanvas
        {...baseProps}
        files={{}}
        activeFile=""
        currentVersion={0}
        totalVersions={0}
        previewLifecycle="failed"
      />,
    );

    fireEvent.click(screen.getByTestId('preview-tab-code'));
    const codeDiagnostic = screen.getByTestId('code-diagnostic');
    expect(codeDiagnostic).toHaveAttribute('data-diagnostic-code', 'artifact_ingress_failed');
    expect(within(codeDiagnostic).getAllByText(/artifact ingress/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));
    expect(screen.getByTestId('reasoning-diagnostic')).toHaveAttribute('data-diagnostic-code', 'artifact_ingress_failed');
    expect(screen.getAllByText('Current run stopped at artifact ingress').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('reasoning-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('copy-visible-reasoning-btn')).toBeEnabled();
  });

  it('copies only safe visible reasoning text and never raw debug trace content', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const trace = generationTracer.start({
      intent: 'copy safety',
      model: 'test-model',
      mode: 'new',
      projectId: 'project-a',
      branchId: 'main',
    });
    trace.appendStep({
      kind: 'coder_generation',
      summary: 'Safe visible summary',
    });
    trace.recordDebugEvent({
      kind: 'coder_generation',
      summary: 'debug-only event',
      outputExcerpt: 'RAW HIDDEN CHAIN-OF-THOUGHT SHOULD NOT RENDER',
    });
    trace.finish('ok', { finalOutcome: 'ship_ok' });

    render(<PreviewCanvas {...baseProps} />);
    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));

    expect(screen.getByText('Safe visible summary')).toBeInTheDocument();
    expect(screen.queryByText(/RAW HIDDEN CHAIN-OF-THOUGHT/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('copy-visible-reasoning-btn'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('Safe visible summary');
    expect(copied).not.toContain('RAW HIDDEN CHAIN-OF-THOUGHT');
    expect(copied).not.toContain('debug-only event');
  });

  it('copies full debug trace JSON through a separate investigative affordance', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const trace = generationTracer.start({
      intent: 'debug export',
      model: 'test-model',
      mode: 'new',
      projectId: 'project-a',
      branchId: 'main',
    });
    trace.appendStep({
      kind: 'coder_generation',
      summary: 'Visible summary remains default',
    });
    trace.recordDebugEvent({
      kind: 'coder_generation',
      summary: 'debug-only event',
      outputExcerpt: '<thinking>private reasoning</thinking>\nSafe output excerpt',
      metadata: {
        token: 'plain-token-value',
        safeDiagnostic: 'compile warning',
      },
    });
    trace.finish('ok', { finalOutcome: 'ship_ok' });

    render(<PreviewCanvas {...baseProps} />);
    fireEvent.click(screen.getByTestId('preview-tab-reasoning'));

    expect(screen.getByTestId('copy-visible-reasoning-btn')).toBeInTheDocument();
    expect(screen.getByTestId('copy-full-debug-trace-btn')).toBeInTheDocument();
    expect(screen.getByText('Visible summary remains default')).toBeInTheDocument();
    expect(screen.queryByText('debug-only event')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('copy-full-debug-trace-btn'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('"schema": "aic-rg-full-debug-trace-v1"');
    expect(copied).toContain('debug-only event');
    expect(copied).toContain('Safe output excerpt');
    expect(copied).toContain('compile warning');
    expect(copied).not.toContain('plain-token-value');
    expect(copied).not.toContain('private reasoning');
  });

  it('builds stable scoped analytics row identities without duplicate current/archive rows', () => {
    const trace = finishTrace({
      projectId: 'project-a',
      summary: 'Analytics row',
    });
    const binding = resolveWorkspaceBinding({
      projectId: 'project-a',
      branchId: 'main',
      activeTrace: null,
      recentTraces: [trace, trace],
      persistedProjectExists: true,
      previewLifecycle: 'preview-ready',
    });

    const rows = buildScopedTraceRows({ binding, recentTraces: [trace, trace] });

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toContain('current-run:project-a:main');
    expect(rows[0].scopeLabel).toBe('Current run');
  });

  it('does not let stale persisted project state override current live-run diagnostics', () => {
    const trace = finishTrace({
      projectId: 'project-a',
      stopReason: 'final_check_failed',
      errorSummary: 'Final live-preview check failed',
    });

    const binding = resolveWorkspaceBinding({
      projectId: 'project-a',
      branchId: 'main',
      activeTrace: null,
      recentTraces: [trace],
      persistedProjectExists: false,
      previewBlockedReason: 'Project not found: project-a',
      previewLifecycle: 'failed',
    });

    expect(binding.runId).toBe(trace.id);
    expect(binding.projectState.kind).toBe('stale_missing');
    expect(binding.diagnostic?.code).toBe('final_check_failed');
  });

  it('keeps failed generation surfaces scoped to the active project and branch', () => {
    const trace = finishTrace({
      projectId: 'project-a',
      branchId: 'main',
      stopReason: 'fast_gate_failed',
      errorSummary: 'Compile failed',
    });

    const activeScope = resolveWorkspaceBinding({
      projectId: 'project-a',
      branchId: 'main',
      recentTraces: [trace],
      persistedProjectExists: true,
      previewLifecycle: 'failed',
    });
    const otherBranch = resolveWorkspaceBinding({
      projectId: 'project-a',
      branchId: 'feature',
      recentTraces: [trace],
      persistedProjectExists: true,
      previewLifecycle: 'failed',
    });

    expect(activeScope.diagnostic?.code).toBe('candidate_compile_failed');
    expect(otherBranch.trace).toBeNull();
    expect(otherBranch.diagnostic).toBeNull();
  });
});

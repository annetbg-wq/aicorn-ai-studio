// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

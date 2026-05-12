// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { generationTracer } from '../GenerationTracer';

afterEach(() => {
  generationTracer.clear();
  localStorage.clear();
});

describe('GenerationTracer trace layers', () => {
  it('appends visible reasoning steps in order and clears the active marker on finish', () => {
    const trace = generationTracer.start({
      intent: 'Build an analytics dashboard',
      model: 'openai/gpt-4o',
      mode: 'new',
      projectId: 'proj-visible',
    });

    const intentStepId = trace.beginStep({
      kind: 'intent_understanding',
      summary: 'Understanding the request and selecting the path.',
      labels: { provider: 'openai', model: 'gpt-4o', slot: 'primary', route: 'openai:primary' },
    });
    trace.finishStep(intentStepId, {
      summary: 'Using the new generation pipeline.',
      labels: { provider: 'openai', model: 'gpt-4o', slot: 'primary', route: 'openai:primary' },
    });

    const architectStepId = trace.beginStep({
      kind: 'architect_plan',
      summary: 'Planning the screens and build outline.',
      labels: { provider: 'openai', model: 'gpt-4o', slot: 'primary', route: 'openai:primary' },
    });
    trace.finishStep(architectStepId, {
      summary: 'Planned two screens and one shared shell.',
    });

    trace.finish('ok', { finalOutcome: 'ship_ok' });

    const stored = generationTracer.getRecent(1)[0];
    expect(stored.visibleReasoningTrace.steps.map(step => step.kind)).toEqual([
      'intent_understanding',
      'architect_plan',
    ]);
    expect(stored.visibleReasoningTrace.steps[0]).toMatchObject({
      status: 'completed',
      isActive: false,
      summary: 'Using the new generation pipeline.',
    });
    expect(stored.visibleReasoningTrace.steps[1]?.timing?.durationMs).toBeGreaterThanOrEqual(0);
    expect(stored.visibleReasoningTrace.activeStepId).toBeNull();
    expect(stored.visibleReasoningTrace.finalOutcome).toBe('ship_ok');
  });

  it('persists structured run truth and supports post-finish telemetry updates', () => {
    const trace = generationTracer.start({
      intent: 'Build a habit tracker',
      model: 'openai/gpt-4o',
      mode: 'new',
      projectId: 'proj-summary',
      branchId: 'main',
    });

    trace.setRunSummary({
      brief: 'Build a habit tracker',
      skeleton: { id: 'mobile-app', label: 'Mobile App', archetypeId: 'consumer-feed' },
      design: {
        themeName: 'Trust',
        intent: ['Mobile App', 'Theme Trust', 'Mood calm'],
        designSummary: 'Theme Trust with calm mood.',
      },
      output: {
        skeletonFiles: ['src/App.tsx'],
        deltaFiles: ['src/pages/Home.tsx'],
        filesCreated: ['src/pages/Home.tsx'],
        filesUpdated: [],
        changedFileCount: 1,
        createdFileCount: 1,
        deltaSizeBytes: 320,
        keyPaths: ['src/pages/Home.tsx'],
        compileCount: 2,
        previewMountStatus: 'pending',
        saveReady: false,
      },
      path: {
        kind: 'real',
        summary: 'Real generation path with live compile and preview telemetry.',
        usesRealLlm: true,
        usesRealRuntime: true,
        fixtureBacked: false,
        testEnvironment: false,
        markers: ['packaged-founder-brief'],
      },
      quality: {
        verdict: 'partial',
        summary: 'Output proof passed, preview is still mounting.',
        gates: [{
          id: 'preview-mounted',
          label: 'Preview mounted',
          passed: false,
          source: 'real-runtime',
          detail: 'pending',
        }],
        blockers: [],
        warnings: ['Preview is still mounting'],
      },
      steps: [{
        id: 'coder',
        label: 'Пишу код...',
        status: 'done',
        durationMs: 1200,
      }],
    });
    trace.finish('ok', { finalOutcome: 'ship_partial' });

    generationTracer.updateRunSummary(
      { runId: trace.id, projectId: 'proj-summary', branchId: 'main' },
      {
        output: { previewMountStatus: 'mounted', saveReady: true, totalTimeToPreviewMs: 2400 },
        quality: {
          gates: [{
            id: 'preview-mounted',
            label: 'Preview mounted',
            passed: true,
            source: 'real-runtime',
            detail: 'mounted',
          }],
        },
      },
    );

    const stored = generationTracer.getRecent(1)[0];
    expect(stored.runSummary?.output?.previewMountStatus).toBe('mounted');
    expect(stored.runSummary?.output?.saveReady).toBe(true);
    expect(stored.runSummary?.quality?.gates[0]).toMatchObject({ passed: true, detail: 'mounted' });
  });

  it('records full debug prompt/output metadata, attempts, stop reasons, and redacts secrets', () => {
    const trace = generationTracer.start({
      intent: 'Repair the compile failure',
      model: 'openai/gpt-4o',
      mode: 'edit',
      projectId: 'proj-debug',
    });

    trace.setRoutes([
      {
        role: 'fix',
        provider: 'openai',
        model: 'gpt-4o',
        slot: 'fix',
        route: 'openai:fix',
        keySource: 'test.fix',
      },
    ]);

    const repairStepId = trace.beginStep({
      kind: 'repair_attempt',
      summary: 'Preparing a compile repair attempt.',
      labels: { provider: 'openai', model: 'gpt-4o', slot: 'fix', route: 'openai:fix' },
      attemptNumber: 2,
    });
    trace.recordPrompt({
      kind: 'repair_attempt',
      label: 'repair_prompt',
      summary: 'Prepared a repair prompt.',
      excerpt: 'Authorization: Bearer sk-secret-123\nAPI_KEY=test-key\nFix src/App.tsx',
      labels: { provider: 'openai', model: 'gpt-4o', slot: 'fix', route: 'openai:fix' },
      attemptNumber: 2,
      promptChars: 88,
    });
    trace.recordOutput({
      kind: 'repair_attempt',
      summary: 'Received repair output.',
      excerpt: 'Patched src/App.tsx and removed the broken import.',
      labels: { provider: 'openai', model: 'gpt-4o', slot: 'fix', route: 'openai:fix' },
      attemptNumber: 2,
      metadata: { changedFiles: 1 },
    });
    trace.finishStep(repairStepId, {
      status: 'failed',
      summary: 'Repair attempt 2 did not restore viability.',
      attemptNumber: 2,
      errorSummary: 'Compile still fails in src/App.tsx',
      stopReason: 'repair_budget_exhausted',
      compileRuntimeLogs: ['Failed to resolve import "./Panel"', 'Authorization: Bearer sk-secret-456'],
    });
    trace.finish('error', {
      errorSummary: 'Compile still fails in src/App.tsx',
      stopReason: 'repair_budget_exhausted',
      finalOutcome: 'ship_fail',
    });

    const stored = generationTracer.getRecent(1)[0];
    const repairStep = stored.fullDebugTrace.events.find(event => event.kind === 'repair_attempt' && event.type === 'step');
    const promptEvent = stored.fullDebugTrace.events.find(event => event.kind === 'repair_attempt' && event.type === 'prompt');
    const outputEvent = stored.fullDebugTrace.events.find(event => event.kind === 'repair_attempt' && event.type === 'output');

    expect(repairStep).toMatchObject({
      status: 'failed',
      attemptNumber: 2,
      stopReason: 'repair_budget_exhausted',
      errorSummary: 'Compile still fails in src/App.tsx',
    });
    expect(promptEvent?.prompt?.excerpt).toContain('[redacted]');
    expect(promptEvent?.prompt?.excerpt).not.toContain('sk-secret-123');
    expect(outputEvent?.outputExcerpt).toContain('Patched src/App.tsx');
    expect(stored.fullDebugTrace.stopReason).toBe('repair_budget_exhausted');
    expect(stored.fullDebugTrace.finalOutcome).toBe('ship_fail');
    expect(JSON.stringify(stored.fullDebugTrace)).not.toContain('sk-secret-456');
  });

  it('persists full debug traces for successful and failed runs with reload-like retrieval', () => {
    const success = generationTracer.start({
      intent: 'Build a clean landing page',
      model: 'test-model',
      mode: 'new',
      projectId: 'proj-persist',
      branchId: 'main',
    });
    success.recordDebugEvent({
      kind: 'coder_generation',
      summary: 'Generated candidate files.',
      metadata: { files: 3 },
    });
    success.finish('ok', { finalOutcome: 'ship_ok', stopReason: 'no_repair_needed' });
    const successRunId = success.id;

    const failure = generationTracer.start({
      intent: 'Repair broken import',
      model: 'test-model',
      mode: 'edit',
      projectId: 'proj-persist',
      branchId: 'main',
    });
    failure.recordDebugEvent({
      kind: 'repair_attempt',
      summary: 'Compile repair exhausted budget.',
      stopReason: 'repair_budget_exhausted',
    });
    failure.finish('error', {
      finalOutcome: 'ship_fail',
      stopReason: 'repair_budget_exhausted',
      errorSummary: 'Compile failed',
    });
    const failureRunId = failure.id;

    const successDebugTrace = generationTracer.getFullDebugTrace({ runId: successRunId });
    const failureDebugTrace = generationTracer.getFullDebugTrace({ runId: failureRunId });

    expect(successDebugTrace).toMatchObject({
      runId: successRunId,
      finalOutcome: 'ship_ok',
      stopReason: 'no_repair_needed',
    });
    expect(failureDebugTrace).toMatchObject({
      runId: failureRunId,
      finalOutcome: 'ship_fail',
      stopReason: 'repair_budget_exhausted',
    });
    expect(generationTracer.formatFullDebugTraceExport({ runId: failureRunId })).toContain('"schema": "aic-rg-full-debug-trace-v1"');
  });

  it('retrieves the correct full debug trace for the current workspace and run', () => {
    const mainRun = generationTracer.start({
      intent: 'Main branch run',
      model: 'test-model',
      mode: 'new',
      projectId: 'proj-scope',
      branchId: 'main',
    });
    mainRun.recordDebugEvent({ kind: 'coder_generation', summary: 'Main branch debug event.' });
    mainRun.finish('ok', { finalOutcome: 'ship_ok' });

    const featureRun = generationTracer.start({
      intent: 'Feature branch run',
      model: 'test-model',
      mode: 'new',
      projectId: 'proj-scope',
      branchId: 'feature',
    });
    featureRun.recordDebugEvent({ kind: 'coder_generation', summary: 'Feature branch debug event.' });
    featureRun.finish('ok', { finalOutcome: 'ship_ok' });

    const mainDebugTrace = generationTracer.getFullDebugTrace({
      projectId: 'proj-scope',
      branchId: 'main',
      runId: mainRun.id,
    });
    const wrongBranchDebugTrace = generationTracer.getFullDebugTrace({
      projectId: 'proj-scope',
      branchId: 'feature',
      runId: mainRun.id,
    });

    expect(mainDebugTrace?.events[0]?.summary).toBe('Main branch debug event.');
    expect(wrongBranchDebugTrace).toBeNull();
  });

  it('redacts sensitive fields and hidden chain-of-thought from debug exports', () => {
    const trace = generationTracer.start({
      intent: 'Investigate failure',
      model: 'test-model',
      mode: 'new',
      projectId: 'proj-redact',
      branchId: 'main',
    });
    trace.recordDebugEvent({
      kind: 'coder_generation',
      summary: 'Safe debug event',
      outputExcerpt: '<thinking>private model reasoning</thinking>\nRendered files.',
      metadata: {
        apiKey: 'plain-unpatterned-secret',
        headers: { authorization: 'Bearer plain-token', 'x-safe': 'still excluded' },
        chainOfThought: 'RAW HIDDEN CHAIN-OF-THOUGHT SHOULD NEVER EXPORT',
        safeCount: 2,
      },
    });
    trace.finish('ok', { finalOutcome: 'ship_ok' });

    const exported = generationTracer.formatFullDebugTraceExport({ runId: trace.id });

    expect(exported).toContain('Safe debug event');
    expect(exported).toContain('Rendered files.');
    expect(exported).toContain('[redacted]');
    expect(exported).not.toContain('plain-unpatterned-secret');
    expect(exported).not.toContain('plain-token');
    expect(exported).not.toContain('RAW HIDDEN CHAIN-OF-THOUGHT');
    expect(exported).not.toContain('private model reasoning');
  });
});

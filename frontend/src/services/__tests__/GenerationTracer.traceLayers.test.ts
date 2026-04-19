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
});

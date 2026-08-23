import { describe, expect, it, vi } from 'vitest';

import { captureBaselineSuite } from './eval-baseline-support.mjs';
import { resolveEvalSeedPlan } from './eval-runtime.mjs';

describe('resolveEvalSeedPlan', () => {
  it('prefers saved runtime agent configs when no explicit benchmark override is provided', () => {
    const runtimeConfig = {
      agent_primary: { provider: 'deepseek', modelId: 'deepseek/deepseek-v4-pro' },
      agent_build: { provider: 'openrouter', modelId: 'xiaomi/mimo-v2-pro' },
      agent_fix: { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
      agent_qa: { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
    };

    const plan = resolveEvalSeedPlan({}, runtimeConfig);

    expect(plan.mode).toBe('runtime');
    expect(plan.provider).toBeNull();
    expect(plan.agentConfigs.agent_primary.provider).toBe('deepseek');
    expect(plan.agentConfigs.agent_build.modelId).toBe('xiaomi/mimo-v2-pro');
  });

  it('lets explicit benchmark overrides win over runtime agent configs', () => {
    const runtimeConfig = {
      agent_primary: { provider: 'deepseek', modelId: 'deepseek/deepseek-v4-pro' },
    };

    const plan = resolveEvalSeedPlan(
      {
        BENCHMARK_PROVIDER: 'openrouter',
        BENCHMARK_MODEL_ID: 'openai/gpt-4o-mini',
        OPENROUTER_API_KEY: 'or-key',
      },
      runtimeConfig,
    );

    expect(plan.mode).toBe('explicit');
    expect(plan.provider).toBe('openrouter');
    expect(plan.modelId).toBe('openai/gpt-4o-mini');
    expect(plan.agentConfigs.agent_build.modelId).toBe('openai/gpt-4o-mini');
  });
});

describe('captureBaselineSuite', () => {
  const report = {
    runId: 'bench-123',
    modelId: 'deepseek/deepseek-v4-pro',
    startedAt: '2026-06-02T10:00:00.000Z',
    finishedAt: '2026-06-02T10:10:00.000Z',
    summary: { total: 5, previewReady: 3 },
  };

  const aggregate = {
    modelId: 'deepseek/deepseek-v4-pro',
    runId: 'bench-123',
    createdAt: '2026-06-02T10:10:00.000Z',
    previewReadyRate: 0.6,
    avgFileCount: 8,
    avgDurationMs: 1200,
    intentCount: 5,
  };

  it('writes the artifact and promotes the full suite from one call', async () => {
    const writeJson = vi.fn();
    const promoteAsBaseline = vi.fn().mockResolvedValue(undefined);
    const baselineArtifactPath = vi.fn().mockReturnValue('artifacts/eval-baselines/benchmark.full.baseline.json');
    const buildAggregateBaseline = vi.fn().mockReturnValue(aggregate);

    const result = await captureBaselineSuite({
      suite: 'full',
      report,
      buildAggregateBaseline,
      baselineArtifactPath,
      writeJson,
      promoteAsBaseline,
    });

    expect(result.aggregate).toEqual(aggregate);
    expect(writeJson).toHaveBeenCalledTimes(1);
    expect(promoteAsBaseline).toHaveBeenCalledTimes(1);
    expect(promoteAsBaseline).toHaveBeenCalledWith(report);
  });

  it('writes the fast artifact without promoting Supabase baseline state', async () => {
    const writeJson = vi.fn();
    const promoteAsBaseline = vi.fn().mockResolvedValue(undefined);
    const baselineArtifactPath = vi.fn().mockReturnValue('artifacts/eval-baselines/benchmark.fast.baseline.json');
    const buildAggregateBaseline = vi.fn().mockReturnValue(aggregate);

    await captureBaselineSuite({
      suite: 'fast',
      report,
      buildAggregateBaseline,
      baselineArtifactPath,
      writeJson,
      promoteAsBaseline,
    });

    expect(writeJson).toHaveBeenCalledTimes(1);
    expect(promoteAsBaseline).not.toHaveBeenCalled();
  });
});

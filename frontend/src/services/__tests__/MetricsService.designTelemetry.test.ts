// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}));

import type { DesignRecipeTelemetry } from '../../shared/projectModel';
import { metricsService } from '../MetricsService';

function buildTelemetry(): DesignRecipeTelemetry {
  return {
    generationId: 'gen-metrics',
    timestamp: '2026-04-19T12:00:00.000Z',
    projectId: 'proj-metrics',
    generationMode: 'new',
    recipe: {
      category: 'productivity',
      style: 'minimal',
      visualArchetype: 'focused workbench',
      density: 'comfortable',
      breathingRoom: 'airy',
      shellStyle: 'Simple centered workspace',
      hierarchyEmphasis: 'Lead with one clear task',
      ctaStrategy: 'Single action forward',
      mobileComposition: 'Narrow stack with anchored CTA',
    },
    redesign: {
      mode: 'preserve',
      structureLock: 'strict',
      changeEnvelope: 'visual_refresh_without_structural_change',
      visualSystemReset: false,
      structureChangeAllowed: false,
      screensInScopeCount: 1,
      brandAnchorsCount: 1,
    },
    assets: {
      componentRemotePolicy: 'disallow',
      preferredComponentSources: ['shadcn/ui primitives'],
      iconPreferredSource: 'lucide-react',
      mediaRemotePolicy: 'avoid',
      fontLoadingStrategy: 'system_only',
      advancedRemotePolicy: 'avoid',
      previewSafeFallbackRequired: true,
    },
    outcome: {
      visualVerdict: 'acceptable',
      visualBand: 'medium',
      visualScore: 68,
      reasons: ['Good breathing room'],
      polishOutcome: 'not-needed',
      polishApplied: false,
      qualityImprovedAfterPolish: false,
      polishTriggerReasons: [],
    },
  };
}

afterEach(() => {
  metricsService.clear();
  localStorage.clear();
});

describe('MetricsService design telemetry', () => {
  it('stores local design telemetry with generation metrics', async () => {
    const telemetry = buildTelemetry();

    metricsService.logGeneration({
      generation_id: 'gen-metrics',
      intent: 'Build a calm task workspace',
      model_id: 'gpt-4o',
      duration_ms: 14200,
      file_count: 6,
      parse_success: true,
      fallback_used: false,
      compile_success: true,
      autofix_needed: false,
      autofix_success: false,
      error_message: null,
      designTelemetry: telemetry,
    });

    await Promise.resolve();

    const entries = metricsService.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].extra?.designTelemetry).toMatchObject({
      recipe: {
        category: 'productivity',
        style: 'minimal',
      },
      outcome: {
        visualScore: 68,
      },
    });
    expect(metricsService.getDesignTelemetry()).toEqual([telemetry]);
  });
});

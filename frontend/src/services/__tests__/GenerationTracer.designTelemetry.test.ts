// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import type { DesignRecipeTelemetry } from '../../shared/projectModel';
import { generationTracer } from '../GenerationTracer';

function buildTelemetry(): DesignRecipeTelemetry {
  return {
    generationId: 'gen-trace',
    timestamp: '2026-04-19T11:00:00.000Z',
    projectId: 'proj-trace',
    generationMode: 'edit',
    recipe: {
      category: 'saas-dashboard',
      style: 'enterprise',
      visualArchetype: 'operator cockpit',
      density: 'compact',
      breathingRoom: 'balanced',
      shellStyle: 'Structured workspace shell',
      hierarchyEmphasis: 'Lead with KPIs and queues',
      ctaStrategy: 'One primary operational action',
      mobileComposition: 'Single-column summary with action anchors',
    },
    redesign: {
      mode: 'partial_restyle',
      structureLock: 'prefer',
      changeEnvelope: 'scoped_redesign',
      visualSystemReset: false,
      structureChangeAllowed: false,
      screensInScopeCount: 3,
      brandAnchorsCount: 2,
    },
    assets: {
      componentRemotePolicy: 'disallow',
      preferredComponentSources: ['shadcn/ui primitives'],
      iconPreferredSource: 'lucide-react',
      mediaRemotePolicy: 'prefer_fallback',
      fontLoadingStrategy: 'local_preferred',
      advancedRemotePolicy: 'case_by_case',
      previewSafeFallbackRequired: true,
    },
    outcome: {
      visualVerdict: 'strong',
      visualBand: 'high',
      visualScore: 86,
      reasons: ['Clear visual hierarchy'],
      polishOutcome: 'applied',
      polishApplied: true,
      qualityImprovedAfterPolish: true,
      polishDeltaScore: 9,
      polishTriggerReasons: ['weak hierarchy'],
    },
  };
}

afterEach(() => {
  generationTracer.clear();
  localStorage.clear();
});

describe('GenerationTracer design telemetry', () => {
  it('persists design telemetry on finished traces', () => {
    const trace = generationTracer.start({
      intent: 'Improve the dashboard visuals',
      model: 'gpt-4o',
      mode: 'edit',
      projectId: 'proj-trace',
    });

    const close = trace.span('visual_polish', { attempted: true });
    close({ data: { improved: true } });
    trace.finish('ok', {
      fileCount: 3,
      designTelemetry: buildTelemetry(),
    });

    const stored = generationTracer.getRecent(1)[0];
    expect(stored.designTelemetry).toMatchObject({
      recipe: {
        category: 'saas-dashboard',
        style: 'enterprise',
      },
      outcome: {
        visualVerdict: 'strong',
        visualScore: 86,
        qualityImprovedAfterPolish: true,
      },
    });
    expect(generationTracer.format(stored)).toContain('saas-dashboard/enterprise');
  });
});

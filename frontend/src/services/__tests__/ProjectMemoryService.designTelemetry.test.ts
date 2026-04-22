// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import type { DesignRecipeTelemetry } from '../../shared/projectModel';
import { projectMemory, summarizeDesignTelemetryEntries } from '../ProjectMemoryService';

function buildTelemetry(overrides: Partial<DesignRecipeTelemetry> = {}): DesignRecipeTelemetry {
  return {
    generationId: 'gen-1',
    timestamp: '2026-04-19T10:00:00.000Z',
    projectId: 'proj-design',
    generationMode: 'new',
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
      mode: 'preserve',
      structureLock: 'strict',
      changeEnvelope: 'visual_refresh_without_structural_change',
      visualSystemReset: false,
      structureChangeAllowed: false,
      screensInScopeCount: 2,
      brandAnchorsCount: 1,
    },
    assets: {
      componentRemotePolicy: 'disallow',
      preferredComponentSources: ['shadcn/ui primitives'],
      iconPreferredSource: 'lucide-react',
      mediaRemotePolicy: 'avoid',
      fontLoadingStrategy: 'local_preferred',
      advancedRemotePolicy: 'avoid',
      previewSafeFallbackRequired: true,
    },
    outcome: {
      visualVerdict: 'acceptable',
      visualBand: 'medium',
      visualScore: 66,
      reasons: ['Clear visual hierarchy', 'CTA is visually clear'],
      polishOutcome: 'applied',
      polishApplied: true,
      qualityImprovedAfterPolish: true,
      polishDeltaScore: 12,
      polishTriggerReasons: ['weak hierarchy', 'CTA not prominent'],
    },
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe('ProjectMemoryService design telemetry', () => {
  it('writes design telemetry alongside generation memory', () => {
    const projectId = 'proj-design';
    const telemetry = buildTelemetry();

    projectMemory.recordGeneration(projectId, {
      appName: 'Telemetry App',
      intent: 'Build an analytics workspace',
      mode: 'new',
      files: { 'src/App.tsx': 'export default function App() { return null; }' },
      outcome: 'success',
      designTelemetry: telemetry,
    });

    const saved = projectMemory.get(projectId);
    expect(saved.designTelemetry).toHaveLength(1);
    expect(saved.designTelemetry?.[0]).toMatchObject({
      recipe: {
        category: 'saas-dashboard',
        style: 'enterprise',
        visualArchetype: 'operator cockpit',
      },
      redesign: {
        mode: 'preserve',
        structureLock: 'strict',
      },
      assets: {
        mediaRemotePolicy: 'avoid',
        fontLoadingStrategy: 'local_preferred',
      },
      outcome: {
        visualVerdict: 'acceptable',
        visualScore: 66,
      },
    });
  });

  it('preserves polish outcome deltas and supports recipe summaries', () => {
    const summary = summarizeDesignTelemetryEntries([
      buildTelemetry(),
      buildTelemetry({
        generationId: 'gen-2',
        timestamp: '2026-04-19T10:05:00.000Z',
        outcome: {
          visualVerdict: 'strong',
          visualBand: 'high',
          visualScore: 84,
          reasons: ['Strong hierarchy'],
          polishOutcome: 'not-needed',
          polishApplied: false,
          qualityImprovedAfterPolish: false,
          polishTriggerReasons: [],
        },
      }),
      buildTelemetry({
        generationId: 'gen-3',
        recipe: {
          category: 'marketing-site',
          style: 'editorial',
          visualArchetype: 'magazine spread',
          density: 'comfortable',
          breathingRoom: 'airy',
          shellStyle: 'Immersive editorial stack',
          hierarchyEmphasis: 'Lead with hero storytelling',
          ctaStrategy: 'Late CTA after proof',
          mobileComposition: 'Story-first vertical flow',
        },
        redesign: {
          mode: 'full_redesign',
          structureLock: 'flexible',
          changeEnvelope: 'structural_redesign',
          visualSystemReset: true,
          structureChangeAllowed: true,
          screensInScopeCount: 4,
          brandAnchorsCount: 0,
        },
        outcome: {
          visualVerdict: 'weak',
          visualBand: 'low',
          visualScore: 42,
          reasons: ['Crowded layout'],
          polishOutcome: 'failed',
          polishApplied: false,
          qualityImprovedAfterPolish: false,
          polishDeltaScore: -2,
          polishTriggerReasons: ['crowded layout'],
        },
      }),
    ]);

    expect(summary.totalSamples).toBe(3);
    expect(summary.bestRecipes[0]).toMatchObject({
      key: 'saas-dashboard/enterprise/operator cockpit',
      sampleCount: 2,
    });
    expect(summary.redesignModeSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'preserve/strict' }),
      expect.objectContaining({ key: 'full_redesign/flexible' }),
    ]));
    expect(summary.correctionPatternSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ pattern: 'weak hierarchy', avgDeltaScore: 12 }),
      expect.objectContaining({ pattern: 'crowded layout', avgDeltaScore: -2 }),
    ]));
  });

  it('remains backward compatible when design telemetry is absent', () => {
    const projectId = 'proj-legacy';

    localStorage.setItem(
      'PROJECT_MEM_proj-legacy',
      JSON.stringify({
        projectId,
        appName: 'Legacy App',
        intent: 'Legacy',
        techStack: {
          framework: 'react',
          backend: null,
          auth: null,
          stateManagement: null,
          hasPayments: false,
          hasRealtime: false,
        },
        packages: [],
        envVars: [],
        routes: [],
        schemaDecisions: [],
        knownIssues: [],
        generationHistory: [],
        notes: [],
        createdAt: '2026-04-19T09:00:00.000Z',
        updatedAt: '2026-04-19T09:00:00.000Z',
      }),
    );

    expect(projectMemory.getDesignTelemetry(projectId)).toEqual([]);
    expect(projectMemory.summarizeDesignTelemetry(projectId)).toMatchObject({
      totalSamples: 0,
      notes: ['No design telemetry recorded yet.'],
    });
  });
});

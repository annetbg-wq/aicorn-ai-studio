// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  formatKickoffScopePrompt,
  resolveApprovedBuildPlan,
  type ProjectPlan,
} from '../SimpleGeneration';

describe('SimpleGeneration kickoff handoff', () => {
  const basePlan: ProjectPlan = {
    appName: 'KickoffBase',
    description: 'Base plan',
    theme: 'dark-slate',
    layout: { type: 'app', navigation: 'tabs' },
    pages: [
      {
        path: '/',
        name: 'Home',
        file: 'src/pages/Home.tsx',
        purpose: 'Landing view',
        isMainScreen: true,
      },
    ],
    shadcnComponents: ['card'],
    icons: ['Home'],
  };

  it('uses the enriched approved plan as the real build source of truth', () => {
    const approvedPlan: ProjectPlan = {
      ...basePlan,
      description: 'Scoped plan',
      criticalUiRules: ['Build only the approved backend scope'],
      artistLayer: {
        version: 1,
        classification: {
          category: 'saas-dashboard',
          style: 'enterprise',
          confidence: 0.91,
          reasoning: 'Approved plan includes explicit artist-layer context',
        },
        designDirection: {
          visualArchetype: 'operator cockpit',
          density: 'compact',
          breathingRoom: 'compressed',
          shellStyle: 'Structured workspace shell',
          hierarchyEmphasis: 'Lead with KPIs and queues',
          contentRhythm: 'Dashboard zones',
          ctaStrategy: 'One primary operational action',
          imageryStrategy: 'Prefer product states over decorative photography',
          motionStrategy: 'Minimal orientation and feedback motion',
          mobileComposition: 'Single-column summary with action anchors',
          avoidConstraints: ['Avoid decorative hero art'],
          rationale: ['Approved kickoff keeps the product operational'],
        },
        redesignIntent: {
          mode: 'preserve',
          structureLock: 'strict',
          brandAnchorsToPreserve: ['existing information architecture'],
          screensInScope: ['Home'],
          visualSystemReset: false,
          changeEnvelope: 'visual_refresh_without_structural_change',
          structureChangeAllowed: false,
          inspectionNotes: ['Keep structure stable'],
        },
        assetPolicy: {
          components: {
            allowedSources: ['shadcn/ui primitives'],
            preferredSources: ['shadcn/ui primitives'],
            remoteComponentPolicy: 'disallow',
            consistencyRules: ['Use one component vocabulary'],
            fallbackPolicy: 'Fallback to local primitives',
          },
          icons: {
            allowedSources: ['lucide-react'],
            preferredSource: 'lucide-react',
            consistencyRules: ['Use one icon family'],
            fallbackPolicy: 'Fallback to lucide-react',
          },
          media: {
            remoteAssetPolicy: 'avoid',
            allowedSources: ['self-contained gradients'],
            consistencyRules: ['Keep previews self-contained'],
            fallbackPolicy: 'Use gradients and inline SVG',
            rationale: 'Stable previews first',
          },
          fonts: {
            loadingStrategy: 'local_preferred',
            allowedSources: ['system font stack'],
            fallbackFamilies: ['Inter', 'system-ui', 'sans-serif'],
            rationale: 'Stable previews first',
          },
          advancedResources: {
            allowedSources: ['CSS gradients'],
            remoteAssetPolicy: 'avoid',
            consistencyRules: ['Keep effects secondary'],
            fallbackPolicy: 'Fallback to CSS-only styling',
          },
          previewSafeFallback: {
            required: true,
            componentStrategy: 'Use local primitives',
            mediaStrategy: 'Use self-contained gradients',
            fontStrategy: 'Use system fallbacks',
            iconStrategy: 'Use lucide icons',
          },
        },
      },
      kickoffScope: {
        id: 'core_backend',
        label: 'Build core + backend',
        description: 'Backend included',
        selectedCapabilityIds: ['backend', 'auth'],
        deferredCapabilityIds: ['ai_chat'],
      },
      architectKickoff: {
        selectedOptionId: 'core_backend',
        selectedOptionLabel: 'Build core + backend',
      },
    };

    const resolved = resolveApprovedBuildPlan(basePlan, {
      confirmed: true,
      approvedPlan,
      requiredKickoffScopeId: 'core_backend',
    });

    expect(resolved).toBe(approvedPlan);
    expect(resolved.kickoffScope).toEqual(expect.objectContaining({ id: 'core_backend' }));
    expect(resolved.artistLayer?.designDirection.visualArchetype).toBe('operator cockpit');
    expect(resolved.criticalUiRules).toEqual(expect.arrayContaining([
      'Build only the approved backend scope',
    ]));
  });

  it('logs confirmed kickoff handoff when the selected scope reaches generation', () => {
    const onLog = vi.fn();
    const approvedPlan: ProjectPlan = {
      ...basePlan,
      kickoffScope: {
        id: 'core',
        label: 'Build core',
        description: 'Core only',
        selectedCapabilityIds: [],
        deferredCapabilityIds: ['backend'],
      },
    };

    resolveApprovedBuildPlan(basePlan, {
      confirmed: true,
      approvedPlan,
      requiredKickoffScopeId: 'core',
    }, onLog);

    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Kickoff scope handoff confirmed: core'));
  });

  it('fails loudly when required kickoff scope is missing from the approved plan', () => {
    const onLog = vi.fn();

    expect(() =>
      resolveApprovedBuildPlan(basePlan, {
        confirmed: true,
        approvedPlan: basePlan,
        requiredKickoffScopeId: 'core_backend_ai',
      }, onLog),
    ).toThrow(/Kickoff scope handoff failed/);

    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('expected core_backend_ai'));
  });

  it('fails loudly when kickoff scope required but approved plan is absent', () => {
    const onLog = vi.fn();

    expect(() =>
      resolveApprovedBuildPlan(basePlan, {
        confirmed: true,
        requiredKickoffScopeId: 'core_backend',
      }, onLog),
    ).toThrow(/approved plan missing/);

    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('approved plan missing'));
  });

  it('keeps kickoff scope prompt injection as a hard build constraint', () => {
    const promptBlock = formatKickoffScopePrompt({
      ...basePlan,
      kickoffScope: {
        id: 'core_backend',
        label: 'Build core + backend',
        description: 'Backend included',
        selectedCapabilityIds: ['backend', 'auth'],
        deferredCapabilityIds: ['ai_chat'],
        branchBriefSummary: 'Ship the core product with real persistence',
      },
    });

    expect(promptBlock).toContain('Selected kickoff scope: Build core + backend');
    expect(promptBlock).toContain('Required capabilities in this build: backend, auth');
    expect(promptBlock).toContain('Defer these capabilities for later: ai_chat');
    expect(promptBlock).toContain('Treat this kickoff scope as a hard constraint for the current first build.');
  });
});

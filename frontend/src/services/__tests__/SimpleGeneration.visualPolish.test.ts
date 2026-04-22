// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { ArtistLayerSpec, VisualQualitySummary } from '../../shared/projectModel';
import {
  buildVisualPolishInstructionBlock,
  decideVisualPolishPass,
  getVisualPolishTargets,
  validateVisualPolishAgainstArtistLayer,
} from '../SimpleGeneration';

function buildVisualSummary(input: Partial<VisualQualitySummary> = {}): VisualQualitySummary {
  return {
    verdict: 'weak',
    band: 'low',
    score: 40,
    reasons: ['Weak hierarchy', 'Crowded layout'],
    dimensions: [
      { id: 'visual-hierarchy', verdict: 'weak', score: 31, reasons: ['Weak hierarchy'] },
      { id: 'clutter-breathing-room', verdict: 'weak', score: 36, reasons: ['Crowded layout'] },
      { id: 'spacing-consistency', verdict: 'weak', score: 41, reasons: ['Inconsistent spacing'] },
      { id: 'cta-prominence', verdict: 'acceptable', score: 61, reasons: ['CTA clarity is workable'] },
      { id: 'state-completeness', verdict: 'weak', score: 42, reasons: ['Poor state polish'] },
    ],
    ...input,
  };
}

function buildArtistLayer(overrides: Partial<ArtistLayerSpec> = {}): ArtistLayerSpec {
  return {
    version: 1,
    classification: {
      category: 'saas-dashboard',
      style: 'enterprise',
      confidence: 0.93,
      reasoning: 'Keep the existing operator shell coherent.',
    },
    designDirection: {
      visualArchetype: 'operator cockpit',
      density: 'compact',
      breathingRoom: 'compressed',
      shellStyle: 'Structured workspace shell',
      hierarchyEmphasis: 'Lead with KPIs and queues',
      contentRhythm: 'Dashboard zones',
      ctaStrategy: 'One primary operational action',
      imageryStrategy: 'Prefer product states over decorative media',
      motionStrategy: 'Minimal orientation motion',
      mobileComposition: 'Single-column summary with action anchors',
      avoidConstraints: ['Avoid decorative hero art'],
      rationale: ['Preserve the existing operator workflow.'],
    },
    redesignIntent: {
      mode: 'preserve',
      structureLock: 'strict',
      brandAnchorsToPreserve: ['Existing navigation model'],
      screensInScope: ['Dashboard', 'Settings'],
      visualSystemReset: false,
      changeEnvelope: 'visual_refresh_without_structural_change',
      structureChangeAllowed: false,
      inspectionNotes: ['Do not rewrite the route map.'],
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
        fallbackPolicy: 'Use gradients or inline SVG',
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
    ...overrides,
  };
}

describe('SimpleGeneration visual polish helpers', () => {
  it('skips polish when the visual result is already strong', () => {
    const summary = buildVisualSummary({
      verdict: 'strong',
      band: 'high',
      score: 87,
      dimensions: [
        { id: 'visual-hierarchy', verdict: 'strong', score: 88, reasons: ['Clear hierarchy'] },
        { id: 'spacing-consistency', verdict: 'strong', score: 85, reasons: ['Good spacing'] },
      ],
    });

    const decision = decideVisualPolishPass({
      summary,
      mode: 'fast_prototype',
    });

    expect(decision.shouldAttempt).toBe(false);
    expect(decision.note).toContain('cleared the polish threshold');
  });

  it('triggers one bounded polish pass for clearly weak fast prototypes', () => {
    const decision = decideVisualPolishPass({
      summary: buildVisualSummary(),
      mode: 'fast_prototype',
    });

    expect(decision.shouldAttempt).toBe(true);
    expect(decision.maxPasses).toBe(1);
    expect(decision.triggerReasons).toEqual(expect.arrayContaining([
      'weak hierarchy',
      'crowded layout',
      'inconsistent spacing',
    ]));
  });

  it('keeps fast prototype mode low-friction for borderline weak visuals', () => {
    const borderline = buildVisualSummary({
      score: 49,
      dimensions: [
        { id: 'visual-hierarchy', verdict: 'weak', score: 45, reasons: ['Weak hierarchy'] },
        { id: 'spacing-consistency', verdict: 'acceptable', score: 60, reasons: ['Mostly okay'] },
        { id: 'cta-prominence', verdict: 'acceptable', score: 62, reasons: ['Mostly okay'] },
        { id: 'mobile-fit', verdict: 'acceptable', score: 63, reasons: ['Mostly okay'] },
      ],
    });

    const decision = decideVisualPolishPass({
      summary: borderline,
      mode: 'fast_prototype',
    });

    expect(decision.shouldAttempt).toBe(false);
    expect(decision.note).toContain('Fast prototype mode');
  });

  it('lets architect-guided mode escalate any weak visual verdict', () => {
    const borderline = buildVisualSummary({
      score: 49,
      dimensions: [
        { id: 'visual-hierarchy', verdict: 'weak', score: 45, reasons: ['Weak hierarchy'] },
        { id: 'spacing-consistency', verdict: 'acceptable', score: 60, reasons: ['Mostly okay'] },
        { id: 'cta-prominence', verdict: 'acceptable', score: 62, reasons: ['Mostly okay'] },
        { id: 'mobile-fit', verdict: 'acceptable', score: 63, reasons: ['Mostly okay'] },
      ],
    });

    const decision = decideVisualPolishPass({
      summary: borderline,
      mode: 'architect_guided',
    });

    expect(decision.shouldAttempt).toBe(true);
    expect(decision.note).toContain('Architect-guided mode');
  });

  it('stays bounded after one attempt', () => {
    const decision = decideVisualPolishPass({
      summary: buildVisualSummary(),
      mode: 'architect_guided',
      attempts: 1,
      maxPasses: 1,
    });

    expect(decision.shouldAttempt).toBe(false);
    expect(decision.note).toContain('one-pass limit');
  });

  it('builds targeted polish instructions that respect redesign intent', () => {
    const instructionBlock = buildVisualPolishInstructionBlock({
      summary: buildVisualSummary(),
      mode: 'architect_guided',
      artistLayer: buildArtistLayer(),
    });

    expect(instructionBlock).toContain('VISUAL POLISH PASS (ONE PASS ONLY)');
    expect(instructionBlock).toContain('weak hierarchy');
    expect(instructionBlock).toContain('crowded layout');
    expect(instructionBlock).toContain('Do not silently rewrite the information architecture');
    expect(instructionBlock).toContain('Structure lock is strict');
    expect(instructionBlock).toContain('Dashboard, Settings');
  });

  it('blocks polish changes that violate the asset policy or structure lock', () => {
    const baselineFiles = {
      'src/App.tsx': `
        import { Button } from "@/components/ui/button";
        import { Home } from "lucide-react";
        export default function App() {
          return <Button className="w-full">Save</Button>;
        }
      `,
    };
    const candidateFiles = {
      ...baselineFiles,
      'src/pages/NewPage.tsx': `
        import { Button } from "@mui/material";
        import { Bell } from "@heroicons/react/24/outline";
        export default function NewPage() {
          return (
            <>
              <img src="https://cdn.example.com/hero.png" />
              <style>{'@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap");'}</style>
              <Button>Launch</Button>
            </>
          );
        }
      `,
    };

    const validation = validateVisualPolishAgainstArtistLayer({
      baselineFiles,
      candidateFiles,
      artistLayer: buildArtistLayer(),
    });

    expect(validation.valid).toBe(false);
    expect(validation.violations.join(' | ')).toContain('new files');
    expect(validation.violations.join(' | ')).toContain('@mui/material');
    expect(validation.violations.join(' | ')).toContain('@heroicons');
    expect(validation.violations.join(' | ')).toContain('remote asset URLs');
    expect(validation.violations.join(' | ')).toContain('remote font loading');
  });

  it('derives concrete polish targets from weak visual dimensions', () => {
    expect(getVisualPolishTargets(buildVisualSummary())).toEqual(expect.arrayContaining([
      'weak hierarchy',
      'crowded layout',
      'inconsistent spacing',
      'poor state polish',
    ]));
  });
});

import { describe, expect, it } from 'vitest';

import type { ProjectPlan } from '../SimpleGeneration';
import { buildArtistLayer } from '../designSystem';
import { buildDesignSystemPrompt } from '../designSystem/promptBuilder';

describe('design direction artist layer', () => {
  it('produces an explicit design direction with implementation-ready fields', () => {
    const artistLayer = buildArtistLayer({
      idea: 'Build a B2B analytics dashboard for revenue operations teams',
      classification: {
        category: 'analytics-bi',
        style: 'enterprise',
        confidence: 0.92,
        reasoning: 'Data-heavy B2B workflow with trust requirements',
      },
      existingFileCount: 0,
      appName: 'Revenue Pulse',
      currentTheme: 'trust',
    });

    expect(artistLayer.designDirection.visualArchetype).toBeTruthy();
    expect(artistLayer.designDirection.density).toBe('compact');
    expect(artistLayer.designDirection.shellStyle).toContain('shell');
    expect(artistLayer.designDirection.hierarchyEmphasis).toBeTruthy();
    expect(artistLayer.designDirection.contentRhythm).toBeTruthy();
    expect(artistLayer.designDirection.ctaStrategy).toBeTruthy();
    expect(artistLayer.designDirection.imageryStrategy).toBeTruthy();
    expect(artistLayer.designDirection.motionStrategy).toBeTruthy();
    expect(artistLayer.designDirection.mobileComposition).toBeTruthy();
    expect(artistLayer.designDirection.avoidConstraints.length).toBeGreaterThan(1);
  });

  it('represents redesign intent explicitly and branch-safely', () => {
    const artistLayer = buildArtistLayer({
      idea: 'Full retheme the dashboard but keep the current structure and navigation',
      classification: {
        category: 'analytics-bi',
        style: 'enterprise',
        confidence: 0.88,
        reasoning: 'Scoped visual reset request for an existing analytics product',
      },
      existingFileCount: 12,
      appName: 'Revenue Pulse',
      currentTheme: 'dark-slate',
    });

    expect(artistLayer.redesignIntent.mode).toBe('full_retheme');
    expect(artistLayer.redesignIntent.structureLock).toBe('prefer');
    expect(artistLayer.redesignIntent.visualSystemReset).toBe(true);
    expect(artistLayer.redesignIntent.changeEnvelope).toBe('full_visual_reset');
    expect(artistLayer.redesignIntent.structureChangeAllowed).toBe(false);
  });

  it('changes redesign intent semantics when existing file context changes', () => {
    const greenfield = buildArtistLayer({
      idea: 'Visual refresh for the UI without changing structure',
      classification: {
        category: 'task-manager',
        style: 'clean-light',
        confidence: 0.8,
        reasoning: 'Productivity refresh with stable structure',
      },
      existingFileCount: 0,
    });

    const existingProject = buildArtistLayer({
      idea: 'Visual refresh for the UI without changing structure',
      classification: {
        category: 'task-manager',
        style: 'clean-light',
        confidence: 0.8,
        reasoning: 'Productivity refresh with stable structure',
      },
      existingFileCount: 8,
    });

    expect(greenfield.redesignIntent.changeEnvelope).toBe('greenfield_foundation');
    expect(existingProject.redesignIntent.mode).toBe('partial_restyle');
    expect(existingProject.redesignIntent.changeEnvelope).toBe('visual_refresh_without_structural_change');
  });

  it('represents asset and source policy explicitly', () => {
    const artistLayer = buildArtistLayer({
      idea: 'Build a travel experiences marketplace with destination-led storytelling',
      classification: {
        category: 'travel-experiences',
        style: 'editorial',
        confidence: 0.91,
        reasoning: 'Travel inspiration benefits from editorial storytelling and realism',
      },
      existingFileCount: 0,
    });

    expect(artistLayer.assetPolicy.components.allowedSources).toContain('shadcn/ui primitives');
    expect(artistLayer.assetPolicy.icons.preferredSource).toBe('lucide-react');
    expect(artistLayer.assetPolicy.media.remoteAssetPolicy).toBe('allow');
    expect(artistLayer.assetPolicy.fonts.loadingStrategy).toBe('remote_allowed');
    expect(artistLayer.assetPolicy.previewSafeFallback.required).toBe(true);
  });

  it('yields meaningfully different direction for different idea categories', () => {
    const operatorLayer = buildArtistLayer({
      idea: 'Build a B2B analytics dashboard for revenue operations teams',
      classification: {
        category: 'analytics-bi',
        style: 'enterprise',
        confidence: 0.92,
        reasoning: 'Data-heavy B2B workflow with trust requirements',
      },
      existingFileCount: 0,
    });

    const editorialLayer = buildArtistLayer({
      idea: 'Build a travel experiences marketplace with destination-led storytelling',
      classification: {
        category: 'travel-experiences',
        style: 'editorial',
        confidence: 0.91,
        reasoning: 'Travel inspiration benefits from editorial storytelling and realism',
      },
      existingFileCount: 0,
    });

    expect(operatorLayer.designDirection.visualArchetype).not.toBe(editorialLayer.designDirection.visualArchetype);
    expect(operatorLayer.designDirection.hierarchyEmphasis).not.toBe(editorialLayer.designDirection.hierarchyEmphasis);
    expect(operatorLayer.designDirection.imageryStrategy).not.toBe(editorialLayer.designDirection.imageryStrategy);
    expect(operatorLayer.designDirection.mobileComposition).not.toBe(editorialLayer.designDirection.mobileComposition);
  });

  it('preserves backward compatibility for existing ProjectPlan consumers', () => {
    const legacyPlan: ProjectPlan = {
      appName: 'Legacy Plan',
      description: 'Existing plan fields still work',
      theme: 'dark-slate',
      layout: { type: 'tabs', navigation: 'bottom-tabs' },
      pages: [
        {
          path: '/',
          name: 'Home',
          file: 'pages/Home.tsx',
          purpose: 'Primary view',
          isMainScreen: true,
        },
      ],
      shadcnComponents: ['Button', 'Card'],
      icons: ['Home'],
    };

    const enrichedPlan: ProjectPlan = {
      ...legacyPlan,
      artistLayer: buildArtistLayer({
        idea: 'Refresh the app visuals without changing structure',
        classification: {
          category: 'task-manager',
          style: 'clean-light',
          confidence: 0.8,
          reasoning: 'Productivity refresh with stable structure',
        },
        existingFileCount: 8,
        appName: legacyPlan.appName,
        currentTheme: legacyPlan.theme,
      }),
    };

    expect(enrichedPlan.appName).toBe(legacyPlan.appName);
    expect(enrichedPlan.theme).toBe(legacyPlan.theme);
    expect(enrichedPlan.layout).toEqual(legacyPlan.layout);
    expect(enrichedPlan.pages).toEqual(legacyPlan.pages);
    expect(enrichedPlan.artistLayer?.designDirection.visualArchetype).toBeTruthy();
  });

  it('keeps the generic design-system prompt free of competing artist-layer blocks', () => {
    const prompt = buildDesignSystemPrompt({
      category: 'task-manager',
      style: 'clean-light',
      idea: 'Refresh the app visuals without changing structure',
      classification: {
        category: 'task-manager',
        style: 'clean-light',
        confidence: 0.8,
        reasoning: 'Productivity refresh with stable structure',
      },
    });

    expect(prompt).not.toContain('═══ ARTIST LAYER — SOURCE OF TRUTH ═══');
    expect(prompt).not.toContain('Change envelope:');
  });
});

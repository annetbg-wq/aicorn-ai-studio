// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { buildSystemPrompt } from '../Orchestrator';
import type { ProductManifest } from '../../shared/projectModel';

function buildManifestWithArtistLayer(): ProductManifest {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    version: 1,
    id: 'manifest-artist',
    name: 'Revenue Pulse',
    description: 'Analytics workspace',
    intent: 'Improve the dashboard visuals without changing structure',
    targetPlatforms: ['web'],
    techStack: {
      framework: 'react',
      language: 'typescript',
      styling: 'tailwind',
      bundler: 'vite',
      backend: null,
      stateManagement: null,
    },
    createdAt: now,
    updatedAt: now,
    artistLayer: {
      version: 1,
      classification: {
        category: 'analytics-bi',
        style: 'enterprise',
        confidence: 0.94,
        reasoning: 'Existing B2B dashboard artist layer',
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
        rationale: ['Manifest artist layer should be carried into Orchestrator'],
      },
      redesignIntent: {
        mode: 'partial_restyle',
        structureLock: 'strict',
        brandAnchorsToPreserve: ['existing information architecture'],
        screensInScope: ['Dashboard'],
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
  };
}

describe('Orchestrator artist-layer integration', () => {
  it('carries manifest artist layer into the system prompt', () => {
    const prompt = buildSystemPrompt(
      { 'App.tsx': 'export default function App() { return null; }' },
      'en',
      buildManifestWithArtistLayer(),
    );

    expect(prompt).toContain('## ARTIST LAYER — CURRENT SOURCE OF TRUTH');
    expect(prompt).toContain('Visual archetype: operator cockpit');
    expect(prompt).toContain('Change envelope: visual_refresh_without_structural_change');
    expect(prompt).toContain('Preview-safe fallback: Use self-contained gradients');
    expect(prompt.match(/═══ ARTIST LAYER — SOURCE OF TRUTH ═══/g)?.length ?? 0).toBe(1);
  });

  it('recovers artist-layer context from project manifest files when manifest.artistLayer is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const prompt = buildSystemPrompt(
      {
        'App.tsx': 'export default function App() { return null; }',
        'PROJECT_MANIFEST.json': JSON.stringify(buildManifestWithArtistLayer(), null, 2),
      },
      'en',
      {
        ...buildManifestWithArtistLayer(),
        artistLayer: undefined,
      },
    );

    expect(prompt).toContain('## ARTIST LAYER — CURRENT SOURCE OF TRUTH');
    expect(prompt).toContain('Recovered from project manifest file context because manifest.artistLayer was missing.');
    expect(prompt).toContain('Visual archetype: operator cockpit');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('recovered artist layer from project manifest file context'));
    warn.mockRestore();
  });

  it('signals clearly when no artist-layer source can be recovered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const prompt = buildSystemPrompt(
      { 'App.tsx': 'export default function App() { return null; }' },
      'en',
      {
        ...buildManifestWithArtistLayer(),
        artistLayer: undefined,
      },
    );

    expect(prompt).toContain('## ARTIST LAYER STATUS');
    expect(prompt).toContain('manifest.artistLayer is missing');
    expect(prompt).toContain('avoid speculative reclassification');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no reusable artist layer was found'));
    warn.mockRestore();
  });
});

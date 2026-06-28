// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import { clearFileVisualSelectionMemory } from '../FileVisualBankService';
import { materializeMediaAssets } from '../ProtoPipeline';
import {
  buildDesignSelectionDiagnostics,
  buildVisualUsageDiagnostics,
  serializeDesignSelectionDiagnostics,
  serializeVisualUsageDiagnostics,
} from '../ProtoPipeline';

vi.mock('../../lib/supabase', () => {
  const unavailable = new Error('Supabase is intentionally disabled in ProtoPipeline unit tests.');
  const fallback = { data: null, error: unavailable };
  const query = {
    data: null,
    error: unavailable,
    eq: () => ({ single: async () => fallback }),
    single: async () => fallback,
  };

  return {
    supabase: {
      from: () => ({
        select: () => query,
      }),
    },
  };
});

describe('ProtoPipeline diagnostics', () => {
  beforeEach(() => {
    clearFileVisualSelectionMemory();
  });

  it('records selected skeleton id and premium recipe id in design selection diagnostics telemetry', async () => {
    const brief = 'wellness mobile app with habit routine tracking';
    const ctx = await resolveDesignContext(brief, 'mobile-app');
    const diagnostics = buildDesignSelectionDiagnostics({
      inputBrief: brief,
      selectedSkeletonId: 'mobile-app',
      designCtx: ctx,
      selectedMediaKinds: [],
      selectedMediaReasons: [],
    });
    const telemetry = serializeDesignSelectionDiagnostics(diagnostics);

    expect(diagnostics.selectedSkeletonId).toBe('mobile-app');
    expect(diagnostics.selectedPremiumRecipeId).toBe('health-wellness-mobile');
    expect(diagnostics.selectedPremiumComponentIds.length).toBeGreaterThan(0);
    expect(telemetry.selected_skeleton_id).toBe('mobile-app');
    expect(telemetry.selected_premium_recipe_id).toBe('health-wellness-mobile');
  });

  it('records visual fallback status when fallback visual selection is used', async () => {
    const ctx = await resolveDesignContext('test', 'mobile-app', { visualPacksOverride: [] });
    const diagnostics = buildDesignSelectionDiagnostics({
      inputBrief: 'test',
      selectedSkeletonId: 'mobile-app',
      designCtx: ctx,
      selectedMediaKinds: [],
      selectedMediaReasons: [],
    });

    expect(diagnostics.visualPackFallbackUsed).toBe(true);
    expect(diagnostics.visualPackSelectionReason).toBe('selected by fallback visual selection');
    expect(diagnostics.possibleMismatchWarnings).toContain(
      'Visual fallback was used, so design direction may be less product-specific.',
    );
  });

  it('records selected media kinds and reasons in design selection diagnostics', async () => {
    const brief = 'landing page for a SaaS product launch with hero visual';
    const ctx = await resolveDesignContext(brief, 'landing-page');
    const media = await materializeMediaAssets(ctx, brief, 'landing-page');
    const diagnostics = buildDesignSelectionDiagnostics({
      inputBrief: brief,
      selectedSkeletonId: 'landing-page',
      designCtx: ctx,
      selectedMediaKinds: media.mediaHints.map(hint => hint.kind),
      selectedMediaReasons: media.selectionReasons,
    });

    expect(diagnostics.selectedMediaKinds).toContain('hero-image');
    expect(diagnostics.selectedMediaReasons.length).toBeGreaterThan(0);
    expect(diagnostics.selectedMediaReasons.join(' ')).toMatch(/landing-page hero|dashboard preview|background/i);
  });

  it('reports premiumUsageObserved=false when selected components exist but generated source has no premium import', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'App.tsx': 'export default function App(){ return <main>No premium imports</main>; }',
      },
      skeletonId: 'mobile-app',
      selectedPremiumComponentIds: ['health-hero'],
      materializedMediaFiles: [],
    });

    expect(diagnostics.premiumUsageChecked).toBe(true);
    expect(diagnostics.premiumUsageObserved).toBe(false);
    expect(diagnostics.suggestedNextAction).toBe('improve_prompt');
  });

  it('flags surviving skeleton-default copy/seed as a generic-placeholder finding (product-identity gate)', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'data/seed.ts': "export const items = [{ title: 'Morning intention' }, { title: 'Deep work block' }];",
        'pages/Home.tsx': "export default function Home(){ return (<><h1>Today's space</h1><p>Nothing here yet</p></>); }",
        'config/app.ts': "export const appConfig = { name: 'AppName' };",
      },
      skeletonId: 'mobile-app',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });
    const labels = diagnostics.genericPlaceholderFindings.map(f => f.split(': ').slice(1).join(': '));
    expect(labels).toEqual(expect.arrayContaining([
      'Morning intention', 'Deep work block', "Today's space", 'Nothing here yet', 'AppName',
    ]));
  });

  it('treats missing editable identity slots as violations because skeleton defaults would otherwise ship', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'pages/Detail.tsx': 'export default function Detail(){ return <main>Customer renewal risk detail</main>; }',
      },
      skeletonId: 'mobile-app',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });

    expect(diagnostics.identitySlotFindings).toEqual(expect.arrayContaining([
      'config/app.ts: missing identity slot',
      'config/navigation.ts: missing identity slot',
      'data/seed.ts: missing identity slot',
      'pages/Home.tsx: missing identity slot',
    ]));
    expect(diagnostics.repairableMissingIdentityPaths).toEqual(expect.arrayContaining([
      'config/app.ts',
      'config/navigation.ts',
      'data/seed.ts',
      'pages/Home.tsx',
    ]));
  });

  it('flags identity slots when coder output still contains skeleton fingerprints', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'config/app.ts': "export const APP_CONFIG = { name: 'AppName' };\nexport const STORAGE_KEYS = {};",
        'config/navigation.ts': [
          'export const BOTTOM_TABS = [',
          "  { label: 'Home' },",
          "  { label: 'Create' },",
          "  { label: 'Progress' },",
          "  { label: 'Profile' },",
          '];',
        ].join('\n'),
        'data/seed.ts': "export const SEED_FEED = [{ title: 'Morning intention' }];",
        'pages/Home.tsx': "export default function Home(){ return <main><h1>Today's space</h1><p>Nothing here yet</p></main>; }",
      },
      skeletonId: 'mobile-app',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });

    expect(diagnostics.identitySlotFindings).toEqual(expect.arrayContaining([
      'config/app.ts: AppName',
      'config/navigation.ts: default mobile navigation',
      'data/seed.ts: Morning intention',
      'pages/Home.tsx: Nothing here yet',
      "pages/Home.tsx: Today's space",
    ]));
  });

  it('passes identity-slot diagnostics when shipped mobile-app slots contain domain-specific content', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'config/app.ts': [
          'export const APP_CONFIG = {',
          "  name: 'Dealflow Radar',",
          "  tagline: 'Pipeline coaching for revenue teams',",
          '};',
          'export const STORAGE_KEYS = { profile: "dealflow.profile" };',
        ].join('\n'),
        'config/navigation.ts': [
          'export const BOTTOM_TABS = [',
          "  { label: 'Pipeline' },",
          "  { label: 'Actions' },",
          "  { label: 'Forecast' },",
          "  { label: 'Team' },",
          '];',
        ].join('\n'),
        'data/seed.ts': "export const SEED_FEED = [{ title: 'Escalate stalled renewal' }, { title: 'Coach discovery follow-up' }];",
        'pages/Home.tsx': 'export default function Home(){ return <main>Forecast review center</main>; }',
      },
      skeletonId: 'mobile-app',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });

    expect(diagnostics.identitySlotFindings).toEqual([]);
    expect(diagnostics.repairableMissingIdentityPaths).toEqual([]);
  });

  it('reports premiumUsageObserved=true when generated source imports from premium component paths', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'pages/Home.tsx': [
          "import WellnessHero from '@/design-pack/premium-components/health/wellness-hero/component';",
          'export default function Home(){ return <WellnessHero />; }',
        ].join('\n'),
      },
      skeletonId: 'mobile-app',
      selectedPremiumComponentIds: ['wellness-hero'],
      materializedMediaFiles: [],
    });

    expect(diagnostics.premiumUsageObserved).toBe(true);
    expect(diagnostics.premiumComponentImportsFound[0]).toContain('@/design-pack/premium-components/');
  });

  it('reports mediaUsageObserved=false when media assets exist but generated source does not reference them', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'App.tsx': 'export default function App(){ return <main>No generated media</main>; }',
      },
      skeletonId: 'landing-page',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [
        'src/assets/generated/landing-hero.svg',
        'src/assets/generated/media-manifest.json',
      ],
    });

    expect(diagnostics.mediaUsageChecked).toBe(true);
    expect(diagnostics.mediaUsageObserved).toBe(false);
    expect(diagnostics.suggestedNextAction).toBe('improve_prompt');
  });

  it('reports mediaUsageObserved=true when generated source references a materialized SVG', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'App.tsx': 'export default function App(){ return <img src="src/assets/generated/landing-hero.svg" />; }',
      },
      skeletonId: 'landing-page',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [
        'src/assets/generated/landing-hero.svg',
        'src/assets/generated/media-manifest.json',
      ],
    });

    expect(diagnostics.mediaUsageObserved).toBe(true);
    expect(diagnostics.mediaAssetReferencesFound[0]).toContain('landing-hero.svg');
  });

  it('detects first-screen usage separately from secondary-screen usage', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'pages/Home.tsx': 'export default function Home(){ return <main>Home</main>; }',
        'pages/Settings.tsx': 'export default function Settings(){ return <img src="src/assets/generated/landing-hero.svg" />; }',
      },
      skeletonId: 'landing-page',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [
        'src/assets/generated/landing-hero.svg',
        'src/assets/generated/media-manifest.json',
      ],
    });

    expect(diagnostics.mediaUsageObserved).toBe(true);
    expect(diagnostics.firstScreenFilesChecked).toContain('pages/Home.tsx');
    expect(diagnostics.firstScreenMediaUsageObserved).toBe(false);
  });

  it('counts meaningful screens and ignores design-pack or generated asset files', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'App.tsx': 'export default function App(){ return <main />; }',
        'pages/Home.tsx': 'export default function Home(){ return <section />; }',
        'pages/Settings.tsx': 'export default function Settings(){ return <section />; }',
        'design-pack/premium-components/health/wellness-hero/component.tsx': 'export default function Ignore(){ return null; }',
        'src/assets/generated/landing-hero.svg': '<svg />',
        'hooks/useSession.ts': 'export function useSession(){ return null; }',
      },
      skeletonId: 'saas-dashboard',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });

    expect(diagnostics.meaningfulScreenFiles).toEqual(['App.tsx', 'pages/Home.tsx', 'pages/Settings.tsx']);
    expect(diagnostics.meaningfulScreenCount).toBe(3);
  });

  it('records generic placeholder findings', () => {
    const diagnostics = buildVisualUsageDiagnostics({
      files: {
        'App.tsx': 'export default function App(){ return <main>Lorem ipsum Feature 1 Coming soon</main>; }',
      },
      skeletonId: 'landing-page',
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });

    expect(diagnostics.genericPlaceholderFindings).toEqual([
      'App.tsx: Coming soon',
      'App.tsx: Feature 1',
      'App.tsx: Lorem',
      'App.tsx: lorem ipsum',
    ]);
  });

  it('serializes visual usage diagnostics and never throws when usage is missing', async () => {
    const brief = 'plain saas dashboard';
    const ctx = await resolveDesignContext(brief, 'saas-dashboard');

    const run = () => {
      const designDiagnostics = buildDesignSelectionDiagnostics({
        inputBrief: brief,
        selectedSkeletonId: 'saas-dashboard',
        designCtx: ctx,
        selectedMediaKinds: [],
        selectedMediaReasons: [],
      });
      const visualDiagnostics = buildVisualUsageDiagnostics({
        files: {
          'pages/Home.tsx': 'export default function Home(){ return <main>Dashboard</main>; }',
        },
        skeletonId: 'saas-dashboard',
        selectedPremiumComponentIds: ctx.premiumComponentSelection.selectedComponents.map(component => component.id),
        materializedMediaFiles: [],
        designSelectionDiagnostics: designDiagnostics,
      });
      return serializeVisualUsageDiagnostics(visualDiagnostics);
    };

    expect(run).not.toThrow();
    expect(run().suggested_next_action).toMatch(/improve_prompt|add_repair_later|none/);
  });
});

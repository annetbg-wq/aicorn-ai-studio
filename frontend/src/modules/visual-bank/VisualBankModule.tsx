import React, { useEffect, useMemo, useState } from 'react';
import * as FileVisualBankService from '../../services/FileVisualBankService';
import type {
  ColorFamilyTokenMap,
  NormalizedColorFamily,
  NormalizedVisualBank,
  NormalizedVisualPack,
  NormalizedVisualVariant,
  VisualBankJson,
} from '../../services/FileVisualBankService';
import type { SkeletonId } from '../../services/SkeletonRegistry';
import * as PremiumComponentBankService from '../../services/PremiumComponentBankService';
import type {
  PremiumComponentBank,
  PremiumComponentRecord,
  PremiumRecipeSchema,
} from '../../services/PremiumComponentBankService';

type Tab = 'overview' | 'sources' | 'themes' | 'components' | 'variants' | 'premium-components';
type SurfaceGroup = 'primitives' | 'cards' | 'blocks' | 'layouts' | 'patterns' | 'foundation' | 'other';

interface DesignSourceManifest {
  id?: string;
  name?: string;
  license?: string;
  licenseUrl?: string;
  url?: string;
  curated_categories?: string[];
  categories?: string[];
  normalizedInto?: string[];
  importedFiles?: string[];
  files?: string[];
  description?: string;
  [key: string]: unknown;
}

interface RuntimeDesignSource {
  id: string;
  name: string;
  license: string;
  url: string;
  categories: string[];
  normalizedInto: string[];
  importedFiles: string[];
  manifestPath: string;
  licenseFilePresent: boolean;
  raw: DesignSourceManifest;
}

interface RuntimeSurfaceFile {
  path: string;
  group: SurfaceGroup;
  kind: 'surface' | 'foundation';
}

interface RuntimeDiscovery {
  designSources: RuntimeDesignSource[];
  surfaceFiles: RuntimeSurfaceFile[];
  loadedAt: string;
  fallbackUsed: boolean;
  errors: string[];
}

interface PreviewTheme {
  vars: React.CSSProperties & Record<string, string | number>;
  tokens: Record<keyof ColorFamilyTokenMap, string | string[]>;
  spacingPx: number;
  radiusCard: string;
  radiusButton: string;
  radiusInput: string;
  fontFamily: string;
  fontWeight: number;
  elevation: string;
}

interface RenderMetrics {
  liveRenderEnabled: boolean;
  previewRenderer: string;
  renderSafeComponentsCount: number;
  renderedVariantsCount: number;
  renderedSkeletonPreview: string;
  appliedColorRamp: string;
  appliedTokenKeys: string[];
  fallbackRenderUsed: boolean;
  nonRenderableFilesCount: number;
  showcaseVerdict: 'PASS' | 'PARTIAL' | 'FAIL';
  previewRenderError: string | null;
  coldStateHeroVariantId: string;
  coldStateColorFamily: string;
  selectedSkeletonVariantsCount: number;
  nonNeutralVariantIds: string[];
  nonNeutralVariantsAvailable: boolean;
  heroStripRendered: boolean;
  neutralDefaultAvoided: boolean;
  heroStripFirstColorFamily: string;
}

interface VisualBankModuleProps {
  runtimeDiscoveryOverride?: Partial<RuntimeDiscovery>;
}

interface HeroVariantItem {
  packId: string;
  variant: NormalizedVisualVariant;
}

interface PremiumBankLoadState {
  bank: PremiumComponentBank;
  fallbackUsed: boolean;
  loadError: string | null;
}

interface PremiumLayerSelection {
  selectedRecipe: PremiumRecipeSchema | null;
  selectedRecipePath: string;
  exactRecipeFound: boolean;
  closestCompatibleRecipe: PremiumRecipeSchema | null;
  selectedComponents: PremiumComponentRecord[];
  warnings: string[];
}

const designSourceManifestModules = import.meta.glob(
  '../../../../prototype-bank/design-sources/*/manifest.json',
  { eager: true, import: 'default' },
) as Record<string, DesignSourceManifest>;

const designSourceLicenseModules = import.meta.glob(
  '../../../../prototype-bank/design-sources/*/license.md',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const surfaceFileModules = import.meta.glob(
  '../../../../prototype-bank/design-packs/surfaces/**/*.tsx',
) as Record<string, () => Promise<unknown>>;

const foundationFileModules = import.meta.glob(
  '../../../../prototype-bank/design-packs/foundation/**/*',
) as Record<string, () => Promise<unknown>>;

const TABS: Tab[] = ['overview', 'sources', 'themes', 'components', 'variants', 'premium-components'];
const SKELETON_ORDER: SkeletonId[] = [
  'saas-dashboard',
  'mobile-app',
  'landing-page',
  'ecommerce',
  'social-community',
  'productivity-tool',
];

const RENDER_SAFE_COMPONENTS = [
  { id: 'button', label: 'Preview Button', path: 'prototype-bank/design-packs/surfaces/primitives/button.tsx', group: 'primitives' as SurfaceGroup },
  { id: 'card', label: 'Preview Card', path: 'prototype-bank/design-packs/surfaces/primitives/card.tsx', group: 'primitives' as SurfaceGroup },
  { id: 'badge', label: 'Preview Badge', path: 'prototype-bank/design-packs/surfaces/primitives/badge.tsx', group: 'primitives' as SurfaceGroup },
  { id: 'input', label: 'Preview Search', path: 'prototype-bank/design-packs/surfaces/primitives/input.tsx', group: 'primitives' as SurfaceGroup },
  { id: 'stat-card', label: 'Preview Stat', path: 'prototype-bank/design-packs/surfaces/cards/stat-card.tsx', group: 'cards' as SurfaceGroup },
  { id: 'list-item', label: 'Preview List Row', path: 'prototype-bank/design-packs/surfaces/cards/list-item.tsx', group: 'cards' as SurfaceGroup },
  { id: 'mobile-nav', label: 'Preview Nav', path: 'prototype-bank/design-packs/surfaces/blocks/mobile-nav.tsx', group: 'blocks' as SurfaceGroup },
];

const HERO_COLOR_FAMILY_PRIORITY = ['playful-coral', 'clinical-teal', 'fintech-indigo', 'cool-blue'];
const HERO_THEME_PRIORITY = ['playful', 'clinical', 'fintech', 'premium-dark', 'premium', 'cool'];
const PREMIUM_REQUIRED_TOKEN_KEYS = [
  '--vb-bg',
  '--vb-surface',
  '--vb-text',
  '--vb-text-muted',
  '--vb-accent',
  '--vb-border',
  '--vb-radius-md',
  '--vb-radius-lg',
  '--vb-shadow-sm',
  '--vb-duration-base',
];

const NEUTRAL_TOKENS: ColorFamilyTokenMap = {
  background: '0 0% 98%',
  foreground: '240 10% 12%',
  muted: '240 6% 91%',
  card: '0 0% 100%',
  primary: '240 5% 28%',
  secondary: '240 5% 88%',
  accent: '218 48% 48%',
  border: '240 6% 84%',
  success: '142 56% 40%',
  warning: '38 92% 50%',
  danger: '0 72% 50%',
  chartPalette: ['240 5% 28%', '218 48% 48%', '160 52% 42%', '36 84% 52%'],
};

export function VisualBankModule({ runtimeDiscoveryOverride }: VisualBankModuleProps = {}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedBank, setLoadedBank] = useState<NormalizedVisualBank | null>(null);
  const [designSources, setDesignSources] = useState<RuntimeDesignSource[]>([]);
  const [surfaceFiles, setSurfaceFiles] = useState<RuntimeSurfaceFile[]>([]);
  const [loadedAt, setLoadedAt] = useState<string>('');
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [selectedSkeleton, setSelectedSkeleton] = useState<SkeletonId>('saas-dashboard');
  const [selectedPack, setSelectedPack] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [selectedColorFamily, setSelectedColorFamily] = useState<string>('');
  const [premiumCategoryFilter, setPremiumCategoryFilter] = useState<string>('all');
  const [premiumLayerLoad, setPremiumLayerLoad] = useState<PremiumBankLoadState>(() => loadPremiumBankForVisualBank());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.resolve()
      .then(() => {
        const bank = FileVisualBankService.loadFileVisualBank();
        const runtime = {
          ...discoverRuntimeVisualBankFiles(),
          ...runtimeDiscoveryOverride,
        };
        if (cancelled) return;
        setLoadedBank(bank);
        setDesignSources(runtime.designSources ?? []);
        setSurfaceFiles(runtime.surfaceFiles ?? []);
        setLoadedAt(runtime.loadedAt ?? new Date().toISOString());
        setFallbackUsed(Boolean(runtime.fallbackUsed));
        setRuntimeErrors(runtime.errors ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadedBank(null);
        setError(err instanceof Error ? err.message : String(err));
        setFallbackUsed(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeDiscoveryOverride]);

  useEffect(() => {
    let cancelled = false;

    void PremiumComponentBankService.warmupPremiumPreviews()
      .then(() => {
        if (cancelled) return;
        PremiumComponentBankService.resetPremiumComponentBankCache();
        setPremiumLayerLoad(loadPremiumBankForVisualBank());
      })
      .catch(() => {
        if (cancelled) return;
        PremiumComponentBankService.resetPremiumComponentBankCache();
        setPremiumLayerLoad(loadPremiumBankForVisualBank());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const skeletons = useMemo(() => {
    if (!loadedBank) return SKELETON_ORDER;
    const ids = new Set<SkeletonId>();
    for (const pack of loadedBank.packs) {
      for (const id of pack.compatibleSkeletons) ids.add(id);
    }
    return SKELETON_ORDER.filter(id => ids.has(id));
  }, [loadedBank]);

  const packsForSkeleton = useMemo(() => {
    return loadedBank?.packs.filter(pack => pack.compatibleSkeletons.includes(selectedSkeleton)) ?? [];
  }, [loadedBank, selectedSkeleton]);

  const selectedSkeletonVariantItems = useMemo(
    () => collectSelectedSkeletonVariants(loadedBank, selectedSkeleton),
    [loadedBank, selectedSkeleton],
  );
  const selectedSkeletonVariants = useMemo(
    () => selectedSkeletonVariantItems.map(item => item.variant),
    [selectedSkeletonVariantItems],
  );
  const heroStripItems = useMemo(() => selectHeroStripVariants(selectedSkeletonVariantItems), [selectedSkeletonVariantItems]);
  const coldStateHeroItem = heroStripItems[0] ?? null;

  const selectedVariantItem =
    selectedSkeletonVariantItems.find(item => item.variant.variantId === selectedVariant) ??
    coldStateHeroItem ??
    null;
  const selectedVariantObj = selectedVariantItem?.variant ?? null;
  const selectedPackObj =
    packsForSkeleton.find(pack => pack.packId === selectedPack) ??
    packsForSkeleton.find(pack => pack.packId === selectedVariantItem?.packId) ??
    packsForSkeleton[0] ??
    null;
  const selectedColorFamilyObj =
    loadedBank?.colorFamilies.find(family => family.id === selectedColorFamily && selectedVariantObj?.colorFamilies.includes(family.id)) ??
    loadedBank?.colorFamilies.find(family => family.id === selectedVariantObj?.colorFamily) ??
    loadedBank?.colorFamilies.find(family => family.id === selectedColorFamily) ??
    loadedBank?.colorFamilies[0] ??
    null;

  useEffect(() => {
    if (skeletons.length > 0 && !skeletons.includes(selectedSkeleton)) {
      setSelectedSkeleton(skeletons[0]);
    }
  }, [selectedSkeleton, skeletons]);

  useEffect(() => {
    if (!selectedPackObj && packsForSkeleton[0]) {
      setSelectedPack(packsForSkeleton[0].packId);
      return;
    }
    if (selectedPackObj && selectedPackObj.packId !== selectedPack) {
      setSelectedPack(selectedPackObj.packId);
    }
  }, [packsForSkeleton, selectedPack, selectedPackObj]);

  useEffect(() => {
    if (selectedVariantObj && selectedVariantObj.variantId !== selectedVariant) {
      setSelectedVariant(selectedVariantObj.variantId);
    }
  }, [selectedVariant, selectedVariantObj]);

  useEffect(() => {
    if (selectedColorFamilyObj && selectedColorFamilyObj.id !== selectedColorFamily) {
      setSelectedColorFamily(selectedColorFamilyObj.id);
    }
  }, [selectedColorFamily, selectedColorFamilyObj]);

  const totals = useMemo(() => {
    const variantsLoaded = loadedBank?.packs.reduce((sum, pack) => sum + pack.variants.length, 0) ?? 0;
    return {
      packsLoaded: loadedBank?.packs.length ?? 0,
      variantsLoaded,
      sourcesLoaded: designSources.length,
      colorRampsLoaded: loadedBank?.colorFamilies.length ?? 0,
      sourceFilesLoaded: loadedBank?.sourceFiles.length ?? 0,
      surfaceFilesDiscovered: surfaceFiles.length,
      skeletonCoverage: skeletons.length,
    };
  }, [designSources.length, loadedBank, skeletons.length, surfaceFiles.length]);

  const renderMetrics = useMemo(() => {
    const renderedVariantsCount = selectedSkeletonVariants.length;
    const renderSafePaths = new Set(RENDER_SAFE_COMPONENTS.map(component => component.path));
    const discoveredSurfacePaths = surfaceFiles.filter(file => file.kind === 'surface').map(file => file.path);
    const nonRenderableFilesCount = discoveredSurfacePaths.filter(path => !renderSafePaths.has(path)).length;
    const appliedTokenKeys = selectedColorFamilyObj ? Object.keys(selectedColorFamilyObj.tokens) : [];
    const fallbackRenderUsed = !selectedVariantObj || !selectedColorFamilyObj;
    const liveRenderEnabled = Boolean(loadedBank && renderedVariantsCount > 0 && selectedVariantObj && selectedColorFamilyObj);
    const nonNeutralVariantIds = selectedSkeletonVariants.filter(isNonNeutralVariant).map(variant => variant.variantId);
    const nonNeutralVariantsAvailable = nonNeutralVariantIds.length > 0;
    return {
      liveRenderEnabled,
      previewRenderer: 'VisualVariantPreview',
      renderSafeComponentsCount: RENDER_SAFE_COMPONENTS.length,
      renderedVariantsCount,
      renderedSkeletonPreview: selectedSkeleton,
      appliedColorRamp: selectedColorFamilyObj?.id ?? 'not defined',
      appliedTokenKeys,
      fallbackRenderUsed,
      nonRenderableFilesCount,
      showcaseVerdict: liveRenderEnabled && renderedVariantsCount > 0 && !fallbackRenderUsed ? 'PASS' : 'FAIL',
      previewRenderError: null,
      coldStateHeroVariantId: coldStateHeroItem?.variant.variantId ?? 'not defined',
      coldStateColorFamily: coldStateHeroItem?.variant.colorFamily ?? 'not defined',
      selectedSkeletonVariantsCount: selectedSkeletonVariants.length,
      nonNeutralVariantIds,
      nonNeutralVariantsAvailable,
      heroStripRendered: heroStripItems.length > 0,
      neutralDefaultAvoided: nonNeutralVariantsAvailable ? Boolean(coldStateHeroItem && isNonNeutralVariant(coldStateHeroItem.variant)) : false,
      heroStripFirstColorFamily: heroStripItems[0]?.variant.colorFamily ?? 'not defined',
    } satisfies RenderMetrics;
  }, [coldStateHeroItem, heroStripItems, loadedBank, selectedColorFamilyObj, selectedSkeleton, selectedSkeletonVariants, selectedVariantObj, surfaceFiles]);

  const muted = { color: 'var(--muted-foreground)', fontSize: 12 } as React.CSSProperties;
  const isPremiumComponentsTab = tab === 'premium-components';

  if (loading) {
    return (
      <Shell muted={muted}>
        <RuntimeProof
          loadedFromFileBank={false}
          loadedAt=""
          loader="FileVisualBankService.loadFileVisualBank"
          totals={totals}
          fallbackUsed={false}
          errors={[]}
          renderMetrics={emptyRenderMetrics()}
        />
        <div style={panelStyle}>Loading runtime visual bank...</div>
      </Shell>
    );
  }

  if (error || !loadedBank) {
    return (
      <Shell muted={muted}>
        <RuntimeProof
          loadedFromFileBank={false}
          loadedAt={loadedAt}
          loader="FileVisualBankService.loadFileVisualBank"
          totals={totals}
          fallbackUsed
          errors={[error ?? 'Visual bank did not return data', ...runtimeErrors]}
          renderMetrics={{ ...emptyRenderMetrics(), fallbackRenderUsed: true, showcaseVerdict: 'FAIL', previewRenderError: error ?? 'Visual bank did not return data' }}
        />
        <div style={{ ...panelStyle, borderColor: 'hsl(var(--destructive))' }}>
          <strong>Runtime load failed</strong>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '10px 0 0', fontSize: 12 }}>
            {error ?? 'Visual bank did not return data'}
          </pre>
        </div>
      </Shell>
    );
  }

  return (
    <Shell muted={muted}>
      <div style={{ padding: '24px 28px 0', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Visual Bank</h2>
        <p style={{ ...muted, marginTop: 4, marginBottom: 16 }}>
          Runtime file-backed showcase. Packs, variants, colors, sources, and surfaces are discovered from the prototype bank.
        </p>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button
              key={t}
              data-testid={`visual-bank-tab-${t}`}
              aria-selected={tab === t}
              data-active={tab === t ? 'true' : 'false'}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
                color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
                textTransform: 'capitalize',
                marginBottom: -1,
              }}
            >
              {t === 'premium-components' ? 'Premium Components' : t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {!isPremiumComponentsTab && heroStripItems.length > 0 && (
          <HeroVisualStrip
            bank={loadedBank}
            items={heroStripItems}
            skeletonId={selectedSkeleton}
            selectedVariantId={selectedVariantObj?.variantId ?? ''}
            onSelect={(item) => {
              setSelectedPack(item.packId);
              setSelectedVariant(item.variant.variantId);
              setSelectedColorFamily(item.variant.colorFamily);
            }}
          />
        )}

        {!isPremiumComponentsTab && (
          <RuntimeProof
            loadedFromFileBank
            loadedAt={loadedAt}
            loader="FileVisualBankService.loadFileVisualBank"
            totals={totals}
            fallbackUsed={fallbackUsed}
            errors={runtimeErrors}
            renderMetrics={renderMetrics}
          />
        )}

        {!isPremiumComponentsTab && selectedVariantObj && selectedColorFamilyObj && (
          <LiveVisualPreview
            skeletonId={selectedSkeleton}
            variant={selectedVariantObj}
            colorFamily={selectedColorFamilyObj}
            baseColorFamily={loadedBank.colorFamilies.find(family => family.id === 'neutral') ?? null}
          />
        )}

        {tab === 'overview' && (
          <OverviewTab
            bank={loadedBank}
            totals={totals}
            muted={muted}
            selectedSkeleton={selectedSkeleton}
            setSelectedSkeleton={setSelectedSkeleton}
            skeletons={skeletons}
            variants={selectedSkeletonVariants}
          />
        )}

        {tab === 'sources' && (
          <SourcesTab sources={designSources} muted={muted} />
        )}

        {tab === 'themes' && (
          <ThemesTab
            colorFamilies={loadedBank.colorFamilies}
            selectedColorFamily={selectedColorFamilyObj}
            onSelect={setSelectedColorFamily}
            muted={muted}
          />
        )}

        {tab === 'components' && (
          <ComponentsTab
            surfaceFiles={surfaceFiles}
            selectedVariant={selectedVariantObj}
            selectedColorFamily={selectedColorFamilyObj}
            muted={muted}
          />
        )}

        {tab === 'variants' && (
          <VariantsTab
            bank={loadedBank}
            skeletons={skeletons}
            selectedSkeleton={selectedSkeleton}
            setSelectedSkeleton={setSelectedSkeleton}
            packsForSkeleton={packsForSkeleton}
            selectedSkeletonVariants={selectedSkeletonVariants}
            selectedPack={selectedPackObj}
            setSelectedPack={setSelectedPack}
            selectedVariant={selectedVariantObj}
            setSelectedVariant={setSelectedVariant}
            setSelectedColorFamily={setSelectedColorFamily}
            muted={muted}
          />
        )}

        {tab === 'premium-components' && (
          <PremiumTab
            categoryFilter={premiumCategoryFilter}
            setCategoryFilter={setPremiumCategoryFilter}
            muted={muted}
            bank={premiumLayerLoad.bank}
            skeletons={skeletons}
            selectedSkeleton={selectedSkeleton}
            setSelectedSkeleton={setSelectedSkeleton}
            selectedVariant={selectedVariantObj}
            selectedColorFamily={selectedColorFamilyObj}
            fallbackUsed={premiumLayerLoad.fallbackUsed}
            loadError={premiumLayerLoad.loadError}
          />
        )}
      </div>
    </Shell>
  );
}

// ── Premium Components tab ─────────────────────────────────────────────────────

function PremiumTab({
  bank,
  categoryFilter,
  setCategoryFilter,
  muted,
  selectedSkeleton,
  setSelectedSkeleton,
  skeletons,
  selectedVariant,
  selectedColorFamily,
  fallbackUsed,
  loadError,
}: {
  bank: PremiumComponentBank;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  muted: React.CSSProperties;
  selectedSkeleton: SkeletonId;
  setSelectedSkeleton: (id: SkeletonId) => void;
  skeletons: SkeletonId[];
  selectedVariant: NormalizedVisualVariant | null;
  selectedColorFamily: NormalizedColorFamily | null;
  fallbackUsed: boolean;
  loadError: string | null;
}) {
  const theme = makePreviewTheme(selectedVariant, selectedColorFamily);
  const premiumSelection = resolvePremiumLayerSelection(bank, selectedSkeleton, selectedVariant);
  const selectedComponents = premiumSelection.selectedComponents;
  const selectedRecipeId = premiumSelection.selectedRecipe?.id ?? 'not defined';
  const categoryOptions = Array.from(new Set(['all', ...selectedComponents.map(component => component.category)]));
  const effectiveCategoryFilter = categoryOptions.includes(categoryFilter) ? categoryFilter : 'all';
  const filteredComponents = selectedComponents.filter(
    component => effectiveCategoryFilter === 'all' || component.category === effectiveCategoryFilter,
  );
  const renderedComponents = selectedComponents.filter(component => component.Preview);
  const metadataOnlyComponents = selectedComponents.filter(component => !component.Preview);
  const componentWarnings = selectedComponents.flatMap(component => premiumComponentWarnings(component));
  const proofErrors = [
    ...(loadError ? [loadError] : []),
    ...bank.errors,
    ...premiumSelection.warnings,
    ...componentWarnings,
  ];

  useEffect(() => {
    if (categoryFilter !== effectiveCategoryFilter) {
      setCategoryFilter(effectiveCategoryFilter);
    }
  }, [categoryFilter, effectiveCategoryFilter, selectedRecipeId, setCategoryFilter]);

  return (
    <div data-testid="premium-components-panel" style={{ display: 'grid', gap: 24 }}>
      <section style={{ ...panelStyle, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ ...sectionTitle, margin: 0 }}>Premium Components</h3>
            <div style={{ ...muted, marginTop: 4 }}>
              Additional layer loaded from PremiumComponentBankService for the selected Visual Bank skeleton.
            </div>
          </div>
          <Badge>sourceOfTruth: PremiumComponentBankService</Badge>
        </div>
        <FieldGrid
          fields={[
            ['premiumBankLoaded', String(bank.components.length > 0 && bank.recipes.length > 0 && !loadError)],
            ['selectedSkeleton', selectedSkeleton],
            ['selectedRecipe', selectedRecipeId],
            ['selectedRecipePath', premiumSelection.selectedRecipePath],
            ['exactRecipeFound', String(premiumSelection.exactRecipeFound)],
            ['closestCompatibleRecipe', premiumSelection.closestCompatibleRecipe?.id ?? 'none'],
            ['fallbackUsed', String(fallbackUsed)],
            ['selectedCompatibleComponents', selectedComponents.map(component => component.id)],
          ]}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge>selectedSkeletonId: {selectedSkeleton}</Badge>
          <span data-testid="premium-selected-recipe-id" style={{ fontSize: 12, fontWeight: 700 }}>
            selectedRecipeId: {selectedRecipeId}
          </span>
        </div>
        {!premiumSelection.exactRecipeFound && (
          <div data-testid="premium-no-exact-recipe" style={{ ...muted, color: 'hsl(var(--destructive))' }}>
            No exact recipe. Closest compatible recipe: {premiumSelection.closestCompatibleRecipe?.id ?? 'none'}.
          </div>
        )}
      </section>

      <section style={{ ...panelStyle, display: 'grid', gap: 12 }}>
        <div>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Premium Skeleton Selector</h3>
          <div style={{ ...muted, marginTop: 4 }}>
            Changes here update only the premium recipe layer and the selected Visual Bank context.
          </div>
        </div>
        <SkeletonSwitch
          skeletons={skeletons}
          selectedSkeleton={selectedSkeleton}
          setSelectedSkeleton={setSelectedSkeleton}
        />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { n: bank.sources.filter(source => source.allowedForLocalImport).length, l: 'Verified Sources' },
          { n: bank.components.length, l: 'Total Components' },
          { n: bank.recipes.length, l: 'Recipes' },
          { n: bank.renderSafeComponents.length, l: 'Render-safe' },
          { n: bank.metadataOnlyComponents.length, l: 'Metadata only' },
          { n: proofErrors.length, l: 'Errors / warnings' },
        ].map(({ n, l }) => (
          <div key={l} style={panelStyle}>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{n}</div>
            <div style={{ ...muted, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      <PremiumLayerProof
        premiumBankLoaded={bank.components.length > 0 && bank.recipes.length > 0 && !loadError}
        selectedSkeletonId={selectedSkeleton}
        selectedRecipeId={premiumSelection.selectedRecipe?.id ?? null}
        selectedRecipePath={premiumSelection.selectedRecipePath}
        compatibleComponentsCount={selectedComponents.length}
        renderedPremiumComponentsCount={filteredComponents.length}
        previewAdaptersRenderedCount={renderedComponents.length}
        metadataOnlyCount={metadataOnlyComponents.length}
        fallbackUsed={fallbackUsed}
        errors={proofErrors}
      />

      <section style={{ display: 'grid', gap: 12 }}>
        <div>
          <h3 style={sectionTitle}>Coverage by category</h3>
          <div style={muted}>Registry coverage and selected recipe categories stay separate from the old Visual Variant Preview.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {Object.entries(bank.coverage).map(([category, count]) => (
            <div key={category} style={panelStyle}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{count}</div>
              <div style={{ ...muted, textTransform: 'capitalize' }}>{category.replace(/-/g, ' ')}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={sectionTitle}>Source audit</h3>
            <div style={muted}>License metadata loaded from source-manifest.json files.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categoryOptions.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '5px 12px', borderRadius: 999, border: '1px solid var(--border)', cursor: 'pointer',
                  background: effectiveCategoryFilter === cat ? 'var(--primary)' : 'var(--card)',
                  color: effectiveCategoryFilter === cat ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  fontSize: 12,
                }}
              >
                {cat === 'all' ? 'All' : cat.replace(/-/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {bank.sources.map(src => (
            <article key={src.id} style={{ ...panelStyle, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{src.name}</div>
                  <div style={muted}>{src.license}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: src.allowedForLocalImport ? '#4ade80' : '#f97316' }}>
                  {src.allowedForLocalImport ? 'verified' : 'rejected'}
                </span>
              </div>
              <div style={{ ...muted, fontSize: 11 }}>risk: {src.dependencyRisk}</div>
              <div style={{ ...muted, fontSize: 11 }}>snapshot: {src.sourceCommitOrVersion}</div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div>
          <h3 style={sectionTitle}>Existing Visual Variant Preview</h3>
          <div style={muted}>Current context only. The old overview hero and visual variant preview are not rendered as this premium panel.</div>
        </div>
        <div style={panelStyle}>
          Current old preview selection: {selectedSkeleton} · {selectedVariant?.variantId ?? 'not defined'} · {selectedColorFamily?.id ?? 'not defined'}.
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div>
          <h3 style={sectionTitle}>Premium Recipe Preview</h3>
          <div style={muted}>Real preview adapters rendered for the selected recipe. Missing adapters stay metadata-only.</div>
        </div>
        {premiumSelection.selectedRecipe ? (
          <div
            data-testid="premium-recipe-preview"
            data-premium-recipe-id={selectedRecipeId}
            data-selected-recipe-id={selectedRecipeId}
            data-premium-rendered-component-ids={renderedComponents.map(component => component.id).join(',')}
            style={{
              ...premiumTokenWrapperStyle(theme),
              ...premiumRecipeGridStyle(selectedSkeleton, selectedRecipeId),
            }}
          >
            {filteredComponents.map(component => (
              <PremiumComponentCard
                key={component.id}
                component={component}
                muted={muted}
                theme={theme}
                style={premiumRecipeItemStyle(selectedRecipeId, component)}
              />
            ))}
            {filteredComponents.length === 0 && (
              <div style={{ ...panelStyle, background: 'var(--vb-surface)', borderColor: 'var(--vb-border)' }}>
                No compatible premium components for this filter. Switch to All or choose another skeleton.
              </div>
            )}
          </div>
        ) : (
          <EmptyPanel>No premium recipe selected for this skeleton.</EmptyPanel>
        )}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={sectionTitle}>Errors</h3>
        <div style={{ ...panelStyle, display: 'grid', gap: 6 }}>
          {proofErrors.length === 0 ? (
            <div style={{ ...muted, fontSize: 11 }}>none</div>
          ) : proofErrors.map((err, i) => (
            <div key={`${err}-${i}`} style={{ ...muted, fontSize: 11, color: 'hsl(var(--destructive))' }}>{err}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PremiumLayerProof({
  premiumBankLoaded,
  selectedSkeletonId,
  selectedRecipeId,
  selectedRecipePath,
  compatibleComponentsCount,
  renderedPremiumComponentsCount,
  previewAdaptersRenderedCount,
  metadataOnlyCount,
  fallbackUsed,
  errors,
}: {
  premiumBankLoaded: boolean;
  selectedSkeletonId: SkeletonId;
  selectedRecipeId: string | null;
  selectedRecipePath: string;
  compatibleComponentsCount: number;
  renderedPremiumComponentsCount: number;
  previewAdaptersRenderedCount: number;
  metadataOnlyCount: number;
  fallbackUsed: boolean;
  errors: string[];
}) {
  return (
    <section data-testid="premium-layer-proof" style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>Premium Layer Proof</h3>
        <Badge>sourceOfTruth: PremiumComponentBankService</Badge>
      </div>
      <FieldGrid
        fields={[
          ['premiumBankLoaded', String(premiumBankLoaded)],
          ['selectedSkeletonId', selectedSkeletonId],
          ['selectedRecipeId', selectedRecipeId ?? 'not defined'],
          ['selectedRecipePath', selectedRecipePath],
          ['compatibleComponentsCount', compatibleComponentsCount],
          ['renderedPremiumComponentsCount', renderedPremiumComponentsCount],
          ['previewAdaptersRenderedCount', previewAdaptersRenderedCount],
          ['metadataOnlyCount', metadataOnlyCount],
          ['fallbackUsed', String(fallbackUsed)],
          ['errors', errors.length > 0 ? errors : 'none'],
          ['sourceOfTruth', 'PremiumComponentBankService'],
        ]}
      />
    </section>
  );
}

function PremiumComponentCard({
  component,
  muted,
  theme,
  style,
}: {
  component: PremiumComponentRecord;
  muted: React.CSSProperties;
  theme: PreviewTheme;
  style?: React.CSSProperties;
}) {
  const Preview = component.Preview;
  const warnings = premiumComponentWarnings(component);
  return (
    <article
      data-testid="premium-component-preview-card"
      data-premium-card-testid={`premium-component-card-${testId(component.id)}`}
      data-premium-component-id={component.id}
      data-premium-component-kind={component.kind}
      style={{ ...panelStyle, padding: 0, overflow: 'hidden', display: 'grid', alignContent: 'start', ...style }}
    >
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--card) 90%, var(--primary) 10%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{component.name}</div>
            <div style={{ ...muted, fontSize: 11, marginTop: 2 }}>{component.id}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: Preview ? '#4ade80' : '#f97316', whiteSpace: 'nowrap' }}>
            {Preview ? 'adapter rendered' : 'metadataOnly'}
          </span>
        </div>
      </div>
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ minHeight: 200, display: 'grid' }}>
          {Preview ? (
            <div
              data-testid={`premium-token-wrapper-${testId(component.id)}`}
              data-vb-token-wrapper="true"
              style={premiumTokenWrapperStyle(theme)}
            >
              <Preview />
            </div>
          ) : (
            <MetadataOnlyPremiumCard component={component} muted={muted} />
          )}
        </div>
        <FieldGrid
          fields={[
            ['component id', component.id],
            ['category', component.category],
            ['kind', component.kind],
            ['source', component.source],
            ['license', component.sourceLicense],
            ['compatibleSkeletons', component.compatibleSkeletons],
            ['previewAdapter', Preview ? component.previewAdapter : 'missing adapter'],
            ['tokensUsed', component.tokensUsed],
          ]}
        />
        {warnings.length > 0 && (
          <div data-testid={`premium-component-warning-${testId(component.id)}`} style={{ ...muted, color: 'hsl(var(--destructive))' }}>
            {warnings.join(' · ')}
          </div>
        )}
      </div>
    </article>
  );
}

function MetadataOnlyPremiumCard({ component, muted }: { component: PremiumComponentRecord; muted: React.CSSProperties }) {
  return (
    <div
      data-testid={`premium-metadata-only-card-${testId(component.id)}`}
      style={{
        border: '1px dashed var(--border)',
        borderRadius: 8,
        padding: 14,
        background: 'var(--card)',
        display: 'grid',
        gap: 8,
        alignContent: 'center',
      }}
    >
      <strong>Metadata only</strong>
      <div style={muted}>No preview adapter loaded for {component.id}. No generic preview is rendered.</div>
    </div>
  );
}

function loadPremiumBankForVisualBank(): PremiumBankLoadState {
  try {
    return {
      bank: PremiumComponentBankService.loadPremiumComponentBank(),
      fallbackUsed: false,
      loadError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      bank: emptyPremiumComponentBank(message),
      fallbackUsed: true,
      loadError: message,
    };
  }
}

function emptyPremiumComponentBank(error: string): PremiumComponentBank {
  return {
    registry: null,
    sources: [],
    components: [],
    recipes: [],
    coverage: {},
    renderSafeComponents: [],
    metadataOnlyComponents: [],
    errors: [error],
  };
}

function resolvePremiumLayerSelection(
  bank: PremiumComponentBank,
  selectedSkeleton: SkeletonId,
  selectedVariant: NormalizedVisualVariant | null,
): PremiumLayerSelection {
  const intent = premiumSelectionIntent(selectedSkeleton, selectedVariant);
  const selectedRecipe = PremiumComponentBankService.selectPremiumRecipe(intent);
  const exactRecipeFound = Boolean(selectedRecipe);
  const closestCompatibleRecipe = exactRecipeFound ? null : findClosestCompatibleRecipe(bank, selectedSkeleton);
  const recipe = selectedRecipe ?? closestCompatibleRecipe;
  const selectedRecipePath = recipe ? premiumRecipePath(recipe.id) : 'not defined';

  if (!recipe) {
    return {
      selectedRecipe: null,
      selectedRecipePath,
      exactRecipeFound: false,
      closestCompatibleRecipe: null,
      selectedComponents: [],
      warnings: [`No exact recipe for ${selectedSkeleton}`],
    };
  }

  const serviceSelection = selectedRecipe
    ? PremiumComponentBankService.resolvePremiumComponentSelection(intent)
    : null;
  const serviceSelectedIds = serviceSelection?.selectedComponents.map(component => component.id) ?? [];
  const selectedComponents = serviceSelectedIds.length > 0
    ? serviceSelectedIds
        .map(id => bank.components.find(component => component.id === id))
        .filter((component): component is PremiumComponentRecord => Boolean(component))
    : selectComponentsForRecipe(bank, recipe, selectedSkeleton);
  const warnings = [
    ...(exactRecipeFound ? [] : [`No exact recipe for ${selectedSkeleton}`]),
    ...serviceSelectedIds
      .filter(id => !bank.components.some(component => component.id === id))
      .map(id => `Selected premium component missing from bank: ${id}`),
  ];

  return {
    selectedRecipe: recipe,
    selectedRecipePath,
    exactRecipeFound,
    closestCompatibleRecipe,
    selectedComponents,
    warnings,
  };
}

function premiumSelectionIntent(selectedSkeleton: SkeletonId, selectedVariant: NormalizedVisualVariant | null) {
  const mobileSoftHealthIntent = selectedSkeleton === 'mobile-app' && selectedVariant?.variantId === 'mobile-soft';
  const domainId = mobileSoftHealthIntent ? 'wellness' : premiumDomainForSkeleton(selectedSkeleton);
  const brief = mobileSoftHealthIntent
    ? 'health wellness mobile app with routine progress and status panels'
    : `${selectedSkeleton} visual bank premium composition`;
  return {
    brief,
    skeletonId: selectedSkeleton,
    domainId,
    surfaces: premiumSurfacesForSkeleton(selectedSkeleton),
  };
}

function premiumDomainForSkeleton(selectedSkeleton: SkeletonId): string {
  switch (selectedSkeleton) {
    case 'landing-page':
      return 'saas';
    case 'ecommerce':
      return 'ecommerce';
    case 'social-community':
      return 'social';
    case 'productivity-tool':
      return 'productivity';
    case 'mobile-app':
      return 'consumer';
    case 'saas-dashboard':
    default:
      return 'saas';
  }
}

function premiumSurfacesForSkeleton(selectedSkeleton: SkeletonId): string[] {
  switch (selectedSkeleton) {
    case 'landing-page':
      return ['landing', 'hero', 'feature-grid', 'pricing', 'testimonial', 'cta'];
    case 'mobile-app':
      return ['mobile', 'phone-shell', 'onboarding', 'bottom-nav', 'daily-progress', 'profile'];
    case 'ecommerce':
      return ['ecommerce', 'product-card', 'product-grid', 'checkout', 'review'];
    case 'social-community':
      return ['social', 'feed', 'profile', 'creator', 'reaction'];
    case 'productivity-tool':
      return ['dashboard', 'workspace', 'tasks', 'filter-search', 'activity-feed'];
    case 'saas-dashboard':
    default:
      return ['dashboard', 'kpi', 'chart', 'table-list', 'filter-search', 'activity-feed'];
  }
}

function findClosestCompatibleRecipe(bank: PremiumComponentBank, selectedSkeleton: SkeletonId): PremiumRecipeSchema | null {
  return (
    bank.recipes.find(recipe => recipe.compatibleSkeletons.includes(selectedSkeleton)) ??
    bank.recipes.find(recipe => recipe.domains.includes(premiumDomainForSkeleton(selectedSkeleton))) ??
    null
  );
}

function selectComponentsForRecipe(
  bank: PremiumComponentBank,
  recipe: PremiumRecipeSchema,
  selectedSkeleton: SkeletonId,
): PremiumComponentRecord[] {
  const selected: PremiumComponentRecord[] = [];
  const used = new Set<string>();
  const skeletonCandidates = premiumComponentSkeletonCandidates(selectedSkeleton, recipe);
  for (const block of [...recipe.requiredBlocks, ...recipe.optionalBlocks]) {
    const component = bank.components
      .filter(candidate => !used.has(candidate.id))
      .filter(candidate => candidate.compatibleSkeletons.some(skeleton => skeletonCandidates.includes(skeleton)))
      .filter(candidate => candidate.kind === block)
      .sort((a, b) => Number(b.renderSafe) - Number(a.renderSafe) || a.name.localeCompare(b.name))[0];
    if (component) {
      selected.push(component);
      used.add(component.id);
    }
  }
  return selected;
}

function premiumComponentSkeletonCandidates(selectedSkeleton: SkeletonId, recipe: PremiumRecipeSchema): string[] {
  if (selectedSkeleton === 'productivity-tool' && recipe.id === 'dashboard-operator') {
    return ['productivity-tool', 'saas-dashboard'];
  }
  return [selectedSkeleton];
}

function premiumRecipePath(recipeId: string): string {
  return `prototype-bank/design-packs/premium-components/_registry/recipes/${recipeId}.json`;
}

function premiumComponentWarnings(component: PremiumComponentRecord): string[] {
  const missingTokens = PREMIUM_REQUIRED_TOKEN_KEYS.filter(token => !component.tokensUsed.includes(token));
  return [
    ...(component.Preview ? [] : [`Missing preview adapter for ${component.id}`]),
    ...(missingTokens.length > 0 ? [`Missing token support: ${missingTokens.join(', ')}`] : []),
  ];
}

function premiumTokenWrapperStyle(theme: PreviewTheme): React.CSSProperties & Record<string, string | number> {
  return {
    ...theme.vars,
    '--background': 'var(--vb-bg)',
    '--card': 'var(--vb-surface)',
    '--foreground': 'var(--vb-text)',
    '--muted-foreground': 'var(--vb-text-muted)',
    '--primary': 'var(--vb-accent)',
    '--border': 'var(--vb-border)',
    background: 'var(--vb-bg)',
    color: 'var(--vb-text)',
    borderRadius: 'var(--vb-radius-lg)',
  };
}

function premiumRecipeGridStyle(selectedSkeleton: SkeletonId, recipeId: string): React.CSSProperties {
  const base: React.CSSProperties = {
    border: '1px solid var(--vb-border)',
    borderRadius: 'var(--vb-radius-lg)',
    padding: 14,
    gap: 14,
    overflow: 'hidden',
  };
  if (recipeId === 'mobile-consumer-app' || recipeId === 'health-wellness-mobile') {
    return {
      ...base,
      display: 'grid',
      gridTemplateColumns: 'minmax(240px, 320px) repeat(2, minmax(220px, 1fr))',
      alignItems: 'stretch',
    };
  }
  if (recipeId === 'landing-premium-saas') {
    return {
      ...base,
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))',
    };
  }
  if (recipeId === 'ecommerce-storefront') {
    return {
      ...base,
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
    };
  }
  if (recipeId === 'social-community') {
    return {
      ...base,
      display: 'grid',
      gridTemplateColumns: '1.2fr 1fr',
    };
  }
  return {
    ...base,
    display: 'grid',
    gridTemplateColumns: selectedSkeleton === 'productivity-tool'
      ? 'repeat(3, minmax(220px, 1fr))'
      : 'repeat(6, minmax(130px, 1fr))',
  };
}

function premiumRecipeItemStyle(recipeId: string, component: PremiumComponentRecord): React.CSSProperties {
  if (recipeId === 'dashboard-operator') {
    if (component.kind === 'chart-shell' || component.kind === 'analytics-chart' || component.kind === 'table-list') {
      return { gridColumn: 'span 4' };
    }
    if (component.kind === 'kpi') return { gridColumn: 'span 2' };
    return { gridColumn: 'span 2' };
  }
  if (recipeId === 'landing-premium-saas') {
    if (component.kind === 'hero' || component.kind === 'feature-grid' || component.kind === 'cta') return { gridColumn: 'span 2' };
    return { gridColumn: 'span 1' };
  }
  if (recipeId === 'mobile-consumer-app' || recipeId === 'health-wellness-mobile') {
    if (component.kind === 'phone-shell') return { gridRow: 'span 2' };
    if (component.kind === 'status-panel') return { gridColumn: 'span 2' };
    return {};
  }
  if (recipeId === 'ecommerce-storefront') {
    if (component.kind === 'product-grid') return { gridColumn: 'span 2' };
    return { gridColumn: 'span 1' };
  }
  if (recipeId === 'social-community') {
    if (component.kind === 'feed-item' || component.kind === 'profile-header') return { gridColumn: 'span 1' };
    return {};
  }
  return {};
}

function OverviewTab({
  bank,
  totals,
  muted,
  selectedSkeleton,
  setSelectedSkeleton,
  skeletons,
  variants,
}: {
  bank: NormalizedVisualBank;
  totals: ReturnType<typeof emptyTotals>;
  muted: React.CSSProperties;
  selectedSkeleton: SkeletonId;
  setSelectedSkeleton: (id: SkeletonId) => void;
  skeletons: SkeletonId[];
  variants: NormalizedVisualVariant[];
}) {
  return (
    <div>
      <MetricGrid
        items={[
          ['packs', totals.packsLoaded],
          ['variants', totals.variantsLoaded],
          ['sources', totals.sourcesLoaded],
          ['color ramps', totals.colorRampsLoaded],
          ['source files', totals.sourceFilesLoaded],
          ['skeletons', totals.skeletonCoverage],
        ]}
      />

      <h3 style={sectionTitle}>Normalized Packs</h3>
      <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
        {bank.packs.map(pack => (
          <div key={pack.packId} style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{pack.packId}</div>
                <div style={{ ...muted, marginTop: 2 }}>{pack.variants.length} variants</div>
              </div>
              <Badge>{pack.antiRepeatGroup}</Badge>
            </div>
            <FieldGrid
              fields={[
                ['compatibleSkeletons', pack.compatibleSkeletons],
                ['domains', pack.domains],
                ['subdomains', pack.subdomains],
                ['surfaces', pack.surfaces],
                ['trustProfiles', pack.trustProfiles],
                ['toneProfiles', pack.toneProfiles],
                ['colorFamilies', pack.colorFamilies],
                ['antiRepeatGroup', pack.antiRepeatGroup],
              ]}
            />
          </div>
        ))}
      </div>

      <h3 style={sectionTitle}>Selected Skeleton Comparison</h3>
      <SkeletonSwitch
        skeletons={skeletons}
        selectedSkeleton={selectedSkeleton}
        setSelectedSkeleton={setSelectedSkeleton}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
        {variants.slice(0, 8).map(variant => (
          <VariantComparisonCard key={variant.variantId} variant={variant} muted={muted} />
        ))}
      </div>
    </div>
  );
}

function SourcesTab({ sources, muted }: { sources: RuntimeDesignSource[]; muted: React.CSSProperties }) {
  if (sources.length === 0) {
    return <EmptyPanel>No runtime design source manifests discovered.</EmptyPanel>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {sources.map(source => (
        <div key={source.id} style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{source.name}</span>
            <Badge>{source.license}</Badge>
          </div>
          <div style={{ ...muted, marginBottom: 10, fontSize: 11 }}>{source.url || 'not defined'}</div>
          <FieldGrid
            fields={[
              ['source id', source.id],
              ['manifest', source.manifestPath],
              ['license.md', source.licenseFilePresent ? 'present' : 'not found'],
              ['categories', source.categories],
              ['normalized files', source.normalizedInto],
              ['imported files', source.importedFiles],
            ]}
          />
          <SourceVisualSample source={source} />
        </div>
      ))}
    </div>
  );
}

function ThemesTab({
  colorFamilies,
  selectedColorFamily,
  onSelect,
  muted,
}: {
  colorFamilies: NormalizedColorFamily[];
  selectedColorFamily: NormalizedColorFamily | null;
  onSelect: (id: string) => void;
  muted: React.CSSProperties;
}) {
  if (colorFamilies.length === 0) {
    return <EmptyPanel>No runtime color ramps discovered.</EmptyPanel>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 340px) 1fr', gap: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        {colorFamilies.map(family => (
          <button
            key={family.id}
            onClick={() => onSelect(family.id)}
            style={{
              ...panelStyle,
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: selectedColorFamily?.id === family.id ? 'var(--primary)' : 'var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Swatch value={family.tokens.primary} />
              <div>
                <div style={{ fontWeight: 700 }}>{family.name}</div>
                <div style={{ ...muted }}>{family.id}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
      {selectedColorFamily && (
        <div style={panelStyle}>
          <h3 style={{ ...sectionTitle, marginTop: 0 }}>{selectedColorFamily.name}</h3>
          <FieldGrid
            fields={[
              ['ramp id', selectedColorFamily.id],
              ['sourcePath', selectedColorFamily.sourcePath],
              ['domains', selectedColorFamily.domains],
              ['subdomains', selectedColorFamily.subdomains],
              ['toneProfiles', selectedColorFamily.toneProfiles],
              ['trustProfiles', selectedColorFamily.trustProfiles],
            ]}
          />
          <h4 style={smallTitle}>Tokens</h4>
          <TokenGrid tokens={selectedColorFamily.tokens} />
        </div>
      )}
    </div>
  );
}

function ComponentsTab({
  surfaceFiles,
  selectedVariant,
  selectedColorFamily,
  muted,
}: {
  surfaceFiles: RuntimeSurfaceFile[];
  selectedVariant: NormalizedVisualVariant | null;
  selectedColorFamily: NormalizedColorFamily | null;
  muted: React.CSSProperties;
}) {
  const groups = groupSurfaceFiles(surfaceFiles);
  const theme = makePreviewTheme(selectedVariant ?? null, selectedColorFamily ?? null);
  const renderSafePaths = new Set(RENDER_SAFE_COMPONENTS.map(component => component.path));
  const nonRenderable = surfaceFiles.filter(file => file.kind === 'surface' && !renderSafePaths.has(file.path));
  return (
    <div>
      <h3 style={sectionTitle}>Render-safe Surface Components</h3>
      <div data-testid="render-safe-components" style={{ ...panelStyle, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {RENDER_SAFE_COMPONENTS.map(component => (
            <SurfaceComponentSample key={component.id} componentId={component.id} label={component.label} path={component.path} theme={theme} />
          ))}
        </div>
      </div>

      {Object.entries(groups).map(([group, files]) => (
        <div key={group} style={{ marginBottom: 24 }}>
          <h3 style={{ ...sectionTitle, textTransform: 'capitalize' }}>{group}</h3>
          {files.length === 0 ? (
            <EmptyPanel>No files discovered for this group.</EmptyPanel>
          ) : (
            <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
              {files.map(file => (
                <div key={file.path} style={rowStyle}>
                  <code style={{ fontSize: 12, color: 'var(--primary)' }}>{file.path}</code>
                  <span style={{ ...muted, marginLeft: 'auto' }}>
                    {renderSafePaths.has(file.path) ? 'render-safe preview available' : 'discovered but not render-safe'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={panelStyle}>
        {nonRenderable.length} discovered surface file(s) are metadata-only here because the showcase does not dynamically execute arbitrary TSX from glob results.
      </div>
    </div>
  );
}

function VariantsTab({
  bank,
  skeletons,
  selectedSkeleton,
  setSelectedSkeleton,
  packsForSkeleton,
  selectedSkeletonVariants,
  selectedPack,
  setSelectedPack,
  selectedVariant,
  setSelectedVariant,
  setSelectedColorFamily,
  muted,
}: {
  bank: NormalizedVisualBank;
  skeletons: SkeletonId[];
  selectedSkeleton: SkeletonId;
  setSelectedSkeleton: (id: SkeletonId) => void;
  packsForSkeleton: NormalizedVisualPack[];
  selectedSkeletonVariants: NormalizedVisualVariant[];
  selectedPack: NormalizedVisualPack | null;
  setSelectedPack: (id: string) => void;
  selectedVariant: NormalizedVisualVariant | null;
  setSelectedVariant: (id: string) => void;
  setSelectedColorFamily: (id: string) => void;
  muted: React.CSSProperties;
}) {
  const orderedVariants = orderVariantsForShowcase(selectedSkeletonVariants);
  const chooseVariant = (variant: NormalizedVisualVariant) => {
    setSelectedPack(variant.packId);
    setSelectedVariant(variant.variantId);
    setSelectedColorFamily(variant.colorFamily);
  };

  return (
    <div>
      <SkeletonSwitch
        skeletons={skeletons}
        selectedSkeleton={selectedSkeleton}
        setSelectedSkeleton={setSelectedSkeleton}
      />

      <div style={{ display: 'flex', gap: 8, margin: '14px 0 20px', flexWrap: 'wrap' }}>
        {packsForSkeleton.map(pack => (
          <button key={pack.packId} onClick={() => setSelectedPack(pack.packId)} style={switchButton(pack.packId === selectedPack?.packId)}>
            {pack.packId}
          </button>
        ))}
      </div>

      {selectedSkeletonVariants.length === 0 ? (
        <EmptyPanel>No normalized pack for selected skeleton.</EmptyPanel>
      ) : (
        <div>
          <h3 style={sectionTitle}>Visual Variant Cards</h3>
          <div data-testid="variant-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }}>
            {orderedVariants.slice(0, 8).map(variant => (
              <VisualVariantPreview
                key={variant.variantId}
                skeletonId={selectedSkeleton}
                variant={variant}
                colorFamily={findColorFamilyForVariant(bank, variant)}
                compact
                onClick={() => chooseVariant(variant)}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 18 }}>
          <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
            {selectedSkeletonVariants.map(variant => (
              <button
                key={variant.variantId}
                onClick={() => chooseVariant(variant)}
                style={{
                  ...panelStyle,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: variant.variantId === selectedVariant?.variantId ? 'var(--primary)' : 'var(--border)',
                }}
              >
                <div style={{ fontWeight: 700 }}>{variant.name}</div>
                <div style={{ ...muted }}>{variant.variantPath}</div>
                <MiniVariantLine variant={variant} />
              </button>
            ))}
          </div>
          {selectedVariant && (
            <VariantDetails bank={bank} variant={selectedVariant} muted={muted} />
          )}
          </div>
        </div>
      )}
    </div>
  );
}

function VariantDetails({
  bank,
  variant,
  muted,
}: {
  bank: NormalizedVisualBank;
  variant: NormalizedVisualVariant;
  muted: React.CSSProperties;
}) {
  const raw = variant.raw as Record<string, unknown>;
  const matchingFamily = bank.colorFamilies.find(family => family.id === variant.colorFamily);
  return (
    <div style={panelStyle}>
      <h3 style={{ ...sectionTitle, marginTop: 0 }}>{variant.name}</h3>
      <FieldGrid
        fields={[
          ['id', variant.variantId],
          ['packId', variant.packId],
          ['sourcePath', variant.sourcePath ?? variant.variantPath],
          ['theme', raw.theme],
          ['spacing', raw.spacing],
          ['typography', raw.typography],
          ['radius', raw.radius],
          ['motionPreset', raw.motionPreset],
          ['densityProfile', raw.densityProfile],
          ['trustProfile', raw.trustProfile],
          ['toneProfile', raw.toneProfile],
          ['colorFamily', raw.colorFamily ?? variant.colorFamily],
          ['targetUsers', raw.targetUsers],
          ['tokenHints', raw.tokenHints],
          ['componentHints', raw.componentHints ?? variant.componentHints],
          ['layoutHints', raw.layoutHints ?? variant.layoutHints],
          ['forbiddenPatterns', raw.forbiddenPatterns],
        ]}
      />
      <h4 style={smallTitle}>Normalized Runtime Values</h4>
      <FieldGrid
        fields={[
          ['densityProfile', variant.densityProfile],
          ['trustProfile', variant.trustProfile],
          ['toneProfile', variant.toneProfile],
          ['colorFamilies', variant.colorFamilies],
          ['antiRepeatGroup', variant.antiRepeatGroup],
        ]}
      />
      {matchingFamily && (
        <>
          <h4 style={smallTitle}>Selected Color Tokens</h4>
          <TokenGrid tokens={matchingFamily.tokens} compact />
        </>
      )}
      <div style={{ ...muted, marginTop: 14 }}>
        Values marked "not defined" are absent from the variant JSON rather than replaced with showcase copy.
      </div>
    </div>
  );
}

function HeroVisualStrip({
  bank,
  items,
  skeletonId,
  selectedVariantId,
  onSelect,
}: {
  bank: NormalizedVisualBank;
  items: HeroVariantItem[];
  skeletonId: SkeletonId;
  selectedVariantId: string;
  onSelect: (item: HeroVariantItem) => void;
}) {
  return (
    <div data-testid="hero-visual-strip" style={{ ...panelStyle, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Hero Visual Strip</h3>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 3 }}>
            Expressive cold-state variants for {skeletonId}
          </div>
        </div>
        <Badge>{items.filter(item => !isNeutralVariant(item.variant)).length} non-neutral</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {items.map(item => (
          <div
            key={`${item.packId}:${item.variant.variantId}`}
            style={{
              border: `2px solid ${item.variant.variantId === selectedVariantId ? 'var(--primary)' : 'transparent'}`,
              borderRadius: 18,
              padding: 2,
            }}
          >
            <VisualVariantPreview
              skeletonId={skeletonId}
              variant={item.variant}
              colorFamily={findColorFamilyForVariant(bank, item.variant)}
              compact
              testId="hero-variant-card"
              onClick={() => onSelect(item)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveVisualPreview({
  skeletonId,
  variant,
  colorFamily,
  baseColorFamily,
}: {
  skeletonId: SkeletonId;
  variant: NormalizedVisualVariant;
  colorFamily: NormalizedColorFamily;
  baseColorFamily: NormalizedColorFamily | null;
}) {
  const baseVariant = { ...variant, variantId: 'base-neutral', name: 'Base Skeleton', theme: 'neutral', spacing: 'comfortable', colorFamily: 'neutral' };
  return (
    <div data-testid="live-visual-preview" style={{ ...panelStyle, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Live Visual Preview</h3>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 3 }}>
            {skeletonId} · {variant.variantId} · {colorFamily.id}
          </div>
        </div>
        <Badge>real React render</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div>
          <div style={previewCaptionStyle}>Base skeleton preview</div>
          <VisualVariantPreview
            skeletonId={skeletonId}
            variant={baseVariant as NormalizedVisualVariant}
            colorFamily={baseColorFamily}
            base
          />
        </div>
        <div>
          <div style={previewCaptionStyle}>Applied visual variant preview</div>
          <VisualVariantPreview
            skeletonId={skeletonId}
            variant={variant}
            colorFamily={colorFamily}
            testId="applied-variant-preview"
          />
        </div>
      </div>
    </div>
  );
}

function VisualVariantPreview({
  skeletonId,
  variant,
  colorFamily,
  compact = false,
  base = false,
  onClick,
  testId = 'visual-variant-preview',
}: {
  skeletonId: SkeletonId;
  variant: NormalizedVisualVariant;
  colorFamily: NormalizedColorFamily | null;
  compact?: boolean;
  base?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const theme = makePreviewTheme(base ? null : variant, colorFamily);
  const frameStyle: React.CSSProperties = {
    ...theme.vars,
    background: 'var(--vb-bg)',
    color: 'var(--vb-fg)',
    border: '1px solid var(--vb-border)',
    borderRadius: theme.radiusCard,
    padding: compact ? Math.max(10, theme.spacingPx - 2) : theme.spacingPx,
    boxShadow: base ? 'none' : theme.elevation,
    fontFamily: theme.fontFamily,
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    minHeight: compact ? 300 : 360,
  };
  return (
    <div
      data-testid={testId}
      data-preview-theme={variant.theme}
      data-preview-color-family={colorFamily?.id ?? 'neutral'}
      data-preview-radius={theme.radiusCard}
      data-preview-spacing={variant.spacing}
      data-preview-typography={variant.typography}
      data-preview-font-weight={theme.fontWeight}
      data-preview-motion={variant.motionPreset}
      data-preview-skeleton={skeletonId}
      onClick={onClick}
      style={frameStyle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: theme.spacingPx }}>
        <div>
          <div style={{ fontWeight: theme.fontWeight, fontSize: compact ? 13 : 15 }}>{base ? 'Neutral base' : variant.name}</div>
          <div style={{ color: 'var(--vb-muted-fg)', fontSize: 11 }}>{variant.theme} · {variant.motionPreset}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isNeutralVariant(variant) && <SafeBadge theme={theme}>neutral base</SafeBadge>}
          <SafeBadge theme={theme}>{variant.toneProfile || 'tone'}</SafeBadge>
        </div>
      </div>
      <SkeletonMiniComposition skeletonId={skeletonId} theme={theme} compact={compact} />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: theme.spacingPx }}>
        {[variant.colorFamily, variant.spacing, variant.motionPreset, ...variant.componentHints.slice(0, 2)].filter(Boolean).slice(0, 5).map(item => (
          <span key={String(item)} style={{ fontSize: 10, color: 'var(--vb-muted-fg)' }}>{String(item)}</span>
        ))}
      </div>
    </div>
  );
}

function SkeletonMiniComposition({
  skeletonId,
  theme,
  compact,
}: {
  skeletonId: SkeletonId;
  theme: PreviewTheme;
  compact: boolean;
}) {
  switch (skeletonId) {
    case 'saas-dashboard':
      return <SaasDashboardPreview theme={theme} compact={compact} />;
    case 'landing-page':
      return <LandingPagePreview theme={theme} compact={compact} />;
    case 'ecommerce':
      return <EcommercePreview theme={theme} compact={compact} />;
    case 'social-community':
      return <SocialCommunityPreview theme={theme} compact={compact} />;
    case 'productivity-tool':
      return <ProductivityPreview theme={theme} compact={compact} />;
    case 'mobile-app':
    default:
      return <MobileAppPreview theme={theme} compact={compact} />;
  }
}

function SaasDashboardPreview({ theme, compact }: { theme: PreviewTheme; compact: boolean }) {
  return (
    <div data-testid="saas-dashboard-preview" style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: theme.spacingPx }}>
      <div style={miniSidebarStyle(theme)}>
        <div style={dotStyle('var(--vb-primary)')} />
        {['KPI', 'Chart', 'Table'].map(item => <div key={item} style={sidebarItemStyle(theme)}>{item}</div>)}
      </div>
      <div style={{ display: 'grid', gap: theme.spacingPx }}>
        <SafeCard theme={theme}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>KPI overview</strong>
            <SafeBadge theme={theme}>+12%</SafeBadge>
          </div>
        </SafeCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SafeStat theme={theme} label="KPI" value="84%" />
          <SafeStat theme={theme} label="Pipeline" value="$42k" />
        </div>
        <SafeCard theme={theme}>
          <div style={{ fontSize: 11, color: 'var(--vb-muted-fg)', marginBottom: 8 }}>Chart area</div>
          <MiniChart theme={theme} />
        </SafeCard>
        {!compact && <ListRows theme={theme} labels={['Table row', 'Clinical queue', 'Follow-up']} />}
      </div>
    </div>
  );
}

function LandingPagePreview({ theme, compact }: { theme: PreviewTheme; compact: boolean }) {
  return (
    <div data-testid="landing-page-preview" style={{ display: 'grid', gap: theme.spacingPx }}>
      <SafeCard theme={theme} emphasis>
        <div style={{ fontSize: compact ? 18 : 24, fontWeight: 900, maxWidth: 260 }}>Hero section with visual bank styling</div>
        <div style={{ color: 'var(--vb-muted-fg)', fontSize: 12, marginTop: 6 }}>Trust strip · feature cards · CTA buttons</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <SafeButton theme={theme}>Primary CTA</SafeButton>
          <SafeButton theme={theme} variant="secondary">Secondary</SafeButton>
        </div>
      </SafeCard>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {['Feature', 'Proof', 'CTA'].map(item => <SafeCard key={item} theme={theme}>{item}</SafeCard>)}
      </div>
      {!compact && <div style={{ display: 'flex', gap: 8 }}>{['SOC2', 'HIPAA', 'MIT'].map(item => <SafeBadge key={item} theme={theme}>{item}</SafeBadge>)}</div>}
    </div>
  );
}

function EcommercePreview({ theme, compact }: { theme: PreviewTheme; compact: boolean }) {
  return (
    <div data-testid="ecommerce-preview" style={{ display: 'grid', gap: theme.spacingPx }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <SafeBadge theme={theme}>Filter pill</SafeBadge>
        <SafeButton theme={theme}>Cart CTA</SafeButton>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[1, 2].map(index => (
          <SafeCard key={index} theme={theme}>
            <div style={{ height: compact ? 54 : 78, borderRadius: theme.radiusButton, background: 'linear-gradient(135deg, var(--vb-secondary), var(--vb-accent))', marginBottom: 10 }} />
            <strong>Product Card</strong>
            <div style={{ color: 'var(--vb-primary)', fontWeight: 900 }}>$48</div>
          </SafeCard>
        ))}
      </div>
      {!compact && <SafeCard theme={theme}>Price block · variants · checkout progress</SafeCard>}
    </div>
  );
}

function MobileAppPreview({ theme, compact }: { theme: PreviewTheme; compact: boolean }) {
  return (
    <div data-testid="mobile-app-preview" style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ width: compact ? 210 : 250, border: '6px solid var(--vb-fg)', borderRadius: 28, padding: 12, background: 'var(--vb-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>Phone Frame</strong>
          <SafeBadge theme={theme}>Today</SafeBadge>
        </div>
        <SafeCard theme={theme} emphasis>
          <div style={{ color: 'var(--vb-muted-fg)', fontSize: 11 }}>Daily card</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>72%</div>
          <MiniProgress theme={theme} />
        </SafeCard>
        <SafeButton theme={theme} style={{ width: '100%', marginTop: 10 }}>Action Button</SafeButton>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12, color: 'var(--vb-muted-fg)', fontSize: 10 }}>
          {['Home', 'Log', 'Stats', 'Me'].map(item => <span key={item}>{item}</span>)}
        </div>
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 10, color: 'var(--vb-muted-fg)' }}>Bottom Nav</div>
      </div>
    </div>
  );
}

function SocialCommunityPreview({ theme, compact }: { theme: PreviewTheme; compact: boolean }) {
  return (
    <div data-testid="social-community-preview" style={{ display: 'grid', gap: theme.spacingPx }}>
      <SafeCard theme={theme}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--vb-primary)' }} />
          <div>
            <strong>Creator badge</strong>
            <div style={{ color: 'var(--vb-muted-fg)', fontSize: 11 }}>Profile / feed card</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>Post list item with reactions</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {['Like', 'Reply', 'Share'].map(item => <SafeBadge key={item} theme={theme}>{item}</SafeBadge>)}
        </div>
      </SafeCard>
      {!compact && <ListRows theme={theme} labels={['Post list', 'Creator update', 'Community thread']} />}
    </div>
  );
}

function ProductivityPreview({ theme, compact }: { theme: PreviewTheme; compact: boolean }) {
  return (
    <div data-testid="productivity-tool-preview" style={{ display: 'grid', gap: theme.spacingPx }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {['Backlog', 'Doing', 'Done'].map(item => <SafeBadge key={item} theme={theme}>{item}</SafeBadge>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SafeCard theme={theme} emphasis>Task board card</SafeCard>
        <SafeCard theme={theme}>Notes card</SafeCard>
      </div>
      <SafeCard theme={theme}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Progress widget</span>
          <strong>61%</strong>
        </div>
        <MiniProgress theme={theme} />
      </SafeCard>
      {!compact && <ListRows theme={theme} labels={['Task list', 'Calendar note', 'Review']} />}
    </div>
  );
}

function RuntimeProof({
  loadedFromFileBank,
  loadedAt,
  loader,
  totals,
  fallbackUsed,
  errors,
  renderMetrics,
}: {
  loadedFromFileBank: boolean;
  loadedAt: string;
  loader: string;
  totals: ReturnType<typeof emptyTotals>;
  fallbackUsed: boolean;
  errors: string[];
  renderMetrics: RenderMetrics;
}) {
  return (
    <div data-testid="runtime-proof" style={{ ...panelStyle, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>Runtime Proof</h3>
        <Badge>{loadedFromFileBank ? 'loadedFromFileBank: true' : 'loadedFromFileBank: false'}</Badge>
      </div>
      <FieldGrid
        fields={[
          ['loader', loader],
          ['loadedAt', loadedAt || 'not defined'],
          ['packsLoaded', totals.packsLoaded],
          ['variantsLoaded', totals.variantsLoaded],
          ['sourcesLoaded', totals.sourcesLoaded],
          ['colorRampsLoaded', totals.colorRampsLoaded],
          ['surfaceFilesDiscovered', totals.surfaceFilesDiscovered],
          ['fallbackUsed', String(fallbackUsed)],
          ['errors', errors.length > 0 ? errors : 'none'],
          ['liveRenderEnabled', String(renderMetrics.liveRenderEnabled)],
          ['previewRenderer', renderMetrics.previewRenderer],
          ['renderSafeComponentsCount', renderMetrics.renderSafeComponentsCount],
          ['renderedVariantsCount', renderMetrics.renderedVariantsCount],
          ['renderedSkeletonPreview', renderMetrics.renderedSkeletonPreview],
          ['appliedColorRamp', renderMetrics.appliedColorRamp],
          ['appliedTokenKeys', renderMetrics.appliedTokenKeys],
          ['fallbackRenderUsed', String(renderMetrics.fallbackRenderUsed)],
          ['nonRenderableFiles', renderMetrics.nonRenderableFilesCount],
          ['showcaseVerdict', renderMetrics.showcaseVerdict],
          ['previewRenderError', renderMetrics.previewRenderError ?? 'none'],
          ['selectedSkeletonVariantsCount', renderMetrics.selectedSkeletonVariantsCount],
          ['nonNeutralVariantIds', renderMetrics.nonNeutralVariantIds],
          ['coldStateHeroVariantId', renderMetrics.coldStateHeroVariantId],
          ['coldStateColorFamily', renderMetrics.coldStateColorFamily],
          ['nonNeutralVariantsAvailable', String(renderMetrics.nonNeutralVariantsAvailable)],
          ['heroStripRendered', String(renderMetrics.heroStripRendered)],
          ['neutralDefaultAvoided', String(renderMetrics.neutralDefaultAvoided)],
          ['heroStripFirstColorFamily', renderMetrics.heroStripFirstColorFamily],
        ]}
      />
    </div>
  );
}

function Shell({ children, muted }: { children: React.ReactNode; muted: React.CSSProperties }) {
  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {children}
      <div style={{ padding: '0 28px 24px', ...muted }}>
        Runtime showcase source: <code>frontend/src/modules/visual-bank/VisualBankModule.tsx</code>
      </div>
    </div>
  );
}

function MetricGrid({ items }: { items: Array<[string, number]> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
      {items.map(([label, value]) => (
        <div key={label} style={panelStyle}>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{value}</div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function SkeletonSwitch({
  skeletons,
  selectedSkeleton,
  setSelectedSkeleton,
}: {
  skeletons: SkeletonId[];
  selectedSkeleton: SkeletonId;
  setSelectedSkeleton: (id: SkeletonId) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {skeletons.map(skeleton => (
        <button key={skeleton} onClick={() => setSelectedSkeleton(skeleton)} style={switchButton(skeleton === selectedSkeleton)}>
          {skeleton}
        </button>
      ))}
    </div>
  );
}

function VariantComparisonCard({ variant, muted }: { variant: NormalizedVisualVariant; muted: React.CSSProperties }) {
  const hints = [
    ...variant.tokenHints.slice(0, 2),
    ...variant.componentHints.slice(0, 2),
    ...variant.layoutHints.slice(0, 1),
  ].slice(0, 5);
  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700 }}>{variant.name}</div>
      <MiniVariantLine variant={variant} />
      <FieldGrid
        fields={[
          ['theme', variant.theme],
          ['toneProfile', variant.toneProfile],
          ['colorFamily', variant.colorFamily],
          ['spacing', variant.spacing],
          ['radius', variant.radius],
          ['motionPreset', variant.motionPreset],
        ]}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {hints.length > 0 ? hints.map(hint => <Badge key={hint}>{hint}</Badge>) : <span style={muted}>not defined</span>}
      </div>
    </div>
  );
}

function MiniVariantLine({ variant }: { variant: NormalizedVisualVariant }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <Badge>{variant.theme}</Badge>
      <Badge>{variant.spacing}</Badge>
      <Badge>{variant.motionPreset}</Badge>
      {isNeutralVariant(variant) && <Badge>neutral base</Badge>}
    </div>
  );
}

function SourceVisualSample({ source }: { source: RuntimeDesignSource }) {
  const sampleTheme = makeSourceSampleTheme(source);
  return (
    <div data-testid="source-visual-sample" style={{ ...sampleTheme.vars, marginTop: 14 }}>
      {sourceSampleFor(source, sampleTheme)}
    </div>
  );
}

function sourceSampleFor(source: RuntimeDesignSource, theme: PreviewTheme): React.ReactNode {
  const id = source.id.toLowerCase();
  const categories = source.categories.join(' ').toLowerCase();
  if (id.includes('shadcn') || categories.includes('primitive')) {
    return (
      <SafeCard theme={theme}>
        <strong>shadcn-like card</strong>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <SafeButton theme={theme}>Button</SafeButton>
          <SafeButton theme={theme} variant="secondary">Outline</SafeButton>
        </div>
      </SafeCard>
    );
  }
  if (id.includes('hyperui') || categories.includes('marketing')) {
    return (
      <SafeCard theme={theme} emphasis>
        <div style={{ fontWeight: 900, fontSize: 18 }}>HyperUI-like marketing card</div>
        <SafeButton theme={theme} style={{ marginTop: 10 }}>Launch</SafeButton>
      </SafeCard>
    );
  }
  if (id.includes('daisy')) {
    return (
      <SafeCard theme={theme}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Badge', 'Button', 'Group'].map(item => <SafeBadge key={item} theme={theme}>{item}</SafeBadge>)}
        </div>
      </SafeCard>
    );
  }
  if (id.includes('arco') || id.includes('semi') || categories.includes('dashboard')) {
    return (
      <SafeCard theme={theme}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Dashboard control</strong>
          <SafeBadge theme={theme}>Arco/Semi</SafeBadge>
        </div>
        <MiniChart theme={theme} />
      </SafeCard>
    );
  }
  if (id.includes('weui') || categories.includes('mobile')) {
    return (
      <SafeCard theme={theme}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>WeUI-like mobile cell</span>
          <strong>›</strong>
        </div>
      </SafeCard>
    );
  }
  return <div style={{ color: 'var(--vb-muted-fg)', fontSize: 12 }}>metadata only / no renderable sample yet</div>;
}

function SurfaceComponentSample({
  componentId,
  label,
  path,
  theme,
}: {
  componentId: string;
  label: string;
  path: string;
  theme: PreviewTheme;
}) {
  return (
    <div data-testid="surface-component-sample" style={{ ...theme.vars, background: 'var(--vb-bg)', color: 'var(--vb-fg)', border: '1px solid var(--vb-border)', borderRadius: theme.radiusCard, padding: 12 }}>
      <div style={{ color: 'var(--vb-muted-fg)', fontSize: 10, marginBottom: 8 }}>{path}</div>
      {componentId === 'button' && <SafeButton theme={theme}>{label}</SafeButton>}
      {componentId === 'card' && <SafeCard theme={theme}>{label}</SafeCard>}
      {componentId === 'badge' && <SafeBadge theme={theme}>{label}</SafeBadge>}
      {componentId === 'input' && <SafeInput theme={theme} placeholder={label} />}
      {componentId === 'stat-card' && <SafeStat theme={theme} label="Preview Stat" value="84%" />}
      {componentId === 'list-item' && <ListRows theme={theme} labels={['Preview row']} />}
      {componentId === 'mobile-nav' && <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: 11 }}>{['Home', 'Feed', 'Me'].map(item => <span key={item}>{item}</span>)}</div>}
    </div>
  );
}

function SafeButton({
  theme,
  variant = 'primary',
  children,
  style,
}: {
  theme: PreviewTheme;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      style={{
        border: `1px solid ${variant === 'primary' ? 'transparent' : 'var(--vb-border)'}`,
        background: variant === 'primary' ? 'var(--vb-primary)' : 'var(--vb-secondary)',
        color: variant === 'primary' ? 'white' : 'var(--vb-fg)',
        borderRadius: theme.radiusButton,
        padding: `${Math.max(7, theme.spacingPx * 0.55)}px ${Math.max(12, theme.spacingPx)}px`,
        fontWeight: 800,
        fontSize: 12,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SafeCard({ theme, children, emphasis = false }: { theme: PreviewTheme; children: React.ReactNode; emphasis?: boolean }) {
  return (
    <div
      style={{
        background: emphasis ? 'linear-gradient(135deg, var(--vb-card), var(--vb-secondary))' : 'var(--vb-card)',
        border: '1px solid var(--vb-border)',
        borderRadius: theme.radiusCard,
        padding: Math.max(10, theme.spacingPx),
        boxShadow: emphasis ? theme.elevation : 'none',
      }}
    >
      {children}
    </div>
  );
}

function SafeBadge({ theme, children }: { theme?: PreviewTheme; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10,
      padding: '3px 7px',
      borderRadius: theme?.radiusButton ?? 5,
      background: 'var(--vb-secondary)',
      color: 'var(--vb-fg)',
      border: '1px solid var(--vb-border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function SafeInput({ theme, placeholder }: { theme: PreviewTheme; placeholder: string }) {
  return (
    <div style={{ border: '1px solid var(--vb-border)', borderRadius: theme.radiusInput, padding: '8px 10px', color: 'var(--vb-muted-fg)', fontSize: 12 }}>
      {placeholder}
    </div>
  );
}

function SafeStat({ theme, label, value }: { theme: PreviewTheme; label: string; value: string }) {
  return (
    <SafeCard theme={theme}>
      <div style={{ color: 'var(--vb-muted-fg)', fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 20 }}>{value}</div>
    </SafeCard>
  );
}

function MiniProgress({ theme }: { theme: PreviewTheme }) {
  return (
    <div style={{ height: 7, borderRadius: theme.radiusButton, background: 'var(--vb-muted)', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: '68%', height: '100%', background: 'var(--vb-primary)' }} />
    </div>
  );
}

function MiniChart({ theme }: { theme: PreviewTheme }) {
  const heights = [36, 56, 42, 68, 50];
  return (
    <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 76, marginTop: 8 }}>
      {heights.map((height, index) => (
        <div key={index} style={{ flex: 1, height, borderRadius: theme.radiusButton, background: index % 2 ? 'var(--vb-accent)' : 'var(--vb-primary)', opacity: 0.9 }} />
      ))}
    </div>
  );
}

function ListRows({ theme, labels }: { theme: PreviewTheme; labels: string[] }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {labels.map(label => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: theme.radiusButton, background: 'var(--vb-card)', border: '1px solid var(--vb-border)', fontSize: 12 }}>
          <span>{label}</span>
          <span style={{ width: 42, height: 6, borderRadius: 99, background: 'var(--vb-accent)' }} />
        </div>
      ))}
    </div>
  );
}

function FieldGrid({ fields }: { fields: Array<[string, unknown]> }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {fields.map(([label, value]) => (
        <div key={label} data-testid={`field-${testId(label)}`} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, alignItems: 'start' }}>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{label}</div>
          <div style={{ fontSize: 12, wordBreak: 'break-word' }}>{formatValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function TokenGrid({ tokens, compact = false }: { tokens: ColorFamilyTokenMap; compact?: boolean }) {
  const entries = Object.entries(tokens).filter(([key]) => key !== 'raw');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
      {entries.map(([key, value]) => {
        if (key === 'chartPalette' && Array.isArray(value)) {
          return (
            <div key={key} style={tokenRowStyle}>
              <span>{key}</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {value.map((item, index) => <Swatch key={`${item}-${index}`} value={String(item)} />)}
              </div>
            </div>
          );
        }
        return (
          <div key={key} style={tokenRowStyle}>
            <span>{key}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Swatch value={String(value)} />
              <code style={{ fontSize: 11 }}>{String(value)}</code>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Swatch({ value }: { value: string }) {
  const color = cssColorFromToken(value);
  return (
    <span
      title={value}
      style={{
        width: 28,
        height: 22,
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: color,
        display: 'inline-block',
        flex: '0 0 auto',
      }}
    />
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
      {children}
    </span>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div style={panelStyle}>{children}</div>;
}

function discoverRuntimeVisualBankFiles(): RuntimeDiscovery {
  return {
    designSources: loadRuntimeDesignSources(),
    surfaceFiles: loadRuntimeSurfaceFiles(),
    loadedAt: new Date().toISOString(),
    fallbackUsed: false,
    errors: [],
  };
}

function loadRuntimeDesignSources(): RuntimeDesignSource[] {
  const licensePaths = new Set(Object.keys(designSourceLicenseModules).map(normalizeSourcePath));
  return Object.entries(designSourceManifestModules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => {
      const manifestPath = normalizeSourcePath(path);
      const id = str(raw.id) || idFromDesignSourcePath(manifestPath) || 'unknown-source';
      const licensePath = `prototype-bank/design-sources/${id}/license.md`;
      return {
        id,
        name: str(raw.name) || id,
        license: str(raw.license) || 'not defined',
        url: str(raw.url),
        categories: stringArray(raw.curated_categories ?? raw.categories),
        normalizedInto: stringArray(raw.normalizedInto),
        importedFiles: stringArray(raw.importedFiles ?? raw.files),
        manifestPath,
        licenseFilePresent: licensePaths.has(licensePath),
        raw,
      };
    });
}

function loadRuntimeSurfaceFiles(): RuntimeSurfaceFile[] {
  const surfaceFiles = Object.keys(surfaceFileModules).map(path => ({
    path: normalizeSourcePath(path),
    group: groupForPath(path),
    kind: 'surface' as const,
  }));
  const foundationFiles = Object.keys(foundationFileModules).map(path => ({
    path: normalizeSourcePath(path),
    group: 'foundation' as const,
    kind: 'foundation' as const,
  }));
  return [...surfaceFiles, ...foundationFiles].sort((a, b) => a.path.localeCompare(b.path));
}

function groupSurfaceFiles(files: RuntimeSurfaceFile[]): Record<SurfaceGroup, RuntimeSurfaceFile[]> {
  const groups: Record<SurfaceGroup, RuntimeSurfaceFile[]> = {
    primitives: [],
    cards: [],
    blocks: [],
    layouts: [],
    patterns: [],
    foundation: [],
    other: [],
  };
  for (const file of files) {
    groups[file.group].push(file);
  }
  return groups;
}

function groupForPath(path: string): SurfaceGroup {
  const normalized = normalizeSourcePath(path);
  if (normalized.includes('/primitives/')) return 'primitives';
  if (normalized.includes('/cards/')) return 'cards';
  if (normalized.includes('/blocks/')) return 'blocks';
  if (normalized.includes('/layouts/')) return 'layouts';
  if (normalized.includes('/patterns/')) return 'patterns';
  if (normalized.includes('/foundation/')) return 'foundation';
  return 'other';
}

function collectSelectedSkeletonVariants(bank: NormalizedVisualBank | null, selectedSkeleton: SkeletonId): HeroVariantItem[] {
  if (!bank) return [];
  const exactMatches = bank.packs.flatMap(pack =>
    pack.variants
      .filter(variant => variant.skeleton === selectedSkeleton)
      .map(variant => ({ packId: pack.packId, variant })),
  );
  if (exactMatches.length > 0) return exactMatches;
  return bank.packs
    .filter(pack => pack.compatibleSkeletons.includes(selectedSkeleton))
    .flatMap(pack => pack.variants.map(variant => ({ packId: pack.packId, variant })));
}

function selectHeroStripVariants(items: HeroVariantItem[]): HeroVariantItem[] {
  const expressive = items
    .filter(item => isNonNeutralVariant(item.variant))
    .sort((a, b) => heroVariantScore(a.variant) - heroVariantScore(b.variant));
  const neutral = items
    .filter(item => !isNonNeutralVariant(item.variant))
    .sort((a, b) => heroVariantScore(a.variant) - heroVariantScore(b.variant));
  return [...expressive, ...neutral].slice(0, 4);
}

function selectHeroVariantFromVariants(variants: NormalizedVisualVariant[]): NormalizedVisualVariant | null {
  return orderVariantsForShowcase(variants)[0] ?? null;
}

function orderVariantsForShowcase(variants: NormalizedVisualVariant[]): NormalizedVisualVariant[] {
  return [...variants].sort((a, b) => heroVariantScore(a) - heroVariantScore(b));
}

function heroVariantScore(variant: NormalizedVisualVariant): number {
  const marker = variantMarker(variant);
  const familyIndex = HERO_COLOR_FAMILY_PRIORITY.findIndex(family => marker.includes(family));
  if (familyIndex >= 0) return familyIndex * 10;
  const themeIndex = HERO_THEME_PRIORITY.findIndex(theme => marker.includes(theme));
  if (themeIndex >= 0 && isNonNeutralVariant(variant)) return 100 + themeIndex * 10;
  if (isNonNeutralVariant(variant)) return 500;
  return 1000;
}

function isNonNeutralVariant(variant: NormalizedVisualVariant): boolean {
  const family = str(variant.colorFamily).toLowerCase();
  if (family) return family !== 'neutral';
  const listedFamily = variant.colorFamilies.map(item => item.trim().toLowerCase()).find(Boolean);
  if (listedFamily) return listedFamily !== 'neutral';
  return /fintech|clinical|coral|teal|blue|rose|gold|neon|lavender|indigo|sage|amber|green|navy/.test(variantMarker(variant));
}

function isNeutralVariant(variant: NormalizedVisualVariant): boolean {
  return !isNonNeutralVariant(variant);
}

function variantMarker(variant: NormalizedVisualVariant): string {
  return [
    variant.colorFamily,
    ...variant.colorFamilies,
    variant.theme,
    variant.name,
    variant.toneProfile,
    variant.variantId,
  ].join(' ').toLowerCase();
}

function makePreviewTheme(variant: NormalizedVisualVariant | null, colorFamily: NormalizedColorFamily | null): PreviewTheme {
  const tokens = colorFamily?.tokens ?? NEUTRAL_TOKENS;
  const spacingPx = spacingFromVariant(variant);
  const radiusProfile = variant?.radiusProfile ?? str(variant?.raw?.radiusProfile) ?? 'soft';
  const radiusCard = radiusValue(variant?.radius, 'card', radiusProfile, '16px');
  const radiusButton = radiusValue(variant?.radius, 'button', radiusProfile, '10px');
  const radiusInput = radiusValue(variant?.radius, 'input', radiusProfile, '10px');
  const chart = tokens.chartPalette.length > 0 ? tokens.chartPalette : NEUTRAL_TOKENS.chartPalette;
  const background = cssColorFromToken(tokens.background);
  const foreground = cssColorFromToken(tokens.foreground);
  const mutedSurface = cssColorFromToken(tokens.muted);
  const surface = cssColorFromToken(tokens.card);
  const accent = cssColorFromToken(tokens.accent);
  const border = cssColorFromToken(tokens.border);
  const elevation = elevationFromVariant(variant);
  const vars: React.CSSProperties & Record<string, string | number> = {
    '--vb-bg': background,
    '--vb-surface': surface,
    '--vb-text': foreground,
    '--vb-text-muted': foreground,
    '--vb-radius-md': radiusButton,
    '--vb-radius-lg': radiusCard,
    '--vb-shadow-sm': elevation === 'none' ? '0 1px 2px rgba(15, 23, 42, 0.08)' : elevation,
    '--vb-duration-base': durationFromVariant(variant),
    '--vb-fg': foreground,
    '--vb-muted': mutedSurface,
    '--vb-muted-fg': foreground,
    '--vb-card': surface,
    '--vb-primary': cssColorFromToken(tokens.primary),
    '--vb-secondary': cssColorFromToken(tokens.secondary),
    '--vb-accent': accent,
    '--vb-border': border,
    '--vb-success': cssColorFromToken(tokens.success),
    '--vb-warning': cssColorFromToken(tokens.warning),
    '--vb-danger': cssColorFromToken(tokens.danger),
    '--vb-chart-1': cssColorFromToken(chart[0] ?? tokens.primary),
    '--vb-chart-2': cssColorFromToken(chart[1] ?? tokens.accent),
    '--vb-chart-3': cssColorFromToken(chart[2] ?? tokens.success),
    '--vb-chart-4': cssColorFromToken(chart[3] ?? tokens.warning),
  };

  return {
    vars,
    tokens,
    spacingPx,
    radiusCard,
    radiusButton,
    radiusInput,
    fontFamily: fontFamilyFromVariant(variant),
    fontWeight: fontWeightFromVariant(variant),
    elevation,
  };
}

function makeSourceSampleTheme(source: RuntimeDesignSource): PreviewTheme {
  const tokens = sourceTokensFor(source);
  return makePreviewTheme(null, {
    id: `${source.id}-sample-family`,
    name: `${source.name} sample family`,
    sourcePath: source.manifestPath,
    domains: [],
    subdomains: [],
    toneProfiles: [],
    trustProfiles: [],
    densityProfiles: [],
    contrastProfiles: [],
    tokens,
    raw: { id: `${source.id}-sample-family`, name: `${source.name} sample family`, tokens },
  });
}

function sourceTokensFor(source: RuntimeDesignSource): ColorFamilyTokenMap {
  const marker = `${source.id} ${source.name} ${source.categories.join(' ')}`.toLowerCase();
  if (marker.includes('hyperui') || marker.includes('marketing')) {
    return {
      ...NEUTRAL_TOKENS,
      background: '28 100% 98%',
      primary: '15 82% 50%',
      secondary: '35 94% 90%',
      accent: '188 70% 42%',
      border: '28 42% 84%',
      chartPalette: ['15 82% 50%', '188 70% 42%', '35 94% 52%', '275 45% 54%'],
    };
  }
  if (marker.includes('daisy')) {
    return {
      ...NEUTRAL_TOKENS,
      background: '210 60% 98%',
      primary: '199 88% 48%',
      secondary: '268 74% 91%',
      accent: '330 78% 58%',
      border: '210 24% 83%',
      chartPalette: ['199 88% 48%', '330 78% 58%', '268 74% 62%', '142 56% 43%'],
    };
  }
  if (marker.includes('arco') || marker.includes('semi') || marker.includes('dashboard')) {
    return {
      ...NEUTRAL_TOKENS,
      background: '220 38% 97%',
      primary: '224 76% 48%',
      secondary: '220 30% 90%',
      accent: '174 72% 38%',
      border: '220 20% 82%',
      chartPalette: ['224 76% 48%', '174 72% 38%', '266 58% 56%', '35 88% 51%'],
    };
  }
  if (marker.includes('weui') || marker.includes('mobile')) {
    return {
      ...NEUTRAL_TOKENS,
      background: '150 30% 97%',
      primary: '152 64% 35%',
      secondary: '150 22% 88%',
      accent: '199 70% 42%',
      border: '150 18% 81%',
      chartPalette: ['152 64% 35%', '199 70% 42%', '38 82% 50%', '270 42% 56%'],
    };
  }
  if (marker.includes('shadcn') || marker.includes('primitive')) {
    return {
      ...NEUTRAL_TOKENS,
      background: '240 8% 98%',
      primary: '240 5% 20%',
      secondary: '240 5% 90%',
      accent: '215 70% 46%',
      border: '240 6% 84%',
      chartPalette: ['240 5% 20%', '215 70% 46%', '160 58% 40%', '35 84% 51%'],
    };
  }
  return NEUTRAL_TOKENS;
}

function findColorFamilyForVariant(bank: NormalizedVisualBank, variant: NormalizedVisualVariant): NormalizedColorFamily | null {
  return (
    bank.colorFamilies.find(family => family.id === variant.colorFamily) ??
    bank.colorFamilies.find(family => variant.colorFamilies.includes(family.id)) ??
    bank.colorFamilies[0] ??
    null
  );
}

function spacingFromVariant(variant: NormalizedVisualVariant | null): number {
  const value = `${variant?.spacing ?? variant?.densityProfile ?? ''}`.toLowerCase();
  if (value.includes('compact') || value.includes('dense')) return 8;
  if (value.includes('spacious') || value.includes('airy')) return 18;
  return 12;
}

function radiusValue(radius: VisualBankJson | undefined, slot: string, profile: string, fallback: string): string {
  const explicit = radiusSlotValue(radius, slot) ?? radiusSlotValue(radius, 'default');
  if (explicit) return normalizeRadiusValue(explicit, profile, fallback);
  return radiusFromProfile(profile, slot, fallback);
}

function radiusSlotValue(radius: VisualBankJson | undefined, slot: string): string | number | null {
  if (typeof radius === 'string' || typeof radius === 'number') return radius;
  if (!radius || typeof radius !== 'object' || Array.isArray(radius)) return null;
  const value = radius[slot];
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function normalizeRadiusValue(value: string | number, profile: string, fallback: string): string {
  if (typeof value === 'number') return `${value}px`;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  if (/^\d+(\.\d+)?(px|rem|em|%)$/.test(trimmed) || trimmed.startsWith('var(') || trimmed === '999px') return trimmed;
  return radiusFromProfile(trimmed || profile, 'card', fallback);
}

function radiusFromProfile(profile: string, slot: string, fallback: string): string {
  const normalized = profile.toLowerCase();
  if (normalized.includes('sharp')) return slot === 'card' ? '8px' : '6px';
  if (normalized.includes('pill')) return slot === 'card' ? '24px' : '999px';
  if (normalized.includes('soft')) return slot === 'card' ? '16px' : '12px';
  return fallback;
}

function fontFamilyFromVariant(variant: NormalizedVisualVariant | null): string {
  const typography = `${variant?.typography ?? ''}`.toLowerCase();
  if (typography.includes('mono') || typography.includes('technical')) return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  if (typography.includes('rounded') || typography.includes('friendly')) return 'ui-rounded, "Nunito Sans", Inter, system-ui, sans-serif';
  return 'Inter, ui-sans-serif, system-ui, sans-serif';
}

function fontWeightFromVariant(variant: NormalizedVisualVariant | null): number {
  const marker = `${variant?.typography ?? ''} ${variant?.toneProfile ?? ''}`.toLowerCase();
  if (marker.includes('technical') || marker.includes('executive')) return 720;
  if (marker.includes('soft') || marker.includes('calm')) return 650;
  if (marker.includes('playful') || marker.includes('bold')) return 820;
  return 740;
}

function elevationFromVariant(variant: NormalizedVisualVariant | null): string {
  const marker = `${variant?.raw?.elevationPreset ?? ''} ${variant?.raw?.elevation ?? ''} ${variant?.theme ?? ''}`.toLowerCase();
  if (!variant || marker.includes('flat')) return 'none';
  if (marker.includes('expressive') || marker.includes('layered') || marker.includes('shadow-lg')) return '0 18px 42px rgba(15, 23, 42, 0.18)';
  if (marker.includes('subtle') || marker.includes('shadow-sm')) return '0 8px 22px rgba(15, 23, 42, 0.1)';
  return '0 12px 30px rgba(15, 23, 42, 0.12)';
}

function durationFromVariant(variant: NormalizedVisualVariant | null): string {
  const marker = `${variant?.motionPreset ?? ''} ${variant?.raw?.motionProfile ?? ''}`.toLowerCase();
  if (marker.includes('reduced') || marker.includes('none')) return '120ms';
  if (marker.includes('expressive')) return '240ms';
  return '180ms';
}

function miniSidebarStyle(theme: PreviewTheme): React.CSSProperties {
  return {
    display: 'grid',
    gap: 8,
    alignContent: 'start',
    background: 'var(--vb-card)',
    border: '1px solid var(--vb-border)',
    borderRadius: theme.radiusCard,
    padding: 10,
  };
}

function sidebarItemStyle(theme: PreviewTheme): React.CSSProperties {
  return {
    borderRadius: theme.radiusButton,
    background: 'var(--vb-muted)',
    color: 'var(--vb-muted-fg)',
    fontSize: 10,
    padding: '5px 6px',
  };
}

function dotStyle(color: string): React.CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: 999,
    background: color,
  };
}

function cssColorFromToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'transparent';
  if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) return trimmed;
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%/.test(trimmed)) return `hsl(${trimmed})`;
  return trimmed;
}

function formatValue(value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') return <span style={{ color: 'var(--muted-foreground)' }}>not defined</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--muted-foreground)' }}>not defined</span>;
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {value.map(item => <Badge key={String(item)}>{String(item)}</Badge>)}
      </div>
    );
  }
  if (typeof value === 'object') {
    return <code style={{ fontSize: 11 }}>{formatJson(value as VisualBankJson)}</code>;
  }
  return String(value);
}

function formatJson(value: VisualBankJson): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeSourcePath(modulePath: string): string {
  const normalized = modulePath.replace(/\\/g, '/');
  const idx = normalized.indexOf('prototype-bank/');
  return idx >= 0 ? normalized.slice(idx) : normalized.replace(/^(\.\.\/)+/, '');
}

function idFromDesignSourcePath(path: string): string | null {
  return path.match(/design-sources\/([^/]+)\//)?.[1] ?? null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function testId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function emptyTotals() {
  return {
    packsLoaded: 0,
    variantsLoaded: 0,
    sourcesLoaded: 0,
    colorRampsLoaded: 0,
    sourceFilesLoaded: 0,
    surfaceFilesDiscovered: 0,
    skeletonCoverage: 0,
  };
}

function emptyRenderMetrics(): RenderMetrics {
  return {
    liveRenderEnabled: false,
    previewRenderer: 'VisualVariantPreview',
    renderSafeComponentsCount: 0,
    renderedVariantsCount: 0,
    renderedSkeletonPreview: 'not defined',
    appliedColorRamp: 'not defined',
    appliedTokenKeys: [],
    fallbackRenderUsed: true,
    nonRenderableFilesCount: 0,
    showcaseVerdict: 'FAIL',
    previewRenderError: null,
    coldStateHeroVariantId: 'not defined',
    coldStateColorFamily: 'not defined',
    selectedSkeletonVariantsCount: 0,
    nonNeutralVariantIds: [],
    nonNeutralVariantsAvailable: false,
    heroStripRendered: false,
    neutralDefaultAvoided: false,
    heroStripFirstColorFamily: 'not defined',
  };
}

const panelStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '14px 16px',
};

const rowStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  margin: '0 0 10px',
};

const smallTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  margin: '18px 0 10px',
};

const previewCaptionStyle: React.CSSProperties = {
  color: 'var(--muted-foreground)',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
};

const tokenRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 12,
};

function switchButton(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 8,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    background: active ? 'var(--primary)' : 'var(--card)',
    color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
  };
}

export default VisualBankModule;

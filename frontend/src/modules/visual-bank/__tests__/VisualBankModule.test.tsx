// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as FileVisualBankService from '../../../services/FileVisualBankService';
import type { NormalizedVisualBank } from '../../../services/FileVisualBankService';
import type { SkeletonId } from '../../../services/SkeletonRegistry';
import { VisualBankModule } from '../VisualBankModule';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VisualBankModule runtime loading', () => {
  it('calls FileVisualBankService.loadFileVisualBank on mount', async () => {
    const spy = vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('shows loaded packs from the mock bank', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank('runtime-pack-id'));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    expect(await screen.findByText('runtime-pack-id')).toBeInTheDocument();
    expect(screen.queryByText('saas-dashboard-domain-pack')).not.toBeInTheDocument();
  });

  it('shows loaded variant JSON values from the mock bank', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank('runtime-pack-id', 'unique-variant-json', 'unique-theme-json'));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'variants' }));

    expect((await screen.findAllByText('unique-variant-json')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('unique-theme-json').length).toBeGreaterThan(0);
  });

  it('does not show old hardcoded design sources when runtime sources are empty', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank());

    render(<VisualBankModule runtimeDiscoveryOverride={{ ...mockDiscovery(), designSources: [] }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'sources' }));

    expect(await screen.findByText('No runtime design source manifests discovered.')).toBeInTheDocument();
    expect(screen.queryByText('shadcn/ui')).not.toBeInTheDocument();
    expect(screen.queryByText('HyperUI')).not.toBeInTheDocument();
  });

  it('renders runtime proof counts from the loaded bank', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    await screen.findByText('loadedFromFileBank: true');
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByText('loadedFromFileBank: true')).toBeInTheDocument();
    expect(within(proof).getByTestId('field-packsloaded')).toHaveTextContent('1');
    expect(within(proof).getByTestId('field-variantsloaded')).toHaveTextContent('1');
    expect(within(proof).getByTestId('field-sourcesloaded')).toHaveTextContent('1');
  });

  it('renders live visual preview with render proof enabled', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    expect(await screen.findByText('Live Visual Preview')).toBeInTheDocument();
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByTestId('field-liverenderenabled')).toHaveTextContent('true');
    expect(within(proof).getByTestId('field-previewrenderer')).toHaveTextContent('VisualVariantPreview');
  });

  it('applies loaded variant JSON values to the live preview', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank('runtime-pack-id', 'unique-variant-json', 'unique-theme-json'));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    const preview = await screen.findByTestId('applied-variant-preview');
    expect(preview).toHaveAttribute('data-preview-theme', 'unique-theme-json');
    expect(preview).toHaveAttribute('data-preview-color-family', 'mock-family');
    expect(preview).toHaveAttribute('data-preview-radius', '17px');
    expect(preview).toHaveAttribute('data-preview-spacing', 'mock-spacing');
    expect(preview).toHaveAttribute('data-preview-typography', 'mock-typography');
  });

  it('renders 8 visual variant cards for the selected skeleton', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBankForSkeleton('mobile-app', 8));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'variants' }));
    const grid = await screen.findByTestId('variant-preview-grid');
    expect(within(grid).getAllByTestId('visual-variant-preview')).toHaveLength(8);
  });

  it('uses skeleton-specific mini renderers', async () => {
    const loader = vi.spyOn(FileVisualBankService, 'loadFileVisualBank');

    loader.mockReturnValue(mockBankForSkeleton('saas-dashboard', 1));
    const first = render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);
    expect((await screen.findAllByTestId('saas-dashboard-preview')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Chart').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Table').length).toBeGreaterThan(0);
    first.unmount();
    cleanup();

    loader.mockReturnValue(mockBankForSkeleton('mobile-app', 1));
    const second = render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);
    expect((await screen.findAllByTestId('mobile-app-preview')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Phone Frame').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bottom Nav').length).toBeGreaterThan(0);
    second.unmount();
    cleanup();

    loader.mockReturnValue(mockBankForSkeleton('ecommerce', 1));
    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);
    expect((await screen.findAllByTestId('ecommerce-preview')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Product Card').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cart CTA').length).toBeGreaterThan(0);
  });

  it('does not mark metadata-only rendering as PASS', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBankForSkeleton('mobile-app', 0));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    await screen.findByText('loadedFromFileBank: true');
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByTestId('field-renderedvariantscount')).toHaveTextContent('0');
    expect(within(proof).getByTestId('field-liverenderenabled')).toHaveTextContent('false');
    expect(within(proof).getByTestId('field-showcaseverdict')).toHaveTextContent('FAIL');
  });

  it('renders render-safe component previews and marks non-renderable files', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'components' }));
    const registry = await screen.findByTestId('render-safe-components');
    expect(within(registry).getAllByTestId('surface-component-sample').length).toBeGreaterThanOrEqual(3);
    expect(within(registry).getByText('Preview Button')).toBeInTheDocument();
    expect(within(registry).getByText('Preview Card')).toBeInTheDocument();
    expect(screen.getByText('discovered but not render-safe')).toBeInTheDocument();
  });

  it('selects a non-neutral hero variant by default when available', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockColdStateBank({ skeleton: 'saas-dashboard' }));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    const preview = await screen.findByTestId('applied-variant-preview');
    await waitFor(() => {
      expect(preview).toHaveAttribute('data-preview-color-family', 'playful-coral');
      expect(preview).toHaveAttribute('data-preview-theme', 'playful-consumer');
    });
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByTestId('field-neutraldefaultavoided')).toHaveTextContent('true');
  });

  it('computes non-neutral availability from variant colorFamily instead of pack-level fields', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockColdStateBank({ skeleton: 'saas-dashboard', packLevelNeutralOnly: true }));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    await screen.findByTestId('applied-variant-preview');
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByTestId('field-selectedskeletonvariantscount')).toHaveTextContent('5');
    expect(within(proof).getByTestId('field-nonneutralvariantsavailable')).toHaveTextContent('true');
    expect(within(proof).getByTestId('field-nonneutralvariantids')).toHaveTextContent('fintech-variant');
    expect(within(proof).getByTestId('field-nonneutralvariantids')).toHaveTextContent('playful-variant');
    expect(within(proof).getByTestId('field-coldstatecolorfamily')).toHaveTextContent('playful-coral');
  });

  it('renders at least 3 non-neutral hero cards when available', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockColdStateBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    const strip = await screen.findByTestId('hero-visual-strip');
    const cards = within(strip).getAllByTestId('hero-variant-card');
    const nonNeutralCards = cards.filter(card => card.getAttribute('data-preview-color-family') !== 'neutral');
    expect(nonNeutralCards.length).toBeGreaterThanOrEqual(3);
    expect(cards[0]).not.toHaveAttribute('data-preview-color-family', 'neutral');
    expect(cards[0]).toHaveAttribute('data-preview-color-family', 'playful-coral');
  });

  it('clicking a hero card changes the live visual preview', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockColdStateBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    const strip = await screen.findByTestId('hero-visual-strip');
    const clinicalCard = strip.querySelector('[data-preview-color-family="clinical-teal"]');
    expect(clinicalCard).not.toBeNull();
    await act(async () => {
      fireEvent.click(clinicalCard as HTMLElement);
    });

    await waitFor(() => {
      expect(screen.getByTestId('applied-variant-preview')).toHaveAttribute('data-preview-color-family', 'clinical-teal');
    });
  });

  it('falls back honestly when only neutral variants are available', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockColdStateBank({ onlyNeutral: true }));

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    const preview = await screen.findByTestId('applied-variant-preview');
    expect(preview).toHaveAttribute('data-preview-color-family', 'neutral');
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByTestId('field-nonneutralvariantsavailable')).toHaveTextContent('false');
    expect(within(proof).getByTestId('field-neutraldefaultavoided')).toHaveTextContent('false');
    expect(within(proof).getByTestId('field-herostripfirstcolorfamily')).toHaveTextContent('neutral');
  });

  it('shows hero strip runtime proof', async () => {
    vi.spyOn(FileVisualBankService, 'loadFileVisualBank').mockReturnValue(mockColdStateBank());

    render(<VisualBankModule runtimeDiscoveryOverride={mockDiscovery()} />);

    await screen.findByTestId('hero-visual-strip');
    const proof = screen.getByTestId('runtime-proof');
    expect(within(proof).getByTestId('field-herostriprendered')).toHaveTextContent('true');
    expect(within(proof).getByTestId('field-coldstateherovariantid')).toHaveTextContent('playful-variant');
    expect(within(proof).getByTestId('field-coldstatecolorfamily')).toHaveTextContent('playful-coral');
    expect(within(proof).getByTestId('field-herostripfirstcolorfamily')).toHaveTextContent('playful-coral');
  });
});

function mockDiscovery() {
  return {
    loadedAt: '2026-05-13T00:00:00.000Z',
    fallbackUsed: false,
    errors: [],
    designSources: [{
      id: 'runtime-source',
      name: 'Runtime Source',
      license: 'MIT',
      url: 'https://example.com/runtime-source',
      categories: ['runtime-category'],
      normalizedInto: ['surfaces/primitives'],
      importedFiles: ['button.tsx'],
      manifestPath: 'prototype-bank/design-sources/runtime-source/manifest.json',
      licenseFilePresent: true,
      raw: { id: 'runtime-source' },
    }],
    surfaceFiles: [{
      path: 'prototype-bank/design-packs/surfaces/primitives/runtime-button.tsx',
      group: 'primitives' as const,
      kind: 'surface' as const,
    }],
  };
}

function mockBank(
  packId = 'mock-pack',
  variantId = 'mock-variant',
  theme = 'mock-theme',
): NormalizedVisualBank {
  const variant = {
    variantId,
    packId,
    skeleton: 'mobile-app',
    variantPath: `prototype-bank/design-packs/domain/${packId}/visual-variants/${variantId}.json`,
    selectedVariantPath: `prototype-bank/design-packs/domain/${packId}/visual-variants/${variantId}.json`,
    sourcePath: `prototype-bank/design-packs/domain/${packId}/visual-variants/${variantId}.json`,
    name: 'Mock Variant',
    theme,
    spacing: 'mock-spacing',
    typography: 'mock-typography',
    radius: { card: '17px' },
    motionPreset: 'mock-motion',
    densityProfile: 'mock-density',
    radiusProfile: 'soft',
    contrastProfile: 'medium',
    trustProfile: 'mock-trust',
    toneProfile: 'mock-tone',
    domains: ['mock-domain'],
    subdomains: ['mock-subdomain'],
    surfaces: ['mobile'],
    colorFamily: 'mock-family',
    colorFamilies: ['mock-family'],
    targetUsers: 'mock target users',
    tokenHints: ['mock-token-hint'],
    componentHints: ['mock-component-hint'],
    layoutHints: ['mock-layout-hint'],
    forbiddenPatterns: ['mock-forbidden-pattern'],
    requiredFiles: [],
    sourceFiles: [`prototype-bank/design-packs/domain/${packId}/visual-variants/${variantId}.json`],
    variationSeed: 'seed',
    antiRepeatGroup: 'mock-anti-repeat',
    raw: {
      id: variantId,
      theme,
      spacing: 'mock-spacing',
      typography: 'mock-typography',
      radius: { card: '17px' },
      motionPreset: 'mock-motion',
      densityProfile: 'mock-density',
      trustProfile: 'mock-trust',
      toneProfile: 'mock-tone',
      colorFamily: 'mock-family',
      targetUsers: 'mock target users',
      tokenHints: ['mock-token-hint'],
      componentHints: ['mock-component-hint'],
      layoutHints: ['mock-layout-hint'],
      forbiddenPatterns: ['mock-forbidden-pattern'],
    },
  };
  const pack = {
    packId,
    manifestPath: `prototype-bank/design-packs/domain/${packId}/manifest.json`,
    selectedManifestPath: `prototype-bank/design-packs/domain/${packId}/manifest.json`,
    skeleton: 'mobile-app',
    compatibleSkeletons: ['mobile-app'],
    skeletonPath: 'skeletons/mobile-app/',
    domains: ['mock-domain'],
    subdomains: ['mock-subdomain'],
    surfaces: ['mobile'],
    trustProfiles: ['mock-trust'],
    toneProfiles: ['mock-tone'],
    densityProfiles: ['mock-density'],
    radiusProfiles: ['soft'],
    motionProfiles: ['mock-motion'],
    contrastProfiles: ['medium'],
    layoutPatterns: ['bottom-tabs'],
    componentFamilies: ['mobile-nav'],
    colorFamilies: ['mock-family'],
    requiredBlocks: ['mock-block'],
    requiredFiles: [],
    forbiddenPatterns: [],
    antiRepeatGroup: 'mock-pack-group',
    priorityScore: 10,
    variants: [variant],
    sourceFiles: [`prototype-bank/design-packs/domain/${packId}/manifest.json`],
    raw: {
      id: packId,
      skeleton: 'mobile-app',
      compatibleSkeletons: ['mobile-app'],
      variants: [variantId],
    },
  };
  return {
    packs: [pack],
    semanticDomains: [],
    colorFamilies: [{
      id: 'mock-family',
      name: 'Mock Family',
      sourcePath: 'prototype-bank/design-packs/assets/color-ramps/mock-family.json',
      domains: ['mock-domain'],
      subdomains: ['mock-subdomain'],
      toneProfiles: ['mock-tone'],
      trustProfiles: ['mock-trust'],
      densityProfiles: ['mock-density'],
      contrastProfiles: ['medium'],
      tokens: {
        background: '0 0% 98%',
        foreground: '0 0% 8%',
        muted: '0 0% 90%',
        card: '0 0% 100%',
        primary: '210 80% 45%',
        secondary: '210 30% 88%',
        accent: '170 70% 40%',
        border: '0 0% 82%',
        success: '142 56% 40%',
        warning: '38 92% 50%',
        danger: '0 72% 50%',
        chartPalette: ['210 80% 45%', '170 70% 40%', '142 56% 40%', '38 92% 50%'],
      },
      raw: { id: 'mock-family' },
    }],
    sourceFiles: ['prototype-bank/design-packs/domain/mock-pack/manifest.json'],
  } as unknown as NormalizedVisualBank;
}

function mockBankForSkeleton(skeleton: SkeletonId, variantCount: number): NormalizedVisualBank {
  const bank = mockBank(`${skeleton}-pack`, `${skeleton}-variant-1`, `${skeleton}-theme-1`);
  const pack = bank.packs[0];
  pack.skeleton = skeleton;
  pack.compatibleSkeletons = [skeleton];
  pack.skeletonPath = `skeletons/${skeleton}/`;
  pack.manifestPath = `prototype-bank/design-packs/domain/${skeleton}/manifest.json`;
  pack.selectedManifestPath = pack.manifestPath;
  pack.sourceFiles = [pack.manifestPath];
  pack.variants = Array.from({ length: variantCount }, (_, index) => {
    const variantNumber = index + 1;
    return {
      ...pack.variants[0],
      variantId: `${skeleton}-variant-${variantNumber}`,
      name: `${skeleton} Variant ${variantNumber}`,
      skeleton,
      theme: `${skeleton}-theme-${variantNumber}`,
      spacing: ['compact', 'comfortable', 'spacious'][index % 3],
      typography: index % 2 ? 'technical-ui' : 'soft-rounded',
      radius: { card: `${10 + index}px`, button: `${8 + index}px`, input: `${8 + index}px` },
      motionPreset: index % 2 ? 'gentle' : 'reduced',
      variantPath: `prototype-bank/design-packs/domain/${skeleton}/visual-variants/${skeleton}-variant-${variantNumber}.json`,
      selectedVariantPath: `prototype-bank/design-packs/domain/${skeleton}/visual-variants/${skeleton}-variant-${variantNumber}.json`,
      sourcePath: `prototype-bank/design-packs/domain/${skeleton}/visual-variants/${skeleton}-variant-${variantNumber}.json`,
      componentHints: [`${skeleton}-component-${variantNumber}`],
      layoutHints: [`${skeleton}-layout-${variantNumber}`],
      raw: {
        ...pack.variants[0].raw,
        id: `${skeleton}-variant-${variantNumber}`,
        theme: `${skeleton}-theme-${variantNumber}`,
        spacing: ['compact', 'comfortable', 'spacious'][index % 3],
        typography: index % 2 ? 'technical-ui' : 'soft-rounded',
        radius: { card: `${10 + index}px`, button: `${8 + index}px`, input: `${8 + index}px` },
        motionPreset: index % 2 ? 'gentle' : 'reduced',
      },
    };
  });
  bank.sourceFiles = [pack.manifestPath];
  return bank;
}

function mockColdStateBank(options: { onlyNeutral?: boolean; packLevelNeutralOnly?: boolean; skeleton?: SkeletonId } = {}): NormalizedVisualBank {
  const skeleton = options.skeleton ?? 'mobile-app';
  const bank = mockBankForSkeleton(skeleton, 1);
  const pack = bank.packs[0];
  const baseVariant = pack.variants[0];
  const variantSpecs = options.onlyNeutral
    ? [
        ['neutral-variant', 'Neutral Variant', 'neutral', 'neutral-base'],
        ['neutral-alt-variant', 'Neutral Alt Variant', 'neutral', 'neutral-alt'],
      ]
    : [
        ['neutral-variant', 'Neutral Variant', 'neutral', 'neutral-base'],
        ['fintech-variant', 'Fintech Variant', 'fintech-indigo', 'fintech-corporate'],
        ['clinical-variant', 'Clinical Variant', 'clinical-teal', 'clinical-care'],
        ['playful-variant', 'Playful Variant', 'playful-coral', 'playful-consumer'],
        ['cool-variant', 'Cool Variant', 'cool-blue', 'cool-operator'],
      ];

  pack.variants = variantSpecs.map(([variantId, name, colorFamily, theme], index) => ({
    ...baseVariant,
    variantId,
    name,
    colorFamily,
    colorFamilies: [colorFamily],
    theme,
    spacing: index % 2 ? 'comfortable' : 'spacious',
    motionPreset: index % 2 ? 'gentle' : 'expressive',
    variantPath: `prototype-bank/design-packs/domain/${skeleton}/visual-variants/${variantId}.json`,
    selectedVariantPath: `prototype-bank/design-packs/domain/${skeleton}/visual-variants/${variantId}.json`,
    sourcePath: `prototype-bank/design-packs/domain/${skeleton}/visual-variants/${variantId}.json`,
    raw: {
      ...baseVariant.raw,
      id: variantId,
      name,
      colorFamily,
      theme,
      spacing: index % 2 ? 'comfortable' : 'spacious',
      motionPreset: index % 2 ? 'gentle' : 'expressive',
    },
  }));
  pack.colorFamilies = options.packLevelNeutralOnly ? ['neutral'] : Array.from(new Set(variantSpecs.map(([, , colorFamily]) => colorFamily)));
  bank.colorFamilies = Array.from(new Set(variantSpecs.map(([, , colorFamily]) => colorFamily))).map(testColorFamily);
  return bank;
}

function testColorFamily(id: string): NormalizedVisualBank['colorFamilies'][number] {
  const palettes: Record<string, {
    background: string;
    primary: string;
    secondary: string;
    accent: string;
    border: string;
    chartPalette: string[];
  }> = {
    neutral: {
      background: '0 0% 98%',
      primary: '240 5% 28%',
      secondary: '240 5% 88%',
      accent: '218 48% 48%',
      border: '240 6% 84%',
      chartPalette: ['240 5% 28%', '218 48% 48%', '160 52% 42%', '36 84% 52%'],
    },
    'playful-coral': {
      background: '12 100% 98%',
      primary: '12 88% 54%',
      secondary: '28 92% 90%',
      accent: '190 72% 42%',
      border: '18 46% 82%',
      chartPalette: ['12 88% 54%', '190 72% 42%', '328 76% 58%', '38 92% 50%'],
    },
    'clinical-teal': {
      background: '170 52% 97%',
      primary: '174 72% 33%',
      secondary: '168 42% 88%',
      accent: '204 70% 44%',
      border: '170 24% 78%',
      chartPalette: ['174 72% 33%', '204 70% 44%', '142 56% 40%', '38 92% 50%'],
    },
    'fintech-indigo': {
      background: '235 36% 96%',
      primary: '238 72% 52%',
      secondary: '235 42% 88%',
      accent: '270 72% 56%',
      border: '235 24% 80%',
      chartPalette: ['238 72% 52%', '270 72% 56%', '198 70% 44%', '38 92% 50%'],
    },
    'cool-blue': {
      background: '210 60% 98%',
      primary: '214 82% 48%',
      secondary: '213 42% 90%',
      accent: '188 78% 42%',
      border: '214 24% 82%',
      chartPalette: ['214 82% 48%', '188 78% 42%', '160 52% 42%', '38 92% 50%'],
    },
  };
  const palette = palettes[id] ?? palettes.neutral;
  return {
    id,
    name: id,
    sourcePath: `prototype-bank/design-packs/assets/color-ramps/${id}.json`,
    domains: ['mock-domain'],
    subdomains: ['mock-subdomain'],
    toneProfiles: ['mock-tone'],
    trustProfiles: ['mock-trust'],
    densityProfiles: ['mock-density'],
    contrastProfiles: ['medium'],
    tokens: {
      background: palette.background,
      foreground: '240 10% 8%',
      muted: '240 6% 90%',
      card: '0 0% 100%',
      primary: palette.primary,
      secondary: palette.secondary,
      accent: palette.accent,
      border: palette.border,
      success: '142 56% 40%',
      warning: '38 92% 50%',
      danger: '0 72% 50%',
      chartPalette: palette.chartPalette,
    },
    raw: { id },
  };
}

// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisualBankModule } from './VisualBankModule';
import * as PremiumComponentBankService from '../../services/PremiumComponentBankService';
import type { PremiumComponentBank } from '../../services/PremiumComponentBankService';

async function renderLoaded() {
  const result = render(<VisualBankModule />);
  await screen.findByTestId('live-visual-preview');
  return result;
}

function openPremiumTab() {
  fireEvent.click(screen.getByTestId('visual-bank-tab-premium-components'));
  return screen.findByTestId('premium-components-panel');
}

async function expectPremiumRecipe(recipeId: string) {
  await openPremiumTab();
  await waitFor(() => {
    expect(screen.getByTestId('premium-recipe-preview')).toHaveAttribute('data-premium-recipe-id', recipeId);
  });
}

function selectSkeleton(skeletonId: string) {
  fireEvent.click(screen.getByRole('button', { name: skeletonId }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  PremiumComponentBankService.resetPremiumComponentBankCache();
});

describe('VisualBankModule premium layer integration', () => {
  it('keeps the old Visual Bank preview, tabs, and variants preview available', async () => {
    const loadSpy = vi.spyOn(PremiumComponentBankService, 'loadPremiumComponentBank');

    await renderLoaded();

    expect(loadSpy).toHaveBeenCalled();
    expect(screen.getByTestId('live-visual-preview')).toBeInTheDocument();
    expect(screen.getByTestId('applied-variant-preview')).toBeInTheDocument();

    for (const tab of ['overview', 'sources', 'themes', 'components', 'variants', 'premium-components']) {
      expect(screen.getByTestId(`visual-bank-tab-${tab}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('visual-bank-tab-variants'));

    expect(screen.getByTestId('variant-preview-grid')).toBeInTheDocument();
    expect(screen.getAllByTestId('visual-variant-preview').length).toBeGreaterThan(1);
    expect(screen.queryByTestId('premium-recipe-preview')).not.toBeInTheDocument();
  });

  it('clicking Premium Components changes active tab and swaps out overview hero content', async () => {
    await renderLoaded();

    expect(screen.getByTestId('visual-bank-tab-overview')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('hero-visual-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('premium-components-panel')).not.toBeInTheDocument();

    await openPremiumTab();

    expect(screen.getByTestId('visual-bank-tab-overview')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('visual-bank-tab-premium-components')).toHaveAttribute('data-active', 'true');
    expect(screen.queryByTestId('hero-visual-strip')).not.toBeInTheDocument();
    expect(screen.getByTestId('premium-components-panel')).toBeInTheDocument();
  });

  it('adds a separate Premium Components tab backed by PremiumComponentBankService', async () => {
    const loadSpy = vi.spyOn(PremiumComponentBankService, 'loadPremiumComponentBank');

    await renderLoaded();
    await openPremiumTab();

    expect(loadSpy).toHaveBeenCalled();
    expect(screen.getByTestId('premium-components-panel')).toBeInTheDocument();
    expect(screen.getByTestId('premium-layer-proof')).toHaveTextContent('sourceOfTruth');
    expect(screen.getByTestId('premium-layer-proof')).toHaveTextContent('PremiumComponentBankService');
    expect(screen.getByText('Premium Recipe Preview')).toBeInTheDocument();
    expect(screen.getByText('Existing Visual Variant Preview')).toBeInTheDocument();
  });

  it('maps selected skeletons to their premium recipes without changing the old variant preview', async () => {
    await renderLoaded();

    await expectPremiumRecipe('dashboard-operator');
    expect(screen.getByTestId('premium-components-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('live-visual-preview')).not.toBeInTheDocument();

    const expectations = [
      ['landing-page', 'landing-premium-saas'],
      ['mobile-app', 'mobile-consumer-app'],
      ['ecommerce', 'ecommerce-storefront'],
      ['social-community', 'social-community'],
      ['productivity-tool', 'dashboard-operator'],
    ] as const;

    for (const [skeletonId, recipeId] of expectations) {
      selectSkeleton(skeletonId);
      await expectPremiumRecipe(recipeId);
      expect(screen.getByTestId('premium-selected-recipe-id')).toHaveTextContent(recipeId);
      if (skeletonId === 'productivity-tool') {
        expect(screen.getByTestId('premium-recipe-preview').getAttribute('data-premium-rendered-component-ids') ?? '').toContain('premium-dashboard');
      }
    }
  });

  it('changes selectedRecipeId and rendered premium components when the skeleton changes', async () => {
    await renderLoaded();
    await expectPremiumRecipe('dashboard-operator');

    const dashboardPreview = screen.getByTestId('premium-recipe-preview');
    const dashboardComponents = dashboardPreview.getAttribute('data-premium-rendered-component-ids') ?? '';
    expect(dashboardComponents).toContain('premium-dashboard');

    selectSkeleton('landing-page');
    await expectPremiumRecipe('landing-premium-saas');

    const landingPreview = screen.getByTestId('premium-recipe-preview');
    const landingComponents = landingPreview.getAttribute('data-premium-rendered-component-ids') ?? '';
    expect(landingComponents).toContain('premium-landing');
    expect(landingComponents).not.toEqual(dashboardComponents);
  });

  it('keeps Premium Components populated when a stale category filter no longer matches the selected skeleton', async () => {
    await renderLoaded();
    selectSkeleton('landing-page');
    await expectPremiumRecipe('landing-premium-saas');
    fireEvent.click(screen.getByRole('button', { name: 'landing' }));
    expect(screen.getByTestId('premium-recipe-preview').getAttribute('data-premium-rendered-component-ids') ?? '').toContain('premium-landing');

    selectSkeleton('saas-dashboard');
    await expectPremiumRecipe('dashboard-operator');

    const dashboardIds = screen.getByTestId('premium-recipe-preview').getAttribute('data-premium-rendered-component-ids') ?? '';
    expect(dashboardIds).toContain('premium-dashboard');
    expect(screen.getAllByTestId('premium-component-preview-card').length).toBeGreaterThan(0);
  });

  it('renders real preview adapters for the selected recipe and wraps them in Visual Bank tokens', async () => {
    await renderLoaded();
    await expectPremiumRecipe('dashboard-operator');

    expect(screen.getByTestId('preview-premium-dashboard-metric-chart-01')).toBeInTheDocument();
    const recipePreview = screen.getByTestId('premium-recipe-preview');
    const selectedIds = recipePreview.getAttribute('data-premium-rendered-component-ids') ?? '';
    const selectedKpiId = selectedIds.split(',').find(id => id.startsWith('premium-dashboard-kpi-card-'));
    expect(selectedKpiId).toBeTruthy();
    expect(screen.getByTestId(`preview-${selectedKpiId}`)).toBeInTheDocument();

    const wrapper = screen.getByTestId(`premium-token-wrapper-${selectedKpiId}`);
    for (const token of [
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
    ]) {
      expect(wrapper.style.getPropertyValue(token)).not.toBe('');
    }
  });

  it('shows metadataOnly for a missing adapter instead of a fake generic preview', async () => {
    const realBank = PremiumComponentBankService.loadPremiumComponentBank();
    const patchedBank: PremiumComponentBank = {
      ...realBank,
      components: realBank.components.map(component =>
        component.kind === 'kpi' && component.compatibleSkeletons.includes('saas-dashboard')
          ? { ...component, Preview: undefined, previewMeta: undefined, metadataOnly: true }
          : component,
      ),
    };
    vi.spyOn(PremiumComponentBankService, 'loadPremiumComponentBank').mockReturnValue(patchedBank);

    const { container } = await renderLoaded();
    await expectPremiumRecipe('dashboard-operator');

    const metadataOnlyCard = container.querySelector('[data-testid^="premium-metadata-only-card-premium-dashboard-kpi-card"]');
    expect(metadataOnlyCard).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="preview-premium-dashboard-kpi-card"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('premium-layer-proof')).toHaveTextContent('metadataOnlyCount');
  });
});

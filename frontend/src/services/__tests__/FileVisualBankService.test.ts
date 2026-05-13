// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  loadFileVisualBank,
  resolveFileVisualSelection,
} from '../FileVisualBankService';
import { SKELETON_REGISTRY, type SkeletonId } from '../SkeletonRegistry';

describe('FileVisualBankService', () => {
  it('loads all domain visual packs and variants from prototype-bank files', () => {
    const bank = loadFileVisualBank();
    expect(bank.packs).toHaveLength(6);
    expect(bank.packs.reduce((sum, pack) => sum + pack.variants.length, 0)).toBe(48);

    for (const skeletonId of Object.keys(SKELETON_REGISTRY) as SkeletonId[]) {
      expect(
        bank.packs.some(pack => pack.compatibleSkeletons.includes(skeletonId)),
      ).toBe(true);
    }
  });

  it('normalizes missing fields with non-empty enriched values', () => {
    const bank = loadFileVisualBank();
    const mobile = bank.packs.find(pack => pack.packId === 'mobile-app');
    const calm = mobile?.variants.find(variant => variant.variantId === 'calm');

    expect(mobile?.compatibleSkeletons).toContain('mobile-app');
    expect(mobile?.domains.length).toBeGreaterThan(0);
    expect(mobile?.surfaces).toContain('bottom-tabs');
    expect(calm?.trustProfile).toBeTruthy();
    expect(calm?.toneProfile).toBeTruthy();
    expect(calm?.colorFamilies.length).toBeGreaterThan(0);
    expect(calm?.antiRepeatGroup).toContain('mobile-app:calm');
    expect(calm?.sourceFiles).toContain('prototype-bank/design-packs/domain/mobile-app/visual-variants/calm.json');
  });

  it('bridges semantic health domains into compatible visual packs and subdomains', () => {
    const selection = resolveFileVisualSelection({
      brief: 'clinical care team task board for patient follow ups',
      skeletonId: 'productivity-tool',
      projectId: 'visual-bank-test',
      semanticDomainId: 'medicine',
    });

    expect(selection.fallbackVisualSelection).toBe(false);
    expect(selection.selectedPackId).toBe('productivity-tool');
    expect(selection.subdomains).toContain('healthcare');
    expect(selection.selectedVariantPath).toMatch(/prototype-bank\/design-packs\/domain\/productivity-tool\/visual-variants\/.+\.json/);
  });

  it('keeps strong fintech briefs relevant while varying among semantic neighbors', () => {
    const selections = Array.from({ length: 12 }, (_, i) => resolveFileVisualSelection({
        brief: 'fintech dashboard',
        skeletonId: 'saas-dashboard',
        projectId: `fintech-${i}`,
    }));
    const variants = new Set(selections.map(selection => selection.selectedVariantId));

    for (const selection of selections) {
      const viable = selection.audit.viableByRelevance.map(candidate => candidate.variantId);
      expect(viable).toContain('fintech-corporate');
      expect(viable).toContain('premium-dark');
      expect(selection.audit.viableByRelevanceCount).toBeGreaterThanOrEqual(2);
      expect(selection.audit.relevanceWindow).toBe(12);
    }
    expect(variants.size).toBeGreaterThanOrEqual(2);
    expect([...variants].every(id => ['fintech-corporate', 'premium-dark', 'minimal-brutal', 'calm'].includes(id))).toBe(true);
    expect(variants.has('playful')).toBe(false);
    expect(variants.has('creator-social')).toBe(false);
  });

  it('keeps strong clinical briefs in a clinical neighbor pool', () => {
    const selections = Array.from({ length: 12 }, (_, i) => resolveFileVisualSelection({
      brief: 'clinical medical app',
      skeletonId: 'mobile-app',
      projectId: `clinical-${i}`,
    }));
    const variants = new Set(selections.map(selection => selection.selectedVariantId));

    for (const selection of selections) {
      const viable = selection.audit.viableByRelevance.map(candidate => candidate.variantId);
      expect(viable).toContain('clinical');
      expect(viable).toContain('calm');
      expect(selection.audit.viableByRelevanceCount).toBeGreaterThanOrEqual(2);
    }
    expect(variants.size).toBeGreaterThanOrEqual(2);
    expect([...variants].every(id => ['clinical', 'calm', 'premium-dark', 'mobile-soft'].includes(id))).toBe(true);
    expect(variants.has('fintech-corporate')).toBe(false);
  });

  it('keeps creator social briefs in a social neighbor pool', () => {
    const selections = Array.from({ length: 12 }, (_, i) => resolveFileVisualSelection({
      brief: 'creator social community',
      skeletonId: 'social-community',
      projectId: `social-${i}`,
    }));
    const variants = new Set(selections.map(selection => selection.selectedVariantId));

    for (const selection of selections) {
      const viable = selection.audit.viableByRelevance.map(candidate => candidate.variantId);
      expect(viable).toContain('playful');
      expect(viable).toContain('creator-social');
      expect(selection.audit.viableByRelevanceCount).toBeGreaterThanOrEqual(2);
    }
    expect(variants.size).toBeGreaterThanOrEqual(2);
    expect([...variants].every(id => ['creator-social', 'playful', 'mobile-soft', 'calm', 'premium-dark'].includes(id))).toBe(true);
    expect(variants.has('clinical')).toBe(false);
  });

  it('penalizes a recent repeated visual combination and selects a close neighbor', () => {
    const baseline = resolveFileVisualSelection({
      brief: 'fintech dashboard',
      skeletonId: 'saas-dashboard',
      projectId: 'anti-repeat-fixed',
    });
    const repeated = resolveFileVisualSelection({
      brief: 'fintech dashboard',
      skeletonId: 'saas-dashboard',
      projectId: 'anti-repeat-fixed',
      recentSelections: [{
        skeletonId: 'saas-dashboard',
        domain: 'saas-dashboard',
        semanticDomainId: 'fintech',
        selectedPackId: baseline.selectedPackId,
        selectedVariantId: baseline.selectedVariantId,
        antiRepeatGroup: baseline.antiRepeatGroup,
        colorFamily: baseline.colorFamily,
      }],
    });

    expect(repeated.audit.viableByRelevance.map(c => c.variantId)).toEqual(baseline.audit.viableByRelevance.map(c => c.variantId));
    expect(repeated.audit.viableCandidates.find(c => c.variantId === baseline.selectedVariantId)?.antiRepeatPenalty).toBeGreaterThan(0);
    expect(repeated.selectedVariantId).not.toBe(baseline.selectedVariantId);
    expect(['fintech-corporate', 'premium-dark', 'minimal-brutal', 'calm']).toContain(repeated.selectedVariantId);
  });
});

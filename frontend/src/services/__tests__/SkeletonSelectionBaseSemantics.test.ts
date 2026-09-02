import { describe, expect, it } from 'vitest';
import {
  selectSkeleton,
  selectSkeletonCanonical,
  selectSkeletonWithDiagnostics,
} from '../SkeletonRegistry';

describe('Skeleton canonical selection semantics', () => {
  it('resolves a single dashboard keyword through manifest selection despite a weak tag baseline', () => {
    expect(selectSkeleton('', ['admin'])).toBe('saas-dashboard');
    const diagnostics = selectSkeletonWithDiagnostics('', ['admin']);
    expect(diagnostics.baseSelectedSkeletonId).toBe('mobile-app');
    expect(diagnostics.selectedSkeletonId).toBe('saas-dashboard');
    expect(diagnostics.bestScore).toBe(1);
    expect(diagnostics.intentSignals).toContain('dashboard-intent');
  });

  it('retains baseline-vs-final telemetry without a second production selector', () => {
    const result = selectSkeletonCanonical('', ['admin']);
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.bestScore).toBe(1);
    expect(result.finalSelectedSkeletonId).toBe('saas-dashboard');
    expect(result.overrideApplied).toBe(true);
  });

  it('keeps strong landing relevance ahead of incidental dashboard vocabulary', () => {
    const prompt = 'Build a SaaS landing page with hero, pricing, testimonials, FAQ, enterprise table and social links';
    expect(selectSkeleton(prompt)).toBe('landing-page');
    expect(selectSkeletonCanonical(prompt).finalSelectedSkeletonId).toBe('landing-page');
  });
});

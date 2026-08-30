import { describe, expect, it } from 'vitest';
import {
  selectSkeleton,
  selectSkeletonWithDiagnostics,
  selectSkeletonWithSafeOverrides,
} from '../SkeletonRegistry';

describe('Skeleton selection base semantics', () => {
  it('keeps a single dashboard keyword below the legacy >=2 selection threshold', () => {
    expect(selectSkeleton('', ['admin'])).toBe('mobile-app');
    const diagnostics = selectSkeletonWithDiagnostics('', ['admin']);
    expect(diagnostics.selectedSkeletonId).toBe('mobile-app');
    expect(diagnostics.bestScore).toBe(1);
    expect(diagnostics.intentSignals).toContain('dashboard-intent');
  });

  it('lets manifest compatibility rescue a weak fallback without mutating base scoring', () => {
    const result = selectSkeletonWithSafeOverrides('', ['admin']);
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.bestScore).toBe(1);
    expect(result.finalSelectedSkeletonId).toBe('saas-dashboard');
    expect(result.overrideApplied).toBe(true);
  });

  it('keeps strong landing relevance ahead of incidental dashboard vocabulary', () => {
    const prompt = 'Build a SaaS landing page with hero, pricing, testimonials, FAQ, enterprise table and social links';
    expect(selectSkeleton(prompt)).toBe('landing-page');
    expect(selectSkeletonWithSafeOverrides(prompt).finalSelectedSkeletonId).toBe('landing-page');
  });
});

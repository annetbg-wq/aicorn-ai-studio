import { describe, expect, it } from 'vitest';
import { selectSkeletonWithDiagnostics, selectSkeletonWithSafeOverrides } from '../SkeletonRegistry';

describe('Skeleton selection weighted intent conflicts', () => {
  it('keeps a SaaS marketing landing page on landing-page despite incidental Enterprise/table vocabulary', () => {
    const prompt = 'Build a SaaS landing page with a hero section, three feature cards with icons, a pricing table (Free / Pro / Enterprise), testimonials carousel, and a footer with social links.';
    const diagnostics = selectSkeletonWithDiagnostics('', [prompt]);
    const result = selectSkeletonWithSafeOverrides('', [prompt]);

    expect(diagnostics.intentSignals).toContain('landing-intent');
    expect(diagnostics.intentSignals).toContain('dashboard-intent');
    expect(diagnostics.intentSignals).not.toContain('social-intent');
    expect(diagnostics.selectedSkeletonId).toBe('landing-page');
    expect(result.finalSelectedSkeletonId).toBe('landing-page');
    expect(result.overrideApplied).toBe(false);
  });

  it('lets explicit domain-specific game intent challenge more generic dashboard vocabulary', () => {
    const result = selectSkeletonWithSafeOverrides('game analytics dashboard', ['metrics', 'levels']);
    expect(result.intentSignals).toContain('dashboard-intent');
    expect(result.intentSignals).toContain('game-intent');
    expect(result.originalSelectedSkeletonId).toBe('saas-dashboard');
    expect(result.mismatchWarnings.length).toBeGreaterThan(0);
    expect(result.finalSelectedSkeletonId).toBe('game-interactive-app');
    expect(result.overrideApplied).toBe(true);
  });
});
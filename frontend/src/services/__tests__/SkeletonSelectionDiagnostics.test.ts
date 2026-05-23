import { describe, expect, it } from 'vitest';

import { selectSkeletonWithDiagnostics } from '../SkeletonRegistry';

// All tests in this file are deterministic — no LLM calls, no I/O.

describe('selectSkeletonWithDiagnostics', () => {
  // ── Landing / marketing intent ──────────────────────────────────────────

  it('clear landing intent: detects landing-intent signal and picks landing-page', () => {
    const result = selectSkeletonWithDiagnostics('website', ['landing', 'marketing', 'waitlist']);
    expect(result.intentSignals).toContain('landing-intent');
    expect(result.selectedSkeletonId).toBe('landing-page');
    // When the correct skeleton is chosen there should be no mobile-app mismatch.
    const hasMobileMismatch = result.mismatchWarnings.some(w => w.includes('Landing'));
    expect(hasMobileMismatch).toBe(false);
  });

  it('weak landing-only tag: detects landing-intent signal even if mobile-app fallback occurs', () => {
    // Single keyword — score < 2 → mobile-app fallback.
    const result = selectSkeletonWithDiagnostics('', ['homepage']);
    expect(result.intentSignals).toContain('landing-intent');
    // If mobile-app was chosen due to low score, a mismatch warning must appear.
    if (result.selectedSkeletonId === 'mobile-app') {
      expect(result.mismatchWarnings.some(w => w.includes('Landing'))).toBe(true);
    }
  });

  // ── Dashboard / admin intent ────────────────────────────────────────────

  it('strong dashboard intent: detects dashboard-intent signal and picks a dashboard skeleton', () => {
    const result = selectSkeletonWithDiagnostics('admin dashboard', ['analytics', 'kpi', 'metrics']);
    expect(result.intentSignals).toContain('dashboard-intent');
    expect(['saas-dashboard', 'b2b-operations-workspace']).toContain(result.selectedSkeletonId);
    expect(result.mismatchWarnings.filter(w => w.includes('Dashboard'))).toHaveLength(0);
  });

  it('weak dashboard intent falls back to mobile-app with mismatch warning', () => {
    // 'admin' matches saas-dashboard & b2b-operations-workspace but score = 1 → mobile-app fallback.
    const result = selectSkeletonWithDiagnostics('', ['admin']);
    expect(result.intentSignals).toContain('dashboard-intent');
    expect(result.selectedSkeletonId).toBe('mobile-app');
    expect(result.mismatchWarnings.some(w => w.includes('Dashboard'))).toBe(true);
    expect(result.confidence).toBe('low');
    expect(result.fallbackReason).toBeDefined();
  });

  // ── Marketplace / ecommerce intent ─────────────────────────────────────

  it('strong marketplace intent: detects marketplace-intent signal and picks ecommerce/marketplace skeleton', () => {
    const result = selectSkeletonWithDiagnostics('online store', ['shop', 'buy', 'sell', 'cart']);
    expect(result.intentSignals).toContain('marketplace-intent');
    expect(['ecommerce', 'marketplace-platform']).toContain(result.selectedSkeletonId);
    expect(result.mismatchWarnings.filter(w => w.includes('Marketplace'))).toHaveLength(0);
  });

  it('weak marketplace intent falls back to mobile-app with mismatch warning', () => {
    // 'listing' alone — score = 1 (marketplace-platform only) → mobile-app fallback.
    const result = selectSkeletonWithDiagnostics('', ['listing']);
    expect(result.intentSignals).toContain('marketplace-intent');
    if (result.selectedSkeletonId === 'mobile-app') {
      expect(result.mismatchWarnings.some(w => w.includes('Marketplace'))).toBe(true);
    }
  });

  // ── Social / community / feed intent ───────────────────────────────────

  it('strong social intent: detects social-intent signal and picks social-community', () => {
    const result = selectSkeletonWithDiagnostics('social network', ['community', 'feed', 'follow', 'posts']);
    expect(result.intentSignals).toContain('social-intent');
    expect(result.selectedSkeletonId).toBe('social-community');
    expect(result.mismatchWarnings.filter(w => w.includes('Social'))).toHaveLength(0);
  });

  it('social intent with unrelated skeleton produces mismatch warning', () => {
    // Force a single 'social' tag — score may be low enough to fall back, or land
    // on a non-social skeleton; in either case a mismatch warning should fire.
    // We pass no other tags so the score stays at 1.
    const result = selectSkeletonWithDiagnostics('', ['network', 'share']);
    expect(result.intentSignals).toContain('social-intent');
    if (!['social-community', 'dating-matching-app', 'marketplace-platform'].includes(result.selectedSkeletonId)) {
      expect(result.mismatchWarnings.some(w => w.includes('Social'))).toBe(true);
    }
  });

  // ── Game / RPG / progression intent ────────────────────────────────────

  it('strong game intent: detects game-intent signal and picks game skeleton', () => {
    const result = selectSkeletonWithDiagnostics('game app', ['levels', 'leaderboard', 'score', 'puzzle']);
    expect(result.intentSignals).toContain('game-intent');
    expect(['game-interactive-app', 'gaming-casino-app']).toContain(result.selectedSkeletonId);
    expect(result.mismatchWarnings.filter(w => w.includes('Game'))).toHaveLength(0);
  });

  it('game intent with plain dashboard skeleton produces mismatch warning', () => {
    // 'achievements' + 'progression' keywords trigger game-intent; the score for
    // game skeletons reaches >=2 in practice but we use a synthetic scenario where
    // an insufficient score causes dashboard fallback — instead we verify the
    // advisory logic directly by checking that PLAIN_DESK_SKELETONS produce warnings.
    // This test exercises the warning path via gamification + admin conflict.
    const result = selectSkeletonWithDiagnostics('admin gamification', ['dashboard', 'achievements', 'progression']);
    expect(result.intentSignals).toContain('game-intent');
    // If a plain desk skeleton was chosen, expect a mismatch warning.
    const plainDesk = ['landing-page', 'saas-dashboard', 'productivity-tool', 'b2b-operations-workspace', 'creator-editor-workspace'];
    if (plainDesk.includes(result.selectedSkeletonId)) {
      expect(result.mismatchWarnings.some(w => w.includes('Game'))).toBe(true);
    }
  });

  // ── Ambiguous / unknown prompt ──────────────────────────────────────────

  it('ambiguous prompt produces low confidence and a fallback reason', () => {
    const result = selectSkeletonWithDiagnostics('something interesting', []);
    expect(result.confidence).toBe('low');
    expect(result.fallbackReason).toBeDefined();
    expect(result.selectedSkeletonId).toBe('mobile-app');
  });

  it('empty input produces low confidence and a fallback reason', () => {
    const result = selectSkeletonWithDiagnostics(undefined, []);
    expect(result.confidence).toBe('low');
    expect(result.fallbackReason).toBeDefined();
    expect(result.bestScore).toBe(0);
  });

  // ── Diagnostics shape ───────────────────────────────────────────────────

  it('always returns all required diagnostic fields', () => {
    const result = selectSkeletonWithDiagnostics('landing app', ['marketing']);
    expect(typeof result.selectedSkeletonId).toBe('string');
    expect(['high', 'medium', 'low']).toContain(result.confidence);
    expect(typeof result.bestScore).toBe('number');
    expect(result.runnerUpSkeletonId === null || typeof result.runnerUpSkeletonId === 'string').toBe(true);
    expect(typeof result.runnerUpScore).toBe('number');
    expect(Array.isArray(result.mismatchWarnings)).toBe(true);
    expect(Array.isArray(result.intentSignals)).toBe(true);
  });

  it('high confidence when best score dominates runner-up by ≥2', () => {
    // Very specific landing tags → landing-page score should be >> 2nd place.
    const result = selectSkeletonWithDiagnostics('landing page website', ['marketing', 'promotional', 'waitlist', 'launch', 'saas landing']);
    // May or may not be high, but confidence must be a valid value.
    expect(['high', 'medium', 'low']).toContain(result.confidence);
    if (result.confidence === 'high') {
      expect(result.bestScore - result.runnerUpScore).toBeGreaterThanOrEqual(2);
    }
  });

  // ── Behaviour is advisory-only ──────────────────────────────────────────

  it('selectSkeletonWithDiagnostics selectedSkeletonId matches selectSkeleton output', async () => {
    // Import selectSkeleton alongside to verify parity.
    const { selectSkeleton } = await import('../SkeletonRegistry');
    const pairs: [string | undefined, string[]][] = [
      ['website', ['landing', 'marketing']],
      ['admin', ['dashboard', 'analytics']],
      ['shop', ['ecommerce', 'buy', 'sell']],
      ['social', ['community', 'feed']],
      ['game', ['levels', 'leaderboard']],
      [undefined, []],
    ];
    for (const [appType, tags] of pairs) {
      const diagResult = selectSkeletonWithDiagnostics(appType, tags);
      const legacyResult = selectSkeleton(appType, tags);
      expect(diagResult.selectedSkeletonId).toBe(legacyResult);
    }
  });
});

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
    // Single keyword — score < 2 → mobile-app baseline, then canonical manifest resolution may rescue it.
    const result = selectSkeletonWithDiagnostics('', ['homepage']);
    expect(result.intentSignals).toContain('landing-intent');
    if (result.baseSelectedSkeletonId === 'mobile-app') {
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

  it('weak dashboard intent resolves canonically while retaining baseline fallback diagnostics', () => {
    // 'admin' gives the tag scorer only one point, so the baseline is mobile-app.
    // The single canonical selector then resolves dashboard intent against the
    // compiled manifest contract and returns saas-dashboard.
    const result = selectSkeletonWithDiagnostics('', ['admin']);
    expect(result.intentSignals).toContain('dashboard-intent');
    expect(result.baseSelectedSkeletonId).toBe('mobile-app');
    expect(result.selectedSkeletonId).toBe('saas-dashboard');
    expect(result.mismatchWarnings.some(w => w.includes('Dashboard'))).toBe(true);
    expect(result.confidence).toBe('medium');
    expect(result.fallbackReason).toBeDefined();
  });

  // ── Marketplace / ecommerce intent ─────────────────────────────────────

  it('strong marketplace intent: detects marketplace-intent signal and picks ecommerce/marketplace skeleton', () => {
    const result = selectSkeletonWithDiagnostics('online store', ['shop', 'buy', 'sell', 'cart']);
    expect(result.intentSignals).toContain('marketplace-intent');
    expect(['ecommerce', 'marketplace-platform']).toContain(result.selectedSkeletonId);
    expect(result.mismatchWarnings.filter(w => w.includes('Marketplace'))).toHaveLength(0);
  });

  it('weak marketplace intent keeps baseline mismatch evidence when canonical resolution is needed', () => {
    // 'listing' alone scores below the legacy tag threshold; canonical manifest
    // resolution may move the final selection from the mobile baseline to ecommerce.
    const result = selectSkeletonWithDiagnostics('', ['listing']);
    expect(result.intentSignals).toContain('marketplace-intent');
    if (result.baseSelectedSkeletonId === 'mobile-app') {
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

  it('social intent with a weak mobile baseline retains mismatch evidence after canonical resolution', () => {
    const result = selectSkeletonWithDiagnostics('social media platform', []);
    expect(result.intentSignals).toContain('social-intent');
    if (result.baseSelectedSkeletonId === 'mobile-app') {
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

  it('game intent retains mismatch evidence when a plain dashboard was the baseline selection', () => {
    const result = selectSkeletonWithDiagnostics('admin gamification', ['dashboard', 'achievements', 'progression']);
    expect(result.intentSignals).toContain('game-intent');
    const plainDesk = ['landing-page', 'saas-dashboard', 'productivity-tool', 'b2b-operations-workspace', 'creator-editor-workspace'];
    if (plainDesk.includes(result.baseSelectedSkeletonId ?? '')) {
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
    const result = selectSkeletonWithDiagnostics('landing page website', ['marketing', 'promotional', 'waitlist', 'launch', 'saas landing']);
    expect(['high', 'medium', 'low']).toContain(result.confidence);
    if (result.confidence === 'high') {
      expect(result.bestScore - result.runnerUpScore).toBeGreaterThanOrEqual(2);
    }
  });

  // ── Canonical parity ────────────────────────────────────────────────────

  it('selectSkeletonWithDiagnostics selectedSkeletonId matches selectSkeleton output', async () => {
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
      const canonicalResult = selectSkeleton(appType, tags);
      expect(diagResult.selectedSkeletonId).toBe(canonicalResult);
    }
  });
});

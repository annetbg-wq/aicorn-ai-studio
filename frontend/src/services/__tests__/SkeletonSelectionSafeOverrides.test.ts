import { describe, expect, it } from 'vitest';

import { selectSkeletonWithSafeOverrides, selectSkeleton } from '../SkeletonRegistry';

// All tests are deterministic — no LLM calls, no I/O.

describe('selectSkeletonWithSafeOverrides', () => {
  // ── Landing intent override ─────────────────────────────────────────────

  it('landing intent with weak tags: overrides mobile-app fallback to landing-page', () => {
    // 'homepage' is an INTENT_SIGNAL_GROUPS keyword for landing but NOT a
    // landing-page registry tag → score=0 → mobile-app fallback.
    // Override should fire: landing-intent + mobile-app mismatch → landing-page.
    const result = selectSkeletonWithSafeOverrides('', ['homepage']);
    expect(result.intentSignals).toContain('landing-intent');
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.finalSelectedSkeletonId).toBe('landing-page');
    expect(result.overrideApplied).toBe(true);
    expect(result.overrideReason).toContain('landing-intent');
  });

  it('landing intent: promotional keyword overrides mobile-app fallback', () => {
    // 'promotional' IS a landing-page tag (score=1) but <2 → mobile-app fallback.
    const result = selectSkeletonWithSafeOverrides('promotional website', []);
    expect(result.intentSignals).toContain('landing-intent');
    if (result.originalSelectedSkeletonId === 'mobile-app') {
      expect(result.finalSelectedSkeletonId).toBe('landing-page');
      expect(result.overrideApplied).toBe(true);
    }
  });

  // ── Dashboard intent override ───────────────────────────────────────────

  it('dashboard intent with weak tags: overrides mobile-app fallback to saas-dashboard', () => {
    // 'analytics' is a saas-dashboard tag (score=1) and a dashboard-intent keyword.
    // score=1 < 2 → mobile-app fallback → override to saas-dashboard.
    const result = selectSkeletonWithSafeOverrides('', ['analytics']);
    expect(result.intentSignals).toContain('dashboard-intent');
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.finalSelectedSkeletonId).toBe('saas-dashboard');
    expect(result.overrideApplied).toBe(true);
    expect(result.overrideReason).toContain('dashboard-intent');
  });

  it('dashboard intent: admin keyword alone triggers override to saas-dashboard', () => {
    // 'admin' scores saas-dashboard=1, b2b-operations-workspace=1 → both <2 → mobile-app.
    const result = selectSkeletonWithSafeOverrides('', ['admin']);
    expect(result.intentSignals).toContain('dashboard-intent');
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.finalSelectedSkeletonId).toBe('saas-dashboard');
    expect(result.overrideApplied).toBe(true);
  });

  // ── Marketplace / ecommerce intent override ─────────────────────────────

  it('marketplace intent with weak tags: overrides mobile-app fallback to ecommerce', () => {
    // 'listing' is a marketplace-platform tag (score=1) and marketplace-intent keyword.
    // score=1 < 2 → mobile-app fallback → override to ecommerce.
    const result = selectSkeletonWithSafeOverrides('', ['listing']);
    expect(result.intentSignals).toContain('marketplace-intent');
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.finalSelectedSkeletonId).toBe('ecommerce');
    expect(result.overrideApplied).toBe(true);
    expect(result.overrideReason).toContain('marketplace-intent');
  });

  it('marketplace intent: vendor keyword triggers override to ecommerce', () => {
    // 'vendor' is a marketplace-intent keyword but not a high-scoring registry tag.
    const result = selectSkeletonWithSafeOverrides('online vendor', []);
    expect(result.intentSignals).toContain('marketplace-intent');
    if (result.originalSelectedSkeletonId === 'mobile-app') {
      expect(result.finalSelectedSkeletonId).toBe('ecommerce');
      expect(result.overrideApplied).toBe(true);
    }
  });

  // ── Social / community / feed intent override ───────────────────────────

  it('social intent with unrelated skeleton: overrides to social-community', () => {
    // 'network' and 'share' are social-intent keywords but not social-community tags.
    // social-community score=0 → mobile-app fallback; mobile-app not in SOCIAL_APPROPRIATE.
    const result = selectSkeletonWithSafeOverrides('', ['network', 'share']);
    expect(result.intentSignals).toContain('social-intent');
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.finalSelectedSkeletonId).toBe('social-community');
    expect(result.overrideApplied).toBe(true);
    expect(result.overrideReason).toContain('social-intent');
  });

  it('social intent: single community keyword triggers override to social-community', () => {
    // 'community' scores social-community=1 → mobile-app fallback → override.
    const result = selectSkeletonWithSafeOverrides('', ['community']);
    expect(result.intentSignals).toContain('social-intent');
    if (result.originalSelectedSkeletonId === 'mobile-app') {
      expect(result.finalSelectedSkeletonId).toBe('social-community');
      expect(result.overrideApplied).toBe(true);
    }
  });

  // ── Ambiguous prompt — no override ─────────────────────────────────────

  it('ambiguous prompt: no intent signals → no override', () => {
    const result = selectSkeletonWithSafeOverrides('something interesting', []);
    expect(result.intentSignals).toHaveLength(0);
    expect(result.overrideApplied).toBe(false);
    expect(result.finalSelectedSkeletonId).toBe(result.originalSelectedSkeletonId);
  });

  it('empty input: no intent signals → no override', () => {
    const result = selectSkeletonWithSafeOverrides(undefined, []);
    expect(result.intentSignals).toHaveLength(0);
    expect(result.overrideApplied).toBe(false);
    expect(result.finalSelectedSkeletonId).toBe(result.originalSelectedSkeletonId);
  });

  // ── Correct selection preserved (no override when no mismatch) ──────────

  it('strong social intent that already picks social-community: no override applied', () => {
    // Score ≥2 → selectSkeleton picks social-community → no mismatch warning.
    const result = selectSkeletonWithSafeOverrides('social network app', ['community', 'feed', 'posts']);
    expect(result.intentSignals).toContain('social-intent');
    expect(result.originalSelectedSkeletonId).toBe('social-community');
    expect(result.overrideApplied).toBe(false);
    expect(result.finalSelectedSkeletonId).toBe('social-community');
  });

  it('strong landing intent that already picks landing-page: no override applied', () => {
    const result = selectSkeletonWithSafeOverrides('website', ['landing', 'marketing', 'waitlist']);
    expect(result.originalSelectedSkeletonId).toBe('landing-page');
    expect(result.overrideApplied).toBe(false);
    expect(result.finalSelectedSkeletonId).toBe('landing-page');
  });

  it('strong dashboard intent that already picks saas-dashboard: no override applied', () => {
    const result = selectSkeletonWithSafeOverrides('admin dashboard', ['analytics', 'kpi', 'metrics']);
    expect(['saas-dashboard', 'b2b-operations-workspace']).toContain(result.originalSelectedSkeletonId);
    expect(result.overrideApplied).toBe(false);
    expect(result.finalSelectedSkeletonId).toBe(result.originalSelectedSkeletonId);
  });

  // ── Telemetry fields ────────────────────────────────────────────────────

  it('result always includes originalSelectedSkeletonId and finalSelectedSkeletonId', () => {
    const cases: [string | undefined, string[]][] = [
      ['homepage', []],
      ['analytics admin', []],
      ['shop marketplace', []],
      ['social community', []],
      ['something ambiguous', []],
      [undefined, []],
    ];
    for (const [appType, tags] of cases) {
      const result = selectSkeletonWithSafeOverrides(appType, tags);
      expect(typeof result.originalSelectedSkeletonId).toBe('string');
      expect(typeof result.finalSelectedSkeletonId).toBe('string');
      expect(typeof result.overrideApplied).toBe('boolean');
      expect(Array.isArray(result.intentSignals)).toBe(true);
      expect(Array.isArray(result.mismatchWarnings)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(result.confidence);
    }
  });

  it('when override is applied, overrideReason is provided', () => {
    const result = selectSkeletonWithSafeOverrides('', ['analytics']);
    if (result.overrideApplied) {
      expect(typeof result.overrideReason).toBe('string');
      expect((result.overrideReason?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it('when override is applied, originalSelectedSkeletonId differs from finalSelectedSkeletonId', () => {
    const result = selectSkeletonWithSafeOverrides('', ['analytics']);
    if (result.overrideApplied) {
      expect(result.originalSelectedSkeletonId).not.toBe(result.finalSelectedSkeletonId);
    }
  });

  // ── Parity: finalSelectedSkeletonId matches selectSkeleton when no override ──

  it('without override, finalSelectedSkeletonId matches legacy selectSkeleton output', () => {
    // Strong inputs where selectSkeleton already picks the right skeleton.
    const pairs: [string | undefined, string[]][] = [
      ['social app', ['community', 'feed', 'posts']],
      ['website', ['landing', 'marketing', 'waitlist']],
      ['admin', ['dashboard', 'analytics', 'kpi']],
      [undefined, []],
      ['something random', []],
    ];
    for (const [appType, tags] of pairs) {
      const result = selectSkeletonWithSafeOverrides(appType, tags);
      if (!result.overrideApplied) {
        expect(result.finalSelectedSkeletonId).toBe(selectSkeleton(appType, tags));
      }
    }
  });

  // ── Game intent override ────────────────────────────────────────────────

  it('game intent with dominant dashboard keywords: overrides to game-interactive-app', () => {
    // Dashboard keywords score saas-dashboard ≥2 → selectSkeleton picks saas-dashboard.
    // But game-intent is also detected → PLAIN_DESK_SKELETONS mismatch → override.
    const result = selectSkeletonWithSafeOverrides('game analytics dashboard', ['dashboard', 'metrics', 'game', 'levels']);
    expect(result.intentSignals).toContain('game-intent');
    if (result.originalSelectedSkeletonId === 'saas-dashboard') {
      expect(result.finalSelectedSkeletonId).toBe('game-interactive-app');
      expect(result.overrideApplied).toBe(true);
    }
  });
});

// @vitest-environment jsdom
/**
 * ScreenCompositionDiagnostics — deterministic advisory-only diagnostics tests.
 *
 * All tests use hand-crafted ScreenCompositionPlan fixtures (no LLM calls).
 * Advisory diagnostics must never block generation.
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateScreenCompositionDiagnostics,
  type ScreenCompositionPlan,
  type ScreenCompositionEntry,
  type ScreenCompositionZone,
} from '../ScreenCompositionPlanner';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function zone(
  id: string,
  role: ScreenCompositionZone['role'],
  priority: ScreenCompositionZone['priority'] = 'primary',
): ScreenCompositionZone {
  return { id, role, priority, intent: id, suggestedComponents: [], suggestedMedia: [], interactions: [], contentRules: [] };
}

function screen(
  id: string,
  role: ScreenCompositionEntry['role'],
  priority: ScreenCompositionEntry['priority'],
  zones: ScreenCompositionZone[],
): ScreenCompositionEntry {
  return {
    id, title: id, role, priority,
    layoutIntent: id,
    zones,
    premiumComponentTargets: [], mediaTargets: [],
    requiredInteractions: [], stateRequirements: [], contentRequirements: [],
  };
}

function plan(
  skeletonId: string,
  screens: ScreenCompositionEntry[],
  firstScreenId: string,
): ScreenCompositionPlan {
  return {
    skeletonId, firstScreenId, screens,
    globalLayoutRules: [], avoidPatterns: [], compositionNotes: [],
  };
}

// ── Strong composition passes ─────────────────────────────────────────────────

describe('evaluateScreenCompositionDiagnostics — strong composition passes', () => {
  it('passes for a well-formed mobile-app plan', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('status-z', 'status'),
        zone('action-z', 'primary_action'),
        zone('progress-z', 'progress'),
        zone('nav-z', 'navigation'),
      ]),
      screen('progress', 'progress', 'secondary', [
        zone('insight-z', 'insight'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('content-z', 'feed'),
      ]),
      screen('profile', 'profile', 'supporting', [
        zone('profile-z', 'status'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.ok).toBe(true);
    expect(result.compositionScore).toBe(100);
    expect(result.warnings).toHaveLength(0);
    expect(result.missingRoles).toHaveLength(0);
  });

  it('passes for a well-formed saas-dashboard plan', () => {
    const p = plan('saas-dashboard', [
      screen('dashboard', 'dashboard', 'primary', [
        zone('nav-z', 'navigation'),
        zone('kpi-z', 'status'),
        zone('insight-z', 'insight'),
        zone('list-z', 'list'),
        zone('action-z', 'primary_action'),
      ]),
      screen('workspace', 'other', 'secondary', [
        zone('table-z', 'table'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('form-z', 'form'),
      ]),
    ], 'dashboard');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.ok).toBe(true);
    expect(result.compositionScore).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it('passes for a well-formed landing-page plan', () => {
    const p = plan('landing-page', [
      screen('hero', 'home', 'primary', [
        zone('hero-z', 'hero'),
        zone('cta-z', 'cta'),
      ]),
      screen('features', 'other', 'secondary', [
        zone('list-z', 'list'),
      ]),
      screen('cta-section', 'other', 'secondary', [
        zone('cta2-z', 'cta'),
      ]),
    ], 'hero');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.ok).toBe(true);
    expect(result.compositionScore).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });
});

// ── Sparse composition warns ──────────────────────────────────────────────────

describe('evaluateScreenCompositionDiagnostics — sparse composition warns', () => {
  it('warns for a one-screen mobile-app plan', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('action-z', 'primary_action'),
        zone('progress-z', 'progress'),
        zone('nav-z', 'navigation'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.ok).toBe(false);
    expect(result.warnings.some(w => w.includes('Sparse composition'))).toBe(true);
    expect(result.missingRoles).toContain('sufficient-screens');
    expect(result.compositionScore).toBeLessThan(100);
  });

  it('warns for a two-screen saas-dashboard plan', () => {
    const p = plan('saas-dashboard', [
      screen('dashboard', 'dashboard', 'primary', [
        zone('kpi-z', 'status'),
        zone('list-z', 'list'),
      ]),
      screen('settings', 'settings', 'supporting', [
        zone('form-z', 'form'),
      ]),
    ], 'dashboard');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.ok).toBe(false);
    expect(result.warnings.some(w => w.includes('Sparse composition'))).toBe(true);
    expect(result.compositionScore).toBeLessThan(100);
  });

  it('does NOT warn for landing-page with one screen (single-page is fine)', () => {
    const p = plan('landing-page', [
      screen('hero', 'home', 'primary', [
        zone('hero-z', 'hero'),
        zone('cta-z', 'cta'),
      ]),
    ], 'hero');

    const result = evaluateScreenCompositionDiagnostics(p);
    const sparseWarnings = result.warnings.filter(w => w.includes('Sparse composition'));
    expect(sparseWarnings).toHaveLength(0);
  });
});

// ── Missing CTA warns ─────────────────────────────────────────────────────────

describe('evaluateScreenCompositionDiagnostics — missing CTA warns', () => {
  it('warns when no primary_action or cta zone exists', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('status-z', 'status'),
        zone('nav-z', 'navigation'),
        zone('progress-z', 'progress'),
      ]),
      screen('progress', 'progress', 'secondary', [
        zone('insight-z', 'insight'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('feed-z', 'feed'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.ok).toBe(false);
    expect(result.warnings.some(w => w.includes('Missing primary_action or cta'))).toBe(true);
    expect(result.missingRoles).toContain('primary-action-cta');
  });

  it('does not warn when cta zone exists (landing-page)', () => {
    const p = plan('landing-page', [
      screen('hero', 'home', 'primary', [
        zone('hero-z', 'hero'),
        zone('cta-z', 'cta'),
      ]),
    ], 'hero');

    const result = evaluateScreenCompositionDiagnostics(p);
    const ctaWarnings = result.warnings.filter(w => w.includes('primary_action or cta'));
    expect(ctaWarnings).toHaveLength(0);
  });
});

// ── Generic cards warn ────────────────────────────────────────────────────────

describe('evaluateScreenCompositionDiagnostics — generic cards warn', () => {
  it('warns when > 50% of zones are other or secondary_feature', () => {
    const p = plan('productivity-tool', [
      screen('main', 'home', 'primary', [
        zone('a', 'other'),
        zone('b', 'secondary_feature'),
        zone('c', 'other'),
        zone('d', 'primary_action'),
      ]),
      screen('secondary', 'other', 'secondary', [
        zone('e', 'secondary_feature'),
        zone('f', 'other'),
        zone('g', 'navigation'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('h', 'other'),
      ]),
    ], 'main');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('Generic zone overload'))).toBe(true);
    expect(result.missingRoles).toContain('specific-zone-roles');
    expect(result.compositionScore).toBeLessThan(100);
  });

  it('does not warn when generic zones are minority', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('status-z', 'status'),
        zone('action-z', 'primary_action'),
        zone('progress-z', 'progress'),
        zone('insight-z', 'insight'),
        zone('nav-z', 'navigation'),
        zone('other-z', 'other'),
      ]),
      screen('progress', 'progress', 'secondary', [
        zone('insight-z2', 'insight'),
        zone('feed-z', 'feed'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('form-z', 'form'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    const genericWarnings = result.warnings.filter(w => w.includes('Generic zone overload'));
    expect(genericWarnings).toHaveLength(0);
  });
});

// ── Dashboard without metrics warns ──────────────────────────────────────────

describe('evaluateScreenCompositionDiagnostics — dashboard without metrics warns', () => {
  it('warns for saas-dashboard first screen with no status or insight zones', () => {
    const p = plan('saas-dashboard', [
      screen('dashboard', 'dashboard', 'primary', [
        zone('nav-z', 'navigation'),
        zone('list-z', 'list'),
        zone('action-z', 'primary_action'),
        // No status, no insight
      ]),
      screen('workspace', 'other', 'secondary', [
        zone('table-z', 'table'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('form-z', 'form'),
      ]),
    ], 'dashboard');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing metrics/status zones'))).toBe(true);
    expect(result.missingRoles).toContain('dashboard-metrics-status');
  });

  it('warns for b2b-operations-workspace first screen with no list/table/action zones', () => {
    const p = plan('b2b-operations-workspace', [
      screen('dashboard', 'dashboard', 'primary', [
        zone('nav-z', 'navigation'),
        zone('status-z', 'status'),
        zone('insight-z', 'insight'),
        // No list, table, primary_action
      ]),
      screen('records', 'other', 'secondary', [
        zone('table-z', 'table'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('form-z', 'form'),
      ]),
    ], 'dashboard');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing action/list/table zones'))).toBe(true);
    expect(result.missingRoles).toContain('dashboard-action-list');
  });

  it('does not warn for a fully-equipped dashboard first screen', () => {
    const p = plan('saas-dashboard', [
      screen('dashboard', 'dashboard', 'primary', [
        zone('nav-z', 'navigation'),
        zone('kpi-z', 'status'),
        zone('insight-z', 'insight'),
        zone('list-z', 'list'),
        zone('action-z', 'primary_action'),
      ]),
      screen('workspace', 'other', 'secondary', [
        zone('table-z', 'table'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('form-z', 'form'),
      ]),
    ], 'dashboard');

    const result = evaluateScreenCompositionDiagnostics(p);
    const dashMetricsWarnings = result.warnings.filter(w => w.includes('missing metrics/status'));
    const dashActionWarnings = result.warnings.filter(w => w.includes('missing action/list/table'));
    expect(dashMetricsWarnings).toHaveLength(0);
    expect(dashActionWarnings).toHaveLength(0);
  });
});

// ── Mobile app without home/action/detail-like roles warns ───────────────────

describe('evaluateScreenCompositionDiagnostics — mobile app missing roles warns', () => {
  it('warns when mobile-app has no home/today screen', () => {
    const p = plan('mobile-app', [
      screen('progress', 'progress', 'primary', [
        zone('insight-z', 'insight'),
        zone('action-z', 'primary_action'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('feed-z', 'feed'),
      ]),
      screen('profile', 'profile', 'supporting', [
        zone('status-z', 'status'),
      ]),
    ], 'progress');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing a home/today entry screen'))).toBe(true);
    expect(result.missingRoles).toContain('mobile-home-screen');
  });

  it('warns when mobile-app has no progress or insight screen/zone', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('status-z', 'status'),
        zone('action-z', 'primary_action'),
        zone('nav-z', 'navigation'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('feed-z', 'feed'),
      ]),
      screen('profile', 'profile', 'supporting', [
        zone('settings-z', 'secondary_feature'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing progress or insight'))).toBe(true);
    expect(result.missingRoles).toContain('mobile-progress-insight');
  });

  it('warns when mobile-app has no detail screen', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('action-z', 'primary_action'),
        zone('progress-z', 'progress'),
        zone('nav-z', 'navigation'),
      ]),
      screen('progress', 'progress', 'secondary', [
        zone('insight-z', 'insight'),
      ]),
      screen('profile', 'profile', 'supporting', [
        zone('status-z', 'status'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing a detail screen'))).toBe(true);
    expect(result.missingRoles).toContain('mobile-detail-screen');
  });

  it('warns when mobile-app has no primary_action zone', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('status-z', 'status'),
        zone('progress-z', 'progress'),
        zone('nav-z', 'navigation'),
      ]),
      screen('progress', 'progress', 'secondary', [
        zone('insight-z', 'insight'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('feed-z', 'feed'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing a primary_action zone'))).toBe(true);
    expect(result.missingRoles).toContain('mobile-primary-action-zone');
  });
});

// ── Social/feed app without feed/profile/community roles warns ────────────────

describe('evaluateScreenCompositionDiagnostics — social/feed app missing roles warns', () => {
  it('warns when social-community has no feed zone or feed screen', () => {
    const p = plan('social-community', [
      screen('home', 'home', 'primary', [
        zone('hero-z', 'hero'),
        zone('action-z', 'primary_action'),
        zone('nav-z', 'navigation'),
      ]),
      screen('profile', 'profile', 'secondary', [
        zone('status-z', 'status'),
      ]),
      screen('explore', 'other', 'secondary', [
        zone('list-z', 'list'),
      ]),
    ], 'home');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing a feed zone or feed screen'))).toBe(true);
    expect(result.missingRoles).toContain('social-feed');
  });

  it('warns when social-community has no profile screen', () => {
    const p = plan('social-community', [
      screen('home-feed', 'feed', 'primary', [
        zone('feed-z', 'feed'),
        zone('action-z', 'primary_action'),
        zone('nav-z', 'navigation'),
      ]),
      screen('explore', 'other', 'secondary', [
        zone('list-z', 'list'),
      ]),
      screen('settings', 'settings', 'supporting', [
        zone('form-z', 'form'),
      ]),
    ], 'home-feed');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing a profile screen'))).toBe(true);
    expect(result.missingRoles).toContain('social-profile');
  });

  it('warns when social-community has no community/explore/discover screen', () => {
    const p = plan('social-community', [
      screen('home-feed', 'feed', 'primary', [
        zone('feed-z', 'feed'),
        zone('action-z', 'primary_action'),
        zone('nav-z', 'navigation'),
      ]),
      screen('profile', 'profile', 'secondary', [
        zone('status-z', 'status'),
      ]),
      screen('settings', 'settings', 'supporting', [
        zone('form-z', 'form'),
      ]),
    ], 'home-feed');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.warnings.some(w => w.includes('missing community/explore/discover screens'))).toBe(true);
    expect(result.missingRoles).toContain('social-community-discovery');
  });

  it('passes for a fully-equipped social-community plan', () => {
    const p = plan('social-community', [
      screen('home-feed', 'feed', 'primary', [
        zone('feed-z', 'feed'),
        zone('action-z', 'primary_action'),
        zone('nav-z', 'navigation'),
      ]),
      screen('profile', 'profile', 'secondary', [
        zone('status-z', 'status'),
      ]),
      screen('explore', 'other', 'secondary', [
        zone('list-z', 'list'),
      ]),
    ], 'home-feed');

    const result = evaluateScreenCompositionDiagnostics(p);
    const socialWarnings = result.warnings.filter(w =>
      w.includes('Social/community app'),
    );
    expect(socialWarnings).toHaveLength(0);
  });
});

// ── Advisory diagnostics do not block ────────────────────────────────────────

describe('evaluateScreenCompositionDiagnostics — advisory, does not block', () => {
  it('returns ok=false for weak composition but result itself is a plain value (no throw)', () => {
    const p = plan('mobile-app', [
      screen('main', 'other', 'primary', [
        zone('only-z', 'other'),
      ]),
    ], 'main');

    let result: ReturnType<typeof evaluateScreenCompositionDiagnostics> | undefined;
    expect(() => {
      result = evaluateScreenCompositionDiagnostics(p);
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result!.ok).toBe(false);
    expect(result!.warnings.length).toBeGreaterThan(0);
    // Score is clamped to [0, 100]
    expect(result!.compositionScore).toBeGreaterThanOrEqual(0);
    expect(result!.compositionScore).toBeLessThanOrEqual(100);
  });

  it('includes telemetry sub-object with all required fields', () => {
    const p = plan('saas-dashboard', [
      screen('dashboard', 'dashboard', 'primary', [
        zone('kpi-z', 'status'),
        zone('list-z', 'list'),
        zone('action-z', 'primary_action'),
      ]),
      screen('workspace', 'other', 'secondary', [
        zone('table-z', 'table'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('form-z', 'form'),
      ]),
    ], 'dashboard');

    const result = evaluateScreenCompositionDiagnostics(p);

    expect(result.telemetry).toBeDefined();
    expect(result.telemetry.skeleton_id).toBe('saas-dashboard');
    expect(typeof result.telemetry.screen_count).toBe('number');
    expect(Array.isArray(result.telemetry.detected_roles)).toBe(true);
    expect(Array.isArray(result.telemetry.missing_roles)).toBe(true);
    expect(Array.isArray(result.telemetry.warnings)).toBe(true);
    expect(Array.isArray(result.telemetry.suggested_improvements)).toBe(true);
    expect(typeof result.telemetry.composition_score).toBe('number');
    expect(typeof result.telemetry.ok).toBe('boolean');
  });

  it('detectedRoles contains actual roles from the plan', () => {
    const p = plan('mobile-app', [
      screen('home-today', 'home', 'primary', [
        zone('action-z', 'primary_action'),
        zone('progress-z', 'progress'),
        zone('nav-z', 'navigation'),
      ]),
      screen('progress-screen', 'progress', 'secondary', [
        zone('insight-z', 'insight'),
      ]),
      screen('detail', 'detail', 'secondary', [
        zone('feed-z', 'feed'),
      ]),
    ], 'home-today');

    const result = evaluateScreenCompositionDiagnostics(p);

    expect(result.detectedRoles).toContain('primary_action');
    expect(result.detectedRoles).toContain('progress');
    expect(result.detectedRoles).toContain('navigation');
    expect(result.detectedRoles).toContain('home');
    expect(result.detectedRoles).toContain('detail');
  });

  it('score is clamped between 0 and 100 for maximally broken plans', () => {
    // A plan designed to trigger every mobile warning
    const p = plan('mobile-app', [
      screen('junk', 'other', 'primary', [
        zone('z1', 'other'),
        zone('z2', 'other'),
        zone('z3', 'other'),
        zone('z4', 'other'),
        zone('z5', 'other'),
        zone('z6', 'secondary_feature'),
      ]),
    ], 'junk');

    const result = evaluateScreenCompositionDiagnostics(p);
    expect(result.compositionScore).toBeGreaterThanOrEqual(0);
    expect(result.compositionScore).toBeLessThanOrEqual(100);
    expect(result.ok).toBe(false);
  });
});

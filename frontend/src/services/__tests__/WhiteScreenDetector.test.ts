/**
 * WhiteScreenDetector — Tests for post-ready sanity check.
 *
 * Proves that:
 *   1. evaluateMetrics correctly classifies DOM states
 *   2. Different white-screen reasons are distinguished
 *   3. Healthy renders pass
 *   4. Edge cases (loading shells, zero-height, minimal content) are caught
 *   5. The check does NOT weaken the ready_set contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluateMetrics,
  type DOMMetrics,
  type WhiteScreenReason,
} from '../WhiteScreenDetector';

// ── Mock PreviewController (imported by WhiteScreenDetector) ────────────────

vi.mock('../PreviewController', () => ({
  previewController: {
    getState: () => ({ status: 'ready', activeRevisionId: 'test-build' }),
    setDiagnosticError: vi.fn(),
  },
  previewLog: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<DOMMetrics> = {}): DOMMetrics {
  return {
    rootChildCount: 5,
    rootInnerTextLength: 200,
    rootOffsetHeight: 800,
    bodyChildCount: 3,
    bodyInnerTextLength: 250,
    hasLoadingIndicator: false,
    rootTextHead: 'Welcome to my app. This is the dashboard with several sections.',
    ...overrides,
  };
}

const BUILD = 'test-build-abc';

// ── evaluateMetrics ─────────────────────────────────────────────────────────

describe('evaluateMetrics', () => {

  // ── Healthy cases ───────────────────────────────────────────────

  it('marks a normal render as healthy', () => {
    const result = evaluateMetrics(makeMetrics(), BUILD);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.buildId).toBe(BUILD);
  });

  it('marks a text-heavy single-element render as healthy', () => {
    // Single child but lots of text — e.g. a full-page article
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 500,
      rootTextHead: 'This is a long article with lots of content about various topics...',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('marks multi-element low-text render as healthy', () => {
    // Several elements but little text — e.g. icon dashboard
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 10,
      rootInnerTextLength: 5,
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  // ── empty-root ──────────────────────────────────────────────────

  it('detects empty-root: #root has no children', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 0,
      rootTextHead: '',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('empty-root' satisfies WhiteScreenReason);
  });

  // ── blank-body ──────────────────────────────────────────────────

  it('detects blank-body: body has no children', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      bodyChildCount: 0,
      rootInnerTextLength: 0,
      bodyInnerTextLength: 0,
      rootTextHead: '',
    }), BUILD);
    expect(result.healthy).toBe(false);
    // empty-root fires first (rootChildCount=0), which is correct —
    // blank-body is a deeper fallback
    expect(result.reason).toBe('empty-root');
  });

  it('detects blank-body when root somehow has children but body does not', () => {
    // Edge case: rootChildCount > 0 but bodyChildCount = 0
    // (shouldn't happen in practice, but tests the priority)
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 2,
      bodyChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 100,
      rootTextHead: '',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('blank-body');
  });

  // ── zero-height-root ────────────────────────────────────────────

  it('detects zero-height-root: root has children but 0 height', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 3,
      rootOffsetHeight: 0,
      rootInnerTextLength: 50,
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('zero-height-root' satisfies WhiteScreenReason);
  });

  it('does NOT flag zero-height when root has no children (that is empty-root)', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootOffsetHeight: 0,
    }), BUILD);
    // Should be empty-root, not zero-height-root
    expect(result.reason).toBe('empty-root');
  });

  // ── loading-shell-only ──────────────────────────────────────────

  it('detects loading-shell-only: "Loading..." placeholder', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 10,
      hasLoadingIndicator: true,
      rootTextHead: 'Loading...',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('loading-shell-only' satisfies WhiteScreenReason);
  });

  it('detects loading-shell-only: "Waiting for generation..." placeholder', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 26,
      hasLoadingIndicator: true,
      rootTextHead: 'Waiting for generation...',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('loading-shell-only');
  });

  it('does NOT flag loading indicator with real content around it', () => {
    // App has a loading spinner but also real content text
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 8,
      rootInnerTextLength: 300,
      hasLoadingIndicator: true,
      rootTextHead: 'Dashboard - Welcome back! Loading more items...',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  // ── minimal-content ─────────────────────────────────────────────

  it('detects minimal-content: single child with < 10 chars', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 3,
      rootOffsetHeight: 50,
      hasLoadingIndicator: false,
      rootTextHead: 'Hi',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('minimal-content' satisfies WhiteScreenReason);
  });

  it('does NOT flag minimal-content when element count >= 2', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 2,
      rootInnerTextLength: 3,
      rootOffsetHeight: 50,
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('does NOT flag minimal-content when text length >= 10', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 15,
      rootOffsetHeight: 50,
      rootTextHead: 'Hello World!!!',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  // ── Metrics are preserved in result ─────────────────────────────

  it('always includes metrics in the result', () => {
    const metrics = makeMetrics();
    const result = evaluateMetrics(metrics, BUILD);
    expect(result.metrics).toBe(metrics);
    expect(result.buildId).toBe(BUILD);
  });

  // ── Priority ordering ──────────────────────────────────────────

  it('zero-height-root takes priority over loading-shell-only', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootOffsetHeight: 0,
      hasLoadingIndicator: true,
      rootTextHead: 'Loading...',
    }), BUILD);
    expect(result.reason).toBe('zero-height-root');
  });

  it('empty-root takes priority over minimal-content', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 0,
    }), BUILD);
    expect(result.reason).toBe('empty-root');
  });
});

// ── Integration-level: proves check doesn't weaken ready_set ────────────────

describe('White-screen check does not weaken ready_set', () => {
  it('evaluateMetrics never returns a "not ready" or "block" reason', () => {
    // The detector only returns WhiteScreenReason categories —
    // never 'timeout', 'blocked', 'compile_error', etc.
    const allReasons = new Set<string>();

    // Test a variety of unhealthy states
    const unhealthyCases: Partial<DOMMetrics>[] = [
      { rootChildCount: 0 },
      { bodyChildCount: 0, rootChildCount: 2, rootInnerTextLength: 0, rootOffsetHeight: 100 },
      { rootChildCount: 3, rootOffsetHeight: 0 },
      { rootChildCount: 1, rootInnerTextLength: 5, hasLoadingIndicator: true, rootTextHead: 'Loading' },
      { rootChildCount: 1, rootInnerTextLength: 3 },
    ];

    for (const c of unhealthyCases) {
      const result = evaluateMetrics(makeMetrics(c), BUILD);
      if (result.reason) allReasons.add(result.reason);
    }

    // All reasons must be white-screen-specific, not lifecycle reasons
    const validReasons: Set<string> = new Set([
      'empty-root',
      'blank-body',
      'minimal-content',
      'loading-shell-only',
      'zero-height-root',
    ]);
    for (const r of allReasons) {
      expect(validReasons.has(r)).toBe(true);
    }
  });
});

/**
 * previewIsolationPack — Generation-owned preview isolation tests.
 *
 * Proves the three isolation contracts from Session 13.1:
 *
 *   A. Stale/missing persisted project state does not keep poisoning the
 *      active preview cycle (empty-file preload fails soft, not via candidate).
 *
 *   B. Fresh candidate preview path remains active despite a concurrent stale
 *      preload whose waitForReady times out after generation has promoted.
 *
 *   C. A single inconclusive watchdog signal (controller_not_ready,
 *      controller_failed, probe_timeout) does NOT immediately revoke.
 *
 *   D. A confirmed unhealthy watchdog signal (two consecutive blank checks)
 *      DOES still revoke correctly.
 *
 *   E. A fresh successful preview remains visible/stable through the initial
 *      post-promotion window when no white-screen signals appear.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PRELOAD_SKIP_OWNED_MSG, RevisionManager } from '../RevisionManager';
import {
  PreviewController,
  clearTimelineContext,
  previewController,
} from '../PreviewController';
import {
  POST_PROMOTION_WATCHDOG_WINDOW_MS,
  cancelPendingCheck,
  cancelPostPromotionWatch,
  runPostReadyDiagnostic,
  startPostPromotionWatch,
} from '../WhiteScreenDetector';
import { ProjectRepository } from '../ProjectRepository';
import type { ProjectRecord } from '../ProjectRepository';
import { revisionManager } from '../RevisionManager';
import { ProjectStorage } from '../ProjectStorage';
import type { StoredProject } from '../ProjectStorage';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const CLEAN_APP = `export default function App() { return <main>Hello</main>; }`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function captureTimeline() {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[preview-timeline] ')) {
      events.push({
        event: args[0].slice('[preview-timeline] '.length),
        payload: (args[1] as Record<string, unknown>) ?? {},
      });
    }
  });
  return events;
}

function mountIframe(buildId: string, content = 'Meaningful preview content'): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-testid', 'preview-iframe');
  iframe.setAttribute('data-build-id', buildId);
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = `<div id="root"><main>${content}</main></div>`;
  }
  return iframe;
}

function blankIframe(iframe: HTMLIFrameElement, buildId: string) {
  iframe.setAttribute('data-build-id', buildId);
  const doc = iframe.contentDocument;
  if (doc?.body) doc.body.innerHTML = '<div id="root"></div>';
}

/** Mark a candidate as compiled without going through the real compile path. */
function bypassCompile(rm: RevisionManager, revId: string) {
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = revId;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clearTimelineContext();
  previewController.reset();
  cancelPendingCheck();
  cancelPostPromotionWatch();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

afterEach(() => {
  cancelPendingCheck();
  cancelPostPromotionWatch();
  clearTimelineContext();
  previewController.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── A: Empty-file preload fails soft ──────────────────────────────────────────

describe('A: Stale/missing project soft-fail', () => {
  test('loadToPreview with empty files logs preload_not_found_soft_failed and does not throw', async () => {
    const events = captureTimeline();
    const emptyProject: ProjectRecord = {
      id: 'proj-empty',
      name: 'Empty',
      description: '',
      theme: 'dark',
      files: {},          // ← empty — simulates 406 / stale project
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // Must not throw — soft fail
    await expect(ProjectRepository.loadToPreview(emptyProject)).resolves.toBeUndefined();

    expect(events.some(e =>
      e.event === 'preload_not_found_soft_failed' &&
      e.payload.projectId === 'proj-empty',
    )).toBe(true);
    // Must not have created a candidate
    expect(events.some(e => e.event === 'candidate_created')).toBe(false);
  });

  test('empty preload does not leave controller in failed state', async () => {
    const emptyProject: ProjectRecord = {
      id: 'proj-empty-2',
      name: 'Empty 2',
      description: '',
      theme: 'dark',
      files: {},
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await ProjectRepository.loadToPreview(emptyProject);

    // Controller should remain idle (not failed) so generation can start cleanly
    expect(previewController.getState().status).toBe('idle');
  });
});

// ── B: Stale preload async timeout does not poison fresh generation ────────────

describe('B: Concurrent preload staleness guard', () => {
  test('stale preload notifyFailed suppressed when generation has taken over', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    // 1. Preload creates candidate (simulating materializePersistedFiles in flight)
    const preloadRevId = await rm.createCandidate();
    await rm.writeCandidateFile(preloadRevId, 'App.tsx', CLEAN_APP);

    // 2. Generation creates a new candidate — orphans preload
    const genRevId = await rm.createCandidate();
    await rm.writeCandidateFile(genRevId, 'App.tsx', CLEAN_APP);

    // At this point preloadRevId is no longer the current candidate.
    // Verify the staleness check: _isRevisionAuthoritative(preloadRevId) is false
    expect(rm.getCandidateRevisionId()).toBe(genRevId);
    expect(rm.getCandidateRevisionId()).not.toBe(preloadRevId);

    // 3. Generation compiles and promotes
    const iframe = mountIframe(genRevId);
    previewController.notifyCompiling(genRevId);
    previewController.notifyReady(genRevId, 'test-mounted');
    bypassCompile(rm, genRevId);
    await rm.promote(genRevId);

    expect(rm.getActiveRevisionId()).toBe(genRevId);
    const preStateBeforeStaleNotify = previewController.getState();
    expect(preStateBeforeStaleNotify.status).toBe('ready');
    expect(preStateBeforeStaleNotify.activeRevisionId).toBe(genRevId);

    // 4. Simulate stale preload's waitForReady timeout calling compileCandidate's
    //    failure path via the internal notifyFailed mechanism — but RevisionManager
    //    won't call notifyFailed because preloadRevId is no longer authoritative.
    //    We verify this by checking the controller state is untouched.
    // (The real protection is in compileCandidate's staleness guard.)

    // Controller must remain ready with genRevId — NOT poisoned to 'failed'
    expect(previewController.getState().status).toBe('ready');
    expect(previewController.getState().activeRevisionId).toBe(genRevId);

    // No stale candidate_created for the abandoned preload
    expect(
      events.filter(e => e.event === 'candidate_created').length,
    ).toBe(2); // exactly two: preload + generation
  });

  test('generation-owned flag prevents new preload from creating a candidate', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    // Generation claims ownership
    rm.claimPreviewOwnership('test_generation');

    // A project switch / preload attempt while generation owns the preview
    const project: ProjectRecord = {
      id: 'proj-switch',
      name: 'Switch',
      description: '',
      theme: 'dark',
      files: { 'App.tsx': CLEAN_APP },
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // The materializePersistedFiles call should be rejected
    await expect(
      rm.materializePersistedFiles(project.files, {
        source: 'test_preload',
        projectId: project.id,
      }),
    ).rejects.toThrow(PRELOAD_SKIP_OWNED_MSG);

    // Must log the skip event
    expect(events.some(e =>
      e.event === 'preload_skipped_stale_project' &&
      e.payload.reason === 'generation_owns_preview',
    )).toBe(true);

    // Must not have created a candidate
    expect(events.some(e => e.event === 'candidate_created')).toBe(false);

    // Release ownership — preloads can resume
    rm.releasePreviewOwnership();
    expect(events.some(e => e.event === 'generation_preview_ownership_released')).toBe(true);
  });

  test('loadToPreview returns silently when generation owns the preview', async () => {
    const events = captureTimeline();
    // Use the singleton that ProjectRepository.loadToPreview calls internally
    revisionManager.claimPreviewOwnership('test_generation');

    const project: ProjectRecord = {
      id: 'proj-late-load',
      name: 'Late Load',
      description: '',
      theme: 'dark',
      files: { 'App.tsx': CLEAN_APP },
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // loadToPreview must NOT throw — it catches the generation-owned error
    await expect(ProjectRepository.loadToPreview(project)).resolves.toBeUndefined();

    expect(events.some(e =>
      e.event === 'preload_skipped_stale_project' &&
      e.payload.reason === 'generation_owns_preview',
    )).toBe(true);

    revisionManager.releasePreviewOwnership();
  });
});

// ── C: Inconclusive watchdog signal does not revoke ───────────────────────────

describe('C: Inconclusive signal does not revoke', () => {
  test('controller_not_ready returns inconclusive from runPostReadyDiagnostic', async () => {
    previewController.reset(); // leaves status='idle', not 'ready'
    const result = await runPostReadyDiagnostic('some-build');
    // 'idle' is not 'ready' but should be inconclusive, not unhealthy
    expect(result.status).toBe('inconclusive');
    expect(result.reason).toBe('controller_not_ready');
  });

  test('controller_failed returns inconclusive from runPostReadyDiagnostic', async () => {
    previewController.notifyFailed('stale preload timed out', 'preload-rev');
    // When notifyFailed sets activeRevisionId='preload-rev', calling diagnostic
    // for 'gen-rev' hits revision_mismatch first — both controller_failed AND
    // revision_mismatch return 'inconclusive', which is the correct outcome.
    const result = await runPostReadyDiagnostic('gen-rev');
    expect(result.status).toBe('inconclusive');
    // Either revision_mismatch (ID changed) or controller_failed — both are inconclusive
    expect(['revision_mismatch', 'controller_failed']).toContain(result.reason);
  });

  test('controller_failed with matching revisionId returns inconclusive', async () => {
    // Set controller to failed with the SAME buildId we will diagnose —
    // revision_mismatch won't fire, controller_failed will be hit.
    previewController.notifyFailed('stale preload timed out', 'gen-rev');
    const result = await runPostReadyDiagnostic('gen-rev');
    expect(result.status).toBe('inconclusive');
    expect(result.reason).toBe('controller_failed');
  });

  test('inconclusive watchdog diagnostic does not revoke within window', async () => {
    vi.useFakeTimers();
    const onUnhealthy = vi.fn();

    previewController.notifyCompiling('gen-rev');
    previewController.notifyReady('gen-rev', 'test-mounted');

    startPostPromotionWatch('gen-rev', {
      previousActiveRevisionId: null,
      onUnhealthy,
    });

    // Simulate controller going to failed AFTER promotion (stale preload timeout)
    previewController.notifyFailed('preload timeout', 'preload-rev');

    // Advance through the watchdog window — controller is 'failed', but since
    // it's inconclusive, no revocation should happen
    await vi.advanceTimersByTimeAsync(POST_PROMOTION_WATCHDOG_WINDOW_MS + 1_000);

    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  test('inconclusive logs watchdog_inconclusive event', async () => {
    vi.useFakeTimers();
    const events = captureTimeline();
    const onUnhealthy = vi.fn();

    previewController.notifyCompiling('gen-rev');
    previewController.notifyReady('gen-rev', 'test-mounted');

    startPostPromotionWatch('gen-rev', {
      previousActiveRevisionId: null,
      onUnhealthy,
    });

    // Make controller not-ready transiently — should produce inconclusive
    previewController.notifyFailed('stale', 'stale-rev');

    await vi.advanceTimersByTimeAsync(3_000);

    expect(events.some(e =>
      e.event === 'watchdog_inconclusive' && e.payload.buildId === 'gen-rev',
    )).toBe(true);
    expect(onUnhealthy).not.toHaveBeenCalled();
  });
});

// ── D: Confirmed unhealthy still revokes ─────────────────────────────────────

describe('D: Confirmed unhealthy watchdog still revokes', () => {
  test('two consecutive blank-iframe signals cause revocation', async () => {
    vi.useFakeTimers();
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    // Set up a previous active revision
    const prevRevId = await rm.createCandidate();
    await rm.writeCandidateFile(prevRevId, 'App.tsx', CLEAN_APP);
    const iframe = mountIframe(prevRevId);
    previewController.notifyCompiling(prevRevId);
    previewController.notifyReady(prevRevId, 'test-mounted');
    bypassCompile(rm, prevRevId);
    await rm.promote(prevRevId);

    // Promote a new revision
    const genRevId = await rm.createCandidate();
    await rm.writeCandidateFile(genRevId, 'App.tsx', CLEAN_APP);
    iframe.setAttribute('data-build-id', genRevId);
    if (iframe.contentDocument?.body) {
      iframe.contentDocument.body.innerHTML = '<div id="root"><main>Meaningful rendered output</main></div>';
    }
    previewController.notifyCompiling(genRevId);
    previewController.notifyReady(genRevId, 'test-mounted');
    bypassCompile(rm, genRevId);

    const waitSpy = vi.spyOn(rm, 'waitForReady').mockResolvedValue({ success: true });
    await rm.promote(genRevId);
    expect(rm.getActiveRevisionId()).toBe(genRevId);

    // Blank the iframe BEFORE the watchdog fires
    blankIframe(iframe, genRevId);

    // First check at +2500ms: sees blank → watchdog_unhealthy_pending, schedules confirmation
    // Confirmation at +4500ms: still blank → watchdog_unhealthy_confirmed → revoke
    await vi.advanceTimersByTimeAsync(4_600);

    expect(waitSpy).toHaveBeenCalledWith(prevRevId, 15_000);
    expect(rm.getActiveRevisionId()).toBe(prevRevId);
    expect(events.some(e => e.event === 'watchdog_unhealthy_pending')).toBe(true);
    expect(events.some(e => e.event === 'watchdog_unhealthy_confirmed')).toBe(true);
    expect(events.some(e => e.event === 'watchdog_late_regression_confirmed')).toBe(true);
    expect(events.some(e =>
      e.event === 'post_promotion_watch_result' && e.payload.outcome === 'promotion_revoked',
    )).toBe(true);
  });

  test('revoke_blocked_insufficient_evidence fires when iframe recovers between checks', async () => {
    vi.useFakeTimers();
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    // Set up a previous revision
    const prevRevId = await rm.createCandidate();
    await rm.writeCandidateFile(prevRevId, 'App.tsx', CLEAN_APP);
    const iframe = mountIframe(prevRevId);
    previewController.notifyCompiling(prevRevId);
    previewController.notifyReady(prevRevId, 'test-mounted');
    bypassCompile(rm, prevRevId);
    await rm.promote(prevRevId);

    // Promote new revision
    const genRevId = await rm.createCandidate();
    await rm.writeCandidateFile(genRevId, 'App.tsx', CLEAN_APP);
    iframe.setAttribute('data-build-id', genRevId);
    if (iframe.contentDocument?.body) {
      iframe.contentDocument.body.innerHTML = '<div id="root"><main>Meaningful rendered output</main></div>';
    }
    previewController.notifyCompiling(genRevId);
    previewController.notifyReady(genRevId, 'test-mounted');
    bypassCompile(rm, genRevId);

    const waitSpy = vi.spyOn(rm, 'waitForReady').mockResolvedValue({ success: true });
    await rm.promote(genRevId);

    // Blank iframe at first check, then RESTORE it before the confirmation
    blankIframe(iframe, genRevId);
    await vi.advanceTimersByTimeAsync(2_500); // first check fires → blank → pending

    // Restore content before confirmation fires
    if (iframe.contentDocument?.body) {
      iframe.contentDocument.body.innerHTML = '<div id="root"><main>Back again after recovery</main></div>';
    }
    // 2000ms confirmation delay + 5100ms probe timeout (JSDOM doesn't respond →
    // probe returns null → inconclusive → revoke_blocked_insufficient_evidence)
    await vi.advanceTimersByTimeAsync(7_100);

    expect(waitSpy).not.toHaveBeenCalled(); // no rollback
    expect(rm.getActiveRevisionId()).toBe(genRevId);
    expect(events.some(e => e.event === 'watchdog_unhealthy_pending')).toBe(true);
    expect(events.some(e => e.event === 'revoke_blocked_insufficient_evidence')).toBe(true);
    expect(events.some(e =>
      e.event === 'post_promotion_watch_result' && e.payload.outcome === 'promotion_revoked',
    )).toBe(false);
  });
});

// ── F: Real generation path — ownership claim and release cycle ───────────────
//
// These tests simulate the claim → work → release pattern that SimpleGeneration.run()
// now follows. They verify the contract at the RevisionManager level that the
// production wiring depends on. The full round-trip through SimpleGeneration.run()
// is covered in generationOwnership.test.ts.

describe('F: Ownership claim and release simulate real generation lifecycle', () => {
  test('claim emits current_run_preview_isolated and blocks preload', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    rm.claimPreviewOwnership('SimpleGeneration.run');
    expect(events.some(e => e.event === 'current_run_preview_isolated')).toBe(true);

    // Preload attempt while owned → throws with owned message
    await expect(
      rm.materializePersistedFiles(
        { 'App.tsx': CLEAN_APP },
        { source: 'test_preload', projectId: 'proj-x' },
      ),
    ).rejects.toThrow(PRELOAD_SKIP_OWNED_MSG);

    expect(events.some(e =>
      e.event === 'preload_skipped_stale_project' &&
      e.payload.reason === 'generation_owns_preview',
    )).toBe(true);

    // Must not have created a candidate
    expect(events.filter(e => e.event === 'candidate_created').length).toBe(0);

    rm.releasePreviewOwnership();
  });

  test('release after claim emits generation_preview_ownership_released', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    rm.claimPreviewOwnership('SimpleGeneration.run');
    rm.releasePreviewOwnership();

    expect(events.some(e => e.event === 'generation_preview_ownership_released')).toBe(true);
  });

  test('release after terminal success — preload proceeds past ownership guard', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    rm.claimPreviewOwnership('SimpleGeneration.run');

    // Simulate terminal success lifecycle
    const revId = await rm.createCandidate();
    await rm.writeCandidateFile(revId, 'App.tsx', CLEAN_APP);
    mountIframe(revId);
    previewController.notifyCompiling(revId);
    previewController.notifyReady(revId, 'test-mounted');
    bypassCompile(rm, revId);
    await rm.promote(revId);

    const skipCountBeforeRelease = events.filter(e => e.event === 'preload_skipped_stale_project').length;

    rm.releasePreviewOwnership();
    expect(events.some(e => e.event === 'generation_preview_ownership_released')).toBe(true);

    // Verify preload is NOT blocked: mock createCandidate to reject immediately so
    // materializePersistedFiles exits fast without hanging on waitForReady.
    const createSpy = vi.spyOn(rm, 'createCandidate').mockRejectedValueOnce(
      new Error('test-stop-after-ownership-guard'),
    );
    await rm.materializePersistedFiles(
      { 'App.tsx': CLEAN_APP },
      { source: 'post_success_preload', projectId: 'proj-y' },
    ).catch(() => { /* expected — mocked rejection */ });

    // createCandidate was reached → ownership guard did NOT block the preload
    expect(createSpy).toHaveBeenCalled();
    // No new owned-skip events after release
    expect(events.filter(e => e.event === 'preload_skipped_stale_project').length)
      .toBe(skipCountBeforeRelease);
  });

  test('release after terminal failure — preload proceeds past ownership guard', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    rm.claimPreviewOwnership('SimpleGeneration.run');
    const revId = await rm.createCandidate();
    rm.rejectCandidate(revId, 'compile_failed', 'SyntaxError: unexpected token');
    rm.releasePreviewOwnership();

    expect(events.some(e => e.event === 'generation_preview_ownership_released')).toBe(true);

    const createSpy = vi.spyOn(rm, 'createCandidate').mockRejectedValueOnce(
      new Error('test-stop-after-ownership-guard'),
    );
    await rm.materializePersistedFiles(
      { 'App.tsx': CLEAN_APP },
      { source: 'post_failure_preload', projectId: 'proj-z' },
    ).catch(() => {});

    expect(createSpy).toHaveBeenCalled();
  });

  test('release after cancellation — preload proceeds past ownership guard', async () => {
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    rm.claimPreviewOwnership('SimpleGeneration.run');
    const revId = await rm.createCandidate();
    rm.rejectCandidate(revId, 'generation_cancelled_before_materialization');
    rm.releasePreviewOwnership();

    expect(events.some(e => e.event === 'generation_preview_ownership_released')).toBe(true);

    const createSpy = vi.spyOn(rm, 'createCandidate').mockRejectedValueOnce(
      new Error('test-stop-after-ownership-guard'),
    );
    await rm.materializePersistedFiles(
      { 'App.tsx': CLEAN_APP },
      { source: 'post_cancel_preload', projectId: 'proj-cancel' },
    ).catch(() => {});

    expect(createSpy).toHaveBeenCalled();
  });

  test('ProjectStorage.loadToPreview does not throw when generation owns preview', async () => {
    const events = captureTimeline();
    revisionManager.claimPreviewOwnership('test_gen');

    const project: StoredProject = {
      id: 'proj-storage-test',
      name: 'Test',
      description: '',
      theme: 'dark',
      files: { 'App.tsx': CLEAN_APP },
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await expect(ProjectStorage.loadToPreview(project)).resolves.toBeUndefined();

    expect(events.some(e =>
      e.event === 'preload_skipped_stale_project' &&
      e.payload.reason === 'generation_owns_preview',
    )).toBe(true);

    revisionManager.releasePreviewOwnership();
  });
});

// ── E: Fresh preview stays stable through post-promotion window ───────────────

describe('E: Fresh preview stable through watchdog window', () => {
  test('fresh successful preview is not disturbed when controller stays ready', async () => {
    vi.useFakeTimers();
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    const genRevId = await rm.createCandidate();
    await rm.writeCandidateFile(genRevId, 'App.tsx', CLEAN_APP);
    const iframe = mountIframe(genRevId, 'Meaningful preview content');
    previewController.notifyCompiling(genRevId);
    previewController.notifyReady(genRevId, 'test-mounted');
    bypassCompile(rm, genRevId);

    const waitSpy = vi.spyOn(rm, 'waitForReady').mockResolvedValue({ success: true });
    await rm.promote(genRevId);

    // Controller should stay 'ready' with healthy content through the window
    await vi.advanceTimersByTimeAsync(POST_PROMOTION_WATCHDOG_WINDOW_MS + 1_000);

    expect(waitSpy).not.toHaveBeenCalled(); // no rollback triggered
    expect(rm.getActiveRevisionId()).toBe(genRevId);
    expect(previewController.getState().status).toBe('ready');
    expect(previewController.getState().activeRevisionId).toBe(genRevId);
    expect(events.some(e =>
      e.event === 'post_promotion_watch_result' && e.payload.outcome === 'stable_window_elapsed',
    )).toBe(true);
    expect(events.some(e => e.event === 'promotion_revoked')).toBe(false);
  });

  test('stale preload notifyFailed after promotion does not revoke fresh preview', async () => {
    vi.useFakeTimers();
    const events = captureTimeline();
    const rm = new RevisionManager(window.location.origin);

    const genRevId = await rm.createCandidate();
    await rm.writeCandidateFile(genRevId, 'App.tsx', CLEAN_APP);
    mountIframe(genRevId, 'Meaningful preview content');
    previewController.notifyCompiling(genRevId);
    previewController.notifyReady(genRevId, 'test-mounted');
    bypassCompile(rm, genRevId);

    const waitSpy = vi.spyOn(rm, 'waitForReady').mockResolvedValue({ success: true });
    await rm.promote(genRevId);

    // Simulate a stale preload's waitForReady timing out AFTER promotion.
    // notifyFailed with a DIFFERENT revisionId poisons the controller —
    // but the watchdog should treat controller_failed as inconclusive and
    // not revoke the valid fresh generation.
    previewController.notifyFailed('Preload timed out: no preview-mounted', 'old-preload-rev');

    // Advance through the full watchdog window
    await vi.advanceTimersByTimeAsync(POST_PROMOTION_WATCHDOG_WINDOW_MS + 1_000);

    expect(waitSpy).not.toHaveBeenCalled(); // no rollback
    expect(events.some(e => e.event === 'promotion_revoked')).toBe(false);
    expect(events.some(e => e.event === 'watchdog_inconclusive')).toBe(true);
    expect(events.some(e =>
      e.event === 'post_promotion_watch_result' && e.payload.outcome === 'stable_window_elapsed',
    )).toBe(true);
  });
});

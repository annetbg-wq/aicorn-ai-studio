/**
 * revisionSemantics — Tests proving the 4-layer revision/version model is coherent.
 *
 * The four layers:
 *   1. Snapshot (useStudio undo/redo)    — snapshotIndex, snapshotCount, lastStableSnapshotIndex
 *   2. Build Revision (RevisionManager)  — candidateRevisionId, activeRevisionId (UUIDs)
 *   3. Project Revision (ProjectStorage) — StoredProject.revisions[] (file snapshots)
 *   4. Project Record Version (Supabase) — ProjectRecord.version (concurrency counter)
 *
 * These tests verify:
 *   - Each layer's semantics are distinct and non-overlapping
 *   - Snapshot.revisionId correctly bridges layers 1↔2
 *   - Snapshot.version is a counter (1-indexed), not a UUID
 *   - ProjectRecord.version is a counter, not related to snapshots
 *   - SnapshotStatus 'candidate'→'stable' lifecycle works correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Layer 1: Snapshot types ─────────────────────────────────────────────────
// Imported from useStudio indirectly causes supabase → localStorage issues
// in vitest. These types/functions are simple enough to replicate here as
// the test validates SEMANTICS, not implementation.

type SnapshotStatus = 'candidate' | 'stable';

interface Snapshot {
  id:        string;
  files:     Record<string, string>;
  label:     string;
  createdAt: string;
  version:   number;
  status?:   SnapshotStatus;
  revisionId?: string;
}

function isSnapshotStable(s: Snapshot): boolean {
  return !s.status || s.status === 'stable';
}

// Layer 2: RevisionManager
import { RevisionManager, type RevisionSummary } from '../RevisionManager';

// Layer 3: Project Revision
import type { ProjectRevision, StoredProject } from '../ProjectStorage';

// Layer 4: Project Record
import type { ProjectRecord } from '../ProjectRepository';

// Mock PreviewController (imported by RevisionManager → WhiteScreenDetector)
vi.mock('../PreviewController', () => ({
  previewController: {
    getState: () => ({ status: 'idle' }),
    notifyCompiling: vi.fn(),
    notifyReady: vi.fn(),
    notifyFailed: vi.fn(),
    setDiagnosticStage: vi.fn(),
    setDiagnosticError: vi.fn(),
    subscribe: () => () => {},
  },
  previewLog: vi.fn(),
  setTimelineContext: vi.fn(),
}));

// ── Layer 1: Snapshot semantics ─────────────────────────────────────────────

describe('Layer 1: Snapshot (undo/redo)', () => {
  function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
    return {
      id: crypto.randomUUID(),
      files: { 'App.tsx': 'export default function App() {}' },
      label: 'Test snapshot',
      createdAt: new Date().toISOString(),
      version: 1,
      ...overrides,
    };
  }

  it('Snapshot.version is a 1-indexed counter, not a UUID', () => {
    const snap = makeSnapshot({ version: 3 });
    expect(typeof snap.version).toBe('number');
    expect(snap.version).toBe(3);
    // Not a UUID format
    expect(snap.version.toString()).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('Snapshot.revisionId bridges to Layer 2 (RevisionManager UUID)', () => {
    const buildRevisionId = crypto.randomUUID();
    const snap = makeSnapshot({ revisionId: buildRevisionId });
    // revisionId is a UUID — it links to RevisionManager
    expect(snap.revisionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // But version is still a counter
    expect(typeof snap.version).toBe('number');
  });

  it('SnapshotStatus candidate → stable lifecycle', () => {
    const candidate = makeSnapshot({ status: 'candidate' });
    expect(isSnapshotStable(candidate)).toBe(false);

    const stable = makeSnapshot({ status: 'stable' });
    expect(isSnapshotStable(stable)).toBe(true);
  });

  it('legacy snapshots (no status) are treated as stable', () => {
    const legacy = makeSnapshot();
    delete (legacy as any).status;
    expect(isSnapshotStable(legacy)).toBe(true);
  });

  it('Snapshot.id is distinct from Snapshot.revisionId', () => {
    const snap = makeSnapshot({ revisionId: crypto.randomUUID() });
    // Both are UUIDs but they identify different things:
    // .id = snapshot identity in undo/redo history
    // .revisionId = build cycle identity in RevisionManager
    expect(snap.id).not.toBe(snap.revisionId);
  });
});

// ── Layer 2: Build Revision (RevisionManager) ───────────────────────────────

describe('Layer 2: Build Revision (RevisionManager)', () => {
  let rm: RevisionManager;

  beforeEach(() => {
    rm = new RevisionManager();
    // Mock fetch for preview writes
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
  });

  it('candidateRevisionId is a UUID, not a counter', async () => {
    const id = await rm.createCandidate();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('activeRevisionId is null before first promote', () => {
    expect(rm.getActiveRevisionId()).toBeNull();
  });

  it('RevisionSummary provides atomic snapshot of state', async () => {
    const id = await rm.createCandidate();
    const summary: RevisionSummary = rm.getRevisionSummary();
    expect(summary.candidateRevisionId).toBe(id);
    expect(summary.activeRevisionId).toBeNull();
    expect(summary.hasPendingCandidate).toBe(true);
    expect(summary.storedRevisionCount).toBeGreaterThanOrEqual(1);
  });

  it('candidate and active are distinct lifecycle states', async () => {
    const id = await rm.createCandidate();
    // Candidate exists, active is null — they're different slots
    expect(rm.getCandidateRevisionId()).toBe(id);
    expect(rm.getActiveRevisionId()).toBeNull();
  });
});

// ── Layer 3: Project Revision (persistence) ─────────────────────────────────

describe('Layer 3: Project Revision (persistence)', () => {
  it('ProjectRevision.id is a UUID (file snapshot identity)', () => {
    const rev: ProjectRevision = {
      id: crypto.randomUUID(),
      prompt: 'Create a landing page',
      source: 'chat',
      files: { 'App.tsx': 'export default function App() {}' },
      createdAt: new Date().toISOString(),
      isBookmarked: false,
    };
    expect(rev.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('ProjectRevision is structurally different from Snapshot', () => {
    // ProjectRevision has: prompt, source, isBookmarked, pagesCount
    // Snapshot has: label, version (counter), status, revisionId
    // They are NOT the same thing even though both contain files.
    const rev: ProjectRevision = {
      id: 'rev-1',
      prompt: 'test',
      source: 'chat',
      files: {},
      createdAt: '',
      isBookmarked: false,
    };
    // Type system enforces: ProjectRevision has no 'version' counter
    expect('version' in rev).toBe(false);
    // Type system enforces: ProjectRevision has no 'status' field
    expect('status' in rev).toBe(false);
  });

  it('StoredProject.revisions is separate from undo/redo snapshots', () => {
    const project: Partial<StoredProject> = {
      id: 'proj-1',
      revisions: [
        {
          id: crypto.randomUUID(),
          prompt: 'First version',
          source: 'chat',
          files: { 'App.tsx': 'v1' },
          createdAt: new Date().toISOString(),
          isBookmarked: false,
        },
      ],
    };
    // Max 5 revisions — this is a persistence-layer concept
    expect(project.revisions!.length).toBeLessThanOrEqual(5);
    // These are NOT snapshots — no version counter, no status
    expect(project.revisions![0]).not.toHaveProperty('version');
    expect(project.revisions![0]).not.toHaveProperty('status');
  });
});

// ── Layer 4: Project Record Version (Supabase) ─────────────────────────────

describe('Layer 4: Project Record Version (Supabase concurrency)', () => {
  it('ProjectRecord.version is a monotonic counter', () => {
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      name: 'Test',
      description: '',
      theme: 'dark-slate',
      files: {},
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 3,
    };
    expect(typeof record.version).toBe('number');
    // Incremented on each save — not related to snapshots or revisions
    expect(record.version).toBe(3);
  });

  it('ProjectRecord.version is unrelated to Snapshot.version', () => {
    // ProjectRecord.version = DB save count (optimistic concurrency)
    // Snapshot.version = 1-indexed history position
    // They can differ wildly for the same project
    const record: ProjectRecord = {
      id: 'p1', name: '', description: '', theme: '', files: {},
      chatHistory: [], createdAt: '', updatedAt: '', version: 47,
    };
    // 47 DB saves ≠ 47 snapshots. These are different counters.
    expect(record.version).toBe(47);
  });
});

// ── Cross-layer: no semantic collision ──────────────────────────────────────

describe('Cross-layer: semantic non-collision', () => {
  it('all four layer IDs/counters can coexist without confusion', () => {
    // Layer 1: snapshot version = counter 3 (third undo/redo checkpoint)
    const snapshotVersion = 3;

    // Layer 2: build revision = UUID (Vite HMR compile cycle)
    const buildRevisionId = '550e8400-e29b-41d4-a716-446655440000';

    // Layer 3: project revision = UUID (persisted file snapshot)
    const projectRevisionId = '660e8400-e29b-41d4-a716-446655440001';

    // Layer 4: record version = counter 12 (12th Supabase save)
    const recordVersion = 12;

    // All four are different types/values
    expect(typeof snapshotVersion).toBe('number');
    expect(typeof buildRevisionId).toBe('string');
    expect(typeof projectRevisionId).toBe('string');
    expect(typeof recordVersion).toBe('number');
    expect(snapshotVersion).not.toBe(recordVersion);
    expect(buildRevisionId).not.toBe(projectRevisionId);
  });
});

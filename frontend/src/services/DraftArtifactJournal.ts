/**
 * DraftArtifactJournal — append-only localStorage journal for unsaved generation work.
 *
 * Preserves raw generation materials (prompts, model outputs, extracted JSON, parsed
 * objects, accepted files, errors) for each draft attempt BEFORE a project is saved.
 *
 * Lifecycle:
 *   createSession()      — called when user starts a new unsaved run (createNewProject / startup)
 *   appendRecord()       — called at each generation step; append-only, never overwrites
 *   project_saved record — written by commitPendingProjectSave after successful Save
 *   purgeSession()       — available for retention-policy cleanup; never called automatically
 *
 * Draft sessions are completely separate from persisted Projects.
 * A session is promoted to a real project only when the user explicitly saves.
 */

const JOURNAL_INDEX_KEY = 'DRAFT_JOURNAL_INDEX';
const JOURNAL_KEY_PREFIX = 'DRAFT_JOURNAL_';
const MAX_SESSIONS = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DraftJournalRecord {
  schema: 'aic-draft-journal-v1';
  recordId: string;
  draftSessionId: string;
  runId?: string;
  timestamp: number;
  stepType:
    | 'draft_session_started'
    | 'generation_start'
    | 'plan'
    | 'generation_complete'
    | 'generation_failed'
    | 'generation_error'
    | 'project_saved'
    | string;
  source?: string;
  /** null = unsaved draft; string = real project ID (only after Save) */
  projectId: string | null;
  request?: Record<string, unknown>;
  rawOutput?: string;
  extractedJson?: string;
  parsedObject?: unknown;
  acceptedFiles?: string[];
  compileResult?: unknown;
  previewResult?: unknown;
  error?: string;
  status: 'ok' | 'failed' | 'partial';
  metadata?: Record<string, unknown>;
}

export interface DraftSessionSummary {
  id: string;
  createdAt: number;
  source?: string;
  recordCount: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

class DraftArtifactJournalService {
  /**
   * Create a new draft session.
   * Returns the new session ID (format: `draft_<hex12>_<timestamp>`).
   * Evicts the oldest session when the limit is exceeded.
   */
  createSession(opts?: { source?: string }): string {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const id = `draft_${hex}_${Date.now()}`;

    const summary: DraftSessionSummary = {
      id,
      createdAt: Date.now(),
      source: opts?.source,
      recordCount: 0,
    };

    const index = this._readIndex();
    index.push(summary);

    while (index.length > MAX_SESSIONS) {
      const oldest = index.shift();
      if (oldest) {
        try { localStorage.removeItem(`${JOURNAL_KEY_PREFIX}${oldest.id}`); } catch { /* quota */ }
      }
    }

    this._writeIndex(index);
    try { localStorage.setItem(`${JOURNAL_KEY_PREFIX}${id}`, '[]'); } catch { /* quota */ }

    return id;
  }

  /**
   * Append a record to the draft session journal. Append-only — never overwrites.
   * Silently fails if localStorage is full (journal is best-effort).
   */
  appendRecord(
    sessionId: string,
    partial: Omit<DraftJournalRecord, 'schema' | 'recordId' | 'draftSessionId' | 'timestamp'>,
  ): void {
    const record: DraftJournalRecord = {
      schema: 'aic-draft-journal-v1',
      recordId: crypto.randomUUID(),
      draftSessionId: sessionId,
      timestamp: Date.now(),
      ...partial,
    };

    try {
      const key = `${JOURNAL_KEY_PREFIX}${sessionId}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]') as DraftJournalRecord[];
      existing.push(record);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch { /* quota exceeded — silently skip */ }

    this._updateIndexEntry(sessionId, (entry) => {
      entry.recordCount = (entry.recordCount || 0) + 1;
    });
  }

  /** Return all records for a session (empty array if not found). */
  getRecords(sessionId: string): DraftJournalRecord[] {
    try {
      return JSON.parse(localStorage.getItem(`${JOURNAL_KEY_PREFIX}${sessionId}`) || '[]');
    } catch {
      return [];
    }
  }

  /** List all tracked sessions (most-recent last). */
  listSessions(): DraftSessionSummary[] {
    return this._readIndex();
  }

  /** Remove a session and its records from localStorage. */
  purgeSession(sessionId: string): void {
    try { localStorage.removeItem(`${JOURNAL_KEY_PREFIX}${sessionId}`); } catch { /* quota */ }
    const index = this._readIndex().filter(s => s.id !== sessionId);
    this._writeIndex(index);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _readIndex(): DraftSessionSummary[] {
    try {
      return JSON.parse(localStorage.getItem(JOURNAL_INDEX_KEY) || '[]');
    } catch {
      return [];
    }
  }

  private _writeIndex(index: DraftSessionSummary[]): void {
    try { localStorage.setItem(JOURNAL_INDEX_KEY, JSON.stringify(index)); } catch { /* quota */ }
  }

  private _updateIndexEntry(
    sessionId: string,
    updater: (entry: DraftSessionSummary) => void,
  ): void {
    const index = this._readIndex();
    const entry = index.find(s => s.id === sessionId);
    if (entry) {
      updater(entry);
      this._writeIndex(index);
    }
  }
}

export const draftArtifactJournal = new DraftArtifactJournalService();

// Expose for agent-led debugging in browser devtools
if (typeof window !== 'undefined') {
  (window as any).__draftArtifactJournal = draftArtifactJournal;
}

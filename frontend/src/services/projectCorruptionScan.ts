/**
 * projectCorruptionScan — Read-time corruption detection for persisted project state.
 *
 * Scans file maps (StoredProject.files, ProjectRevision.files, Snapshot.files)
 * BEFORE they reach preview, detecting:
 *   - Artifact-envelope JSON stored as source file content
 *   - Missing entry file (App.tsx / main.tsx) when files exist
 *   - Empty or obviously broken file maps
 *
 * This is a READ-TIME safety net — it catches corruption that was persisted
 * before write-time guards were added (previewGuard.ts, server-side bridge).
 *
 * Does NOT auto-repair. Reports structured findings so callers can:
 *   - Abort preview load
 *   - Preserve last-good preview
 *   - Surface honest failure reasons
 */

import { isArtifactEnvelope } from './previewGuard';
import { previewLog } from './PreviewController';
import type { StoredProject } from './ProjectStorage';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorruptionFinding {
  kind:     'artifact-envelope' | 'missing-entry' | 'empty-file-map';
  path:     string;        // file path affected, or '' for map-level issues
  message:  string;        // human-readable description
}

export interface CorruptionScanResult {
  clean:    boolean;
  findings: CorruptionFinding[];
}

// ── Source file extensions that get checked for envelope corruption ──────────

const SOURCE_EXT_RE = /\.(tsx?|jsx?)$/;

// ── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Scan a file map for corruption. Returns clean=true if no issues found.
 *
 * Checks:
 *   1. Artifact-envelope JSON in any source file (*.ts, *.tsx, *.js, *.jsx)
 *   2. Missing entry file when at least one file exists
 *   3. Empty file map (no files at all)
 */
export function scanFileMap(files: Record<string, string>): CorruptionScanResult {
  const findings: CorruptionFinding[] = [];

  const entries = Object.entries(files);
  if (entries.length === 0) {
    findings.push({
      kind:    'empty-file-map',
      path:    '',
      message: 'Project has no files',
    });
    return { clean: false, findings };
  }

  // Normalize paths for entry-file detection
  const norm = (p: string) => p.replace(/^\//, '').replace(/^src\//, '');
  const normalizedPaths = new Set(entries.map(([p]) => norm(p)));

  // Check for missing entry file
  const hasEntry =
    normalizedPaths.has('App.tsx') ||
    normalizedPaths.has('App.ts') ||
    normalizedPaths.has('App.jsx') ||
    normalizedPaths.has('App.js') ||
    normalizedPaths.has('main.tsx') ||
    normalizedPaths.has('main.ts');

  if (!hasEntry) {
    findings.push({
      kind:    'missing-entry',
      path:    '',
      message: 'No App.tsx or main.tsx entry file found',
    });
  }

  // Check each source file for artifact-envelope corruption
  for (const [filePath, content] of entries) {
    const cleaned = norm(filePath);
    if (!SOURCE_EXT_RE.test(cleaned)) continue;
    if (cleaned === '__build_id.ts') continue;

    if (typeof content === 'string' && isArtifactEnvelope(content)) {
      findings.push({
        kind:    'artifact-envelope',
        path:    cleaned,
        message: `"${cleaned}" contains transport-level artifact JSON instead of source code`,
      });
    }
  }

  return { clean: findings.length === 0, findings };
}

// ── Pre-load gate ────────────────────────────────────────────────────────────

export interface PreloadScanResult {
  safe:     boolean;
  findings: CorruptionFinding[];
  /** If not safe, a structured reason string for UI/logging. */
  reason?:  string;
}

/**
 * Gate function for load-to-preview paths. Scans a project's files and
 * returns whether it's safe to proceed.
 *
 * Callers should:
 *   - If safe: proceed with loadToPreview normally
 *   - If NOT safe: skip the load, log the findings, preserve last-good preview
 */
export function scanBeforePreviewLoad(
  projectId: string,
  files: Record<string, string>,
  source: string,
): PreloadScanResult {
  const result = scanFileMap(files);

  if (!result.clean) {
    const artifactFindings = result.findings.filter(f => f.kind === 'artifact-envelope');
    const reason = result.findings.map(f => f.message).join('; ');

    previewLog('corruption_detected_preload', {
      projectId,
      source,
      findingCount: result.findings.length,
      artifactEnvelopeCount: artifactFindings.length,
      findings: result.findings.map(f => ({ kind: f.kind, path: f.path })),
    });

    // artifact-envelope findings are blocking — the project CANNOT be previewed safely
    if (artifactFindings.length > 0) {
      return { safe: false, findings: result.findings, reason };
    }

    // missing-entry and empty-file-map are warnings — load may still work
    // (some projects legitimately have no App.tsx, e.g. HTML/Alpine projects)
    // Let them through with findings attached for logging
  }

  return { safe: true, findings: result.findings };
}

// ── Bulk audit utility ───────────────────────────────────────────────────────

export interface ProjectAuditEntry {
  id:       string;
  name:     string;
  clean:    boolean;
  findings: CorruptionFinding[];
}

/**
 * Scan ALL saved local projects and report which ones are corrupted.
 *
 * This is an opt-in diagnostic utility — NOT called automatically.
 * Usage from DevTools console:
 *   import('/src/services/projectCorruptionScan.ts').then(m => m.auditAllProjects())
 *
 * Or call from any diagnostic panel.
 */
export function auditAllProjects(): ProjectAuditEntry[] {
  const results: ProjectAuditEntry[] = [];

  try {
    const metaRaw = localStorage.getItem('aic-project-meta');
    if (!metaRaw) return results;
    const meta: Array<{ id: string; name?: string }> = JSON.parse(metaRaw);

    for (const m of meta) {
      try {
        const raw = localStorage.getItem(`aic-proj-${m.id}`);
        if (!raw) continue;
        const project: StoredProject = JSON.parse(raw);
        const scan = scanFileMap(project.files ?? {});
        results.push({
          id:       m.id,
          name:     project.name ?? m.name ?? '(unnamed)',
          clean:    scan.clean,
          findings: scan.findings,
        });

        // Also scan revisions if present
        if (Array.isArray(project.revisions)) {
          for (const rev of project.revisions) {
            if (rev.files && Object.keys(rev.files).length > 0) {
              const revScan = scanFileMap(rev.files);
              if (!revScan.clean) {
                results.push({
                  id:       `${m.id}/rev/${rev.id}`,
                  name:     `${project.name ?? '(unnamed)'} — revision ${rev.id.slice(0, 8)}`,
                  clean:    false,
                  findings: revScan.findings,
                });
              }
            }
          }
        }
      } catch {
        // Corrupted project JSON — skip
      }
    }
  } catch {
    // Corrupted meta index — return empty
  }

  return results;
}

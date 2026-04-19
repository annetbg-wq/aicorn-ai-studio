/**
 * EditAdmissionService — filesystem guardrails and edit-risk classification.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  INTERNAL RISK MODEL (three levels — never exposed verbatim to the user)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  safe        — Normal source-file edits. Proceed silently.
 *  risky       — Config / protected / large-surface changes.
 *                Require explicit user confirmation before compiling.
 *  destructive — File deletions or critical-runtime mutations.
 *                Require a stronger confirmation with clearer language.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  USER-FACING MODEL (what the user actually sees — always simple)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  safe        → no interruption
 *  risky       → warning banner + "Continue" / "Cancel"
 *  destructive → stronger warning + "I understand, proceed" / "Cancel"
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  PROTECTED PATHS REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Any candidate file matching these patterns automatically escalates risk.
 *  Add entries to PROTECTED_PATH_PATTERNS — not scattered across ad-hoc checks.
 *
 *  Categories:
 *   • Core revision / preview infrastructure (RevisionManager, PreviewWriteGateway …)
 *   • Project persistence layer (ProjectRepository, ProjectStorage …)
 *   • Root hook + canvas (useStudio, PreviewCanvas)
 *   • Vite / build / package manifests (vite.config, package.json …)
 *   • Preview-workspace derivative (must never become source of truth)
 *   • Backend / auth / migrations
 */

// ── Types ─────────────────────────────────────────────────────────────────────
import { toPolicyPath, tryCanonicalizeProjectPath } from '../shared/safePaths';

/** Internal risk level — used for gate routing. Never shown verbatim to users. */
export type EditRisk = 'safe' | 'risky' | 'destructive';

/** Input to the classifier. */
export interface EditMeta {
  /** All file paths being written into the candidate. */
  candidatePaths: string[];
  /**
   * File paths in the currently active revision.
   * Paths present in active but absent from candidate → deletion detected.
   * Pass empty array when no previous revision exists (first generation).
   */
  activePaths?: string[];
  /** Caller identity for log context. */
  source?: string;
}

/** Full classification result — internal detail kept out of normal UX. */
export interface AdmissionDecision {
  /** Internal risk — used by the gateway for routing. */
  risk: EditRisk;
  /** Internal reasons list (for logs / diagnostics — not shown raw to users). */
  reasons: string[];
  /** Subset of candidatePaths that matched a protected-path pattern. */
  protectedPathsHit: string[];
  /** Files present in active revision but absent from candidate (would be deleted). */
  deletedPaths: string[];
  /** True when the workspace had uncommitted state when the check ran. */
  isDirtyWorkspace: boolean;
  /**
   * User-facing heading (shown in warning modal).
   * Empty string for safe edits (no modal shown).
   */
  userHeading: string;
  /**
   * User-facing body text (shown in warning modal).
   * Empty string for safe edits.
   */
  userBody: string;
  /**
   * True when the UI must pause and require an explicit user click.
   * Always true for risky and destructive.
   */
  requiresConfirmation: boolean;
  /**
   * True only for destructive edits — UI uses stronger confirmation language
   * (e.g. "I understand, proceed" rather than just "Continue").
   */
  requiresStrongConfirmation: boolean;
}

// ── Protected paths registry ──────────────────────────────────────────────────
//
// Rule: any candidate file whose normalised path matches one of these regexes
// escalates risk to 'risky' (or keeps 'destructive' if already set).
// Do NOT add path checks elsewhere in the codebase — update this list instead.

const PROTECTED_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  // Core revision / preview infrastructure
  /revisionmanager/,
  /previewwritegateway/,
  /previewcontroller/,
  /whitescreendetector/,
  /previewguard/,
  /compileguard/,
  /projectcorruptionscan/,
  /artifactreviewerservice/,

  // Project persistence
  /projectrepository/,
  /projectstorage/,
  /projectmanager/,

  // Root hook + canvas
  /usestudio/,
  /previewcanvas/,

  // Vite + build config files
  /vite\.config\./,
  /vitest\.config\./,

  // Package manifests (lockfiles → dependency mutation)
  /^package\.json$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,

  // Preview workspace (derivative state — must never be written as source)
  /preview-workspace\//,

  // Backend server / API / auth
  /^server\//,
  /^backend\//,
  /^api\//,

  // Database migrations
  /supabase\/migrations\//,

  // Vite entry-points (touching these re-wires the entire bundle)
  /^main\.(tsx?|jsx?)$/,
  /^index\.html$/,
];

// Config files that escalate to 'risky' (but not 'destructive') on their own.
const CONFIG_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /tsconfig.*\.json$/,
  /\.env($|\.)/,
  /eslint\.config/,
  /postcss\.config/,
  /tailwind\.config/,
  /babel\.config/,
  /jest\.config/,
  /rollup\.config/,
  /webpack\.config/,
];

/** File-count threshold above which an edit is considered 'risky'. */
const LARGE_CHANGE_THRESHOLD = 15;

function canonicalizeForClassification(paths: string[]): {
  canonical: string[];
  invalid: string[];
} {
  const canonical: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const raw of paths) {
    const parsed = tryCanonicalizeProjectPath(raw, {
      allowRootSlash: true,
      stripSrcPrefix: true,
      label: 'candidate path',
    });
    if (!parsed.ok) {
      invalid.push(String(raw));
      continue;
    }
    if (seen.has(parsed.path)) continue;
    seen.add(parsed.path);
    canonical.push(parsed.path);
  }

  return { canonical, invalid };
}

// ── Classifier ────────────────────────────────────────────────────────────────

export class EditAdmissionService {
  /**
   * Classify the risk of applying a set of candidate files.
   *
   * @param meta            — candidate paths + active paths + caller id
   * @param isDirtyWorkspace — true when uncommitted workspace changes exist
   *                          (e.g. a diff review is pending or a previous
   *                           compile cycle is mid-flight)
   */
  static classify(meta: EditMeta, isDirtyWorkspace = false): AdmissionDecision {
    const { candidatePaths, activePaths = [], source: _source = 'unknown' } = meta;
    const reasons: string[] = [];
    const canonicalCandidate = canonicalizeForClassification(candidatePaths);
    const canonicalActive = canonicalizeForClassification(activePaths);
    const candidatePolicyPaths = canonicalCandidate.canonical.map(toPolicyPath);
    const activePolicyPaths = canonicalActive.canonical.map(toPolicyPath);

    // 1. Deletion detection — files in active but absent from candidate
    const candidateSet = new Set(candidatePolicyPaths);
    const deletedPaths = canonicalActive.canonical.filter((p, index) => !candidateSet.has(activePolicyPaths[index]));

    // 2. Protected-path detection
    const protectedPathsHit = canonicalCandidate.canonical.filter((p, index) =>
      PROTECTED_PATH_PATTERNS.some(re => re.test(candidatePolicyPaths[index])),
    );

    // 3. Config-path detection
    const configPathsHit = canonicalCandidate.canonical.filter((p, index) =>
      CONFIG_PATH_PATTERNS.some(re => re.test(candidatePolicyPaths[index])),
    );

    // 4. Scale heuristic
    const isLargeChange = canonicalCandidate.canonical.length >= LARGE_CHANGE_THRESHOLD;

    // ── Risk escalation ────────────────────────────────────────────────────
    // Priority: destructive > protected > config/scale > dirty > safe
    let risk: EditRisk = 'safe';

    if (deletedPaths.length > 0) {
      const names = deletedPaths.map(p => p.split('/').pop()).filter(Boolean).join(', ');
      reasons.push(`File deletion: ${names}`);
      risk = 'destructive';
    }

    if (protectedPathsHit.length > 0) {
      const names = protectedPathsHit.map(p => p.split('/').pop()).filter(Boolean).join(', ');
      reasons.push(`Critical files touched: ${names}`);
      if (risk !== 'destructive') risk = 'risky';
    }

    if (configPathsHit.length > 0 && risk === 'safe') {
      const names = configPathsHit.map(p => p.split('/').pop()).filter(Boolean).join(', ');
      reasons.push(`Configuration files changed: ${names}`);
      risk = 'risky';
    }

    if (isLargeChange && risk === 'safe') {
      reasons.push(`Large change: ${canonicalCandidate.canonical.length} files`);
      risk = 'risky';
    }

    if (isDirtyWorkspace && risk === 'safe') {
      reasons.push('Unapplied workspace changes detected');
      risk = 'risky';
    }

    if (canonicalCandidate.invalid.length > 0 || canonicalActive.invalid.length > 0) {
      reasons.push(
        `Unsafe path spellings detected: ${[...canonicalCandidate.invalid, ...canonicalActive.invalid].join(', ')}`,
      );
      if (risk === 'safe') risk = 'risky';
    }

    // ── User-facing messages (simple language, never raw risk class) ────────
    let userHeading = '';
    let userBody = '';

    if (risk === 'risky') {
      userHeading = 'Review before applying';
      if (reasons.length === 1) {
        userBody =
          `This edit ${reasons[0].toLowerCase()}. ` +
          `A snapshot will be saved first. Continue?`;
      } else {
        userBody =
          `This edit touches ${reasons.length} critical areas:\n` +
          reasons.map(r => `• ${r}`).join('\n') +
          `\n\nA snapshot will be saved first. Continue?`;
      }
    } else if (risk === 'destructive') {
      userHeading = 'Destructive change — confirmation required';
      if (deletedPaths.length > 0) {
        const names = deletedPaths.map(p => p.split('/').pop()).filter(Boolean).join(', ');
        userBody =
          `This will permanently remove ${deletedPaths.length} file(s):\n${names}\n\n` +
          `This cannot be undone without restoring a snapshot.\n\n` +
          `Are you sure you want to proceed?`;
      } else {
        userBody =
          `This edit modifies critical runtime files:\n` +
          reasons.map(r => `• ${r}`).join('\n') +
          `\n\nProceed only if you understand the impact.`;
      }
    }

    return {
      risk,
      reasons,
      protectedPathsHit,
      deletedPaths,
      isDirtyWorkspace,
      userHeading,
      userBody,
      requiresConfirmation:       risk !== 'safe',
      requiresStrongConfirmation: risk === 'destructive',
    };
  }

  /** True when `path` matches any entry in the protected-path registry. */
  static isProtectedPath(path: string): boolean {
    const parsed = tryCanonicalizeProjectPath(path, {
      allowRootSlash: true,
      stripSrcPrefix: true,
      label: 'protected path',
    });
    if (!parsed.ok) return false;
    return PROTECTED_PATH_PATTERNS.some(re => re.test(parsed.path.toLowerCase()));
  }

  /** Snapshot of the protected-path patterns (for tests / external inspection). */
  static getProtectedPathPatterns(): RegExp[] {
    return PROTECTED_PATH_PATTERNS.map(re => new RegExp(re.source, re.flags));
  }
}

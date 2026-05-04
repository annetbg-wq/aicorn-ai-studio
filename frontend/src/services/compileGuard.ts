/**
 * compileGuard.ts — Post-generation self-correction loop.
 *
 * After SimpleGeneration writes files to a candidate revision, this module
 * runs compile → diagnose → fix → recompile, up to MAX_ATTEMPTS times.
 *
 * This closes the #1 architectural gap vs. Lovable-level quality:
 * without a retry loop, a single compile error = white screen for the user.
 */

import { revisionManager } from './RevisionManager';
import { commandBus } from './studioCommandBus';
import { parseArtifact, parseFileMarkers } from './artifactParser';
import { previewLog } from './PreviewController';
import { canonicalizeProjectPath } from '../shared/safePaths';

// ── In-memory file lookup (replaces legacy /__read_preview bridge call) ───────
// Reads a file from the RevisionManager's in-memory candidate store.
// The candidate has all user-generated files buffered before compileWithRetry runs.
function readCandidateFile(filePath: string, revId: string): string | null {
  const files = revisionManager.getRevisionFiles(revId) ?? {};
  return files[filePath] ?? files[`/${filePath}`] ?? files[`src/${filePath}`] ?? null;
}

const MAX_REPAIR_ATTEMPTS = 2;

/** Dynamic attempt ceiling: 3 for apps with 5+ files, 2 otherwise. */
function getMaxRepairAttempts(revId: string): number {
  const files = revisionManager.getRevisionFiles(revId) ?? {};
  return Object.keys(files).length >= 5 ? 3 : MAX_REPAIR_ATTEMPTS;
}

interface CompileLoopConfig {
  revId:    string;
  apiKey:   string;
  onLog:    (msg: string) => void;
  signal?:  AbortSignal;
  /** Failed fast-gate result already observed before entering the repair loop. */
  initialFailureErrors?: string[];
  /** LLM call delegate — avoids duplicating callLLM / endpoint logic. */
  callFix?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  /** Admission re-check used when compileGuard expands the candidate file set. */
  recheckAdmission?: (nextCandidatePaths: string[]) => Promise<boolean>;
}

export type RepairFailureSeverity = 'fatal' | 'non_fatal';
export type RepairProgressStatus = 'progress' | 'no_progress';
export type RepairDecision = 'retry' | 'stop' | 'partial_ship' | 'no_repair_needed';
export type CompileLoopOutcome =
  | 'no_repair_needed'
  | 'repair_succeeded'
  | 'partial_ship'
  | 'non_fatal_degraded_acceptable'
  | 'non_fatal_non_viable'
  | 'fatal_non_viable';

export interface RepairFailureClassification {
  severity: RepairFailureSeverity;
  reason: string;
  signature: string;
}

export interface RepairProgressEvaluation {
  status: RepairProgressStatus;
  previousSignature: string | null;
  currentSignature: string;
}

export interface CompileLoopResult {
  outcome:      CompileLoopOutcome;
  success:      boolean;
  attempts:     number;
  errors?:      string[];
  stopReason:   string;
  partialShip:  boolean;
  degraded:     boolean;
  minimumViableCandidate: boolean;
  budgetExhausted: boolean;
  failureClassification: RepairFailureClassification | null;
}

function isValidFile(path: string, content: string): boolean {
  if (!content || content.trim().length < 20) return false;
  if ((path.endsWith('.tsx') || path.endsWith('.ts')) &&
      !/(?:export|import|function|const)\s/.test(content)) return false;
  const opens  = (content.match(/\{/g) || []).length;
  const closes = (content.match(/\}/g) || []).length;
  if (opens > 0 && Math.abs(opens - closes) > 5) return false;
  return true;
}

function extractFileFromError(msg: string): string | null {
  const match = msg.match(/(?:src\/)([\w/.]+\.tsx?)/);
  return match ? match[1] : null;
}

function isRouteFallbackTarget(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^src\//, '');
  if (!/\.(tsx|jsx)$/i.test(normalized)) return false;
  if (normalized === 'App.tsx') return false;
  return (
    normalized.startsWith('pages/') ||
    normalized.includes('/pages/') ||
    !normalized.includes('/')
  );
}


/**
 * Build a fix prompt from compile errors and attempt to fix via LLM.
 * Returns number of files written to the candidate (0 = fix failed).
 */
async function attemptFix(
  errors: string[],
  config: CompileLoopConfig,
  attemptNum: number,
): Promise<number> {
  if (!config.callFix) return 0;

  const errorText = errors.join('\n').slice(0, 1200);

  // ── Missing import fast-path ──────────────────────────────────
  const missingMatch = errorText.match(
    /Failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/,
  );

  let prompt: string;

  if (missingMatch) {
    const [, missingModule, sourceFile] = missingMatch;
    const missingPath = missingModule.replace(/^\.\//, '');
    const ext = missingPath.includes('.') ? '' : '.tsx';
    config.onLog(`[CompileGuard] Missing file: ${missingPath}${ext} (from ${sourceFile})`);

    const cleanSource = sourceFile.replace(/^src\//, '');
    const sourceCode = readCandidateFile(cleanSource, config.revId)?.slice(0, 2000) ?? '';

    prompt = `A React/TypeScript file is missing: ${missingPath}${ext}
It is imported in ${sourceFile}:
${sourceCode}

Generate the missing file. Match the design system (shadcn/ui, Tailwind CSS tokens).
Return ONLY a JSON artifact:
\`\`\`json
{"artifact":{"files":[{"path":"${missingPath}${ext}","content":"...complete file..."}]}}
\`\`\``;
  } else {
    // ── Generic error path ──────────────────────────────────────
    const file = extractFileFromError(errorText);
    if (!file) {
      config.onLog(`[CompileGuard] Cannot extract file from error`);
      return 0;
    }

    const content = readCandidateFile(file, config.revId);
    if (!content) {
      config.onLog(`[CompileGuard] Cannot read ${file}`);
      return 0;
    }

    // ── "Cannot read properties" path: include App.tsx as context ──
    const isRuntimePropError = /cannot read (?:properties of|'?\w+'? of) (?:undefined|null)/i.test(errorText);
    const appContent = isRuntimePropError ? readCandidateFile('App.tsx', config.revId) : null;

    const retryContext = attemptNum > 1
      ? `\n\nPrevious repair attempt ${attemptNum - 1} did not fix the issue. The error persists. Consider deeper root causes:\n  1. Is state initialized before use?\n  2. Is a required prop missing from the call-site in App.tsx?\n  3. Is there a missing provider or router wrapper?\n  4. Does the component assume data that doesn't exist yet on first render?`
      : '';

    prompt = `Fix this React/TypeScript error (attempt ${attemptNum}/${MAX_REPAIR_ATTEMPTS}).${retryContext}

ERROR:
${errorText}

FILE TO FIX: ${file}
\`\`\`tsx
${content.slice(0, 2500)}
\`\`\`
${appContent ? `\nAPP.TSX (call-site context — fix props here if required props are missing):\n\`\`\`tsx\n${appContent.slice(0, 2000)}\n\`\`\`\n` : ''}
Return the COMPLETE fixed file(s) as a JSON artifact.${appContent ? ' If the fix requires changes to BOTH files, include both in the artifact.' : ''}
\`\`\`json
{"artifact":{"files":[{"path":"${file}","content":"...complete fixed file..."}]}}
\`\`\`
Fix ONLY the error. Keep all functionality. Output ONLY the JSON.`;
  }

  const raw = await config.callFix(prompt, config.signal);

  // Parse and write
  const parsed = parseArtifact(raw);
  const files: Record<string, string> = {};
  if (parsed.success && parsed.artifact) {
    for (const f of parsed.artifact.files) {
      const key = f.path.startsWith('/') ? f.path : '/' + f.path.replace(/^src\//, '');
      files[key] = f.content;
    }
  } else {
    Object.assign(files, parseFileMarkers(raw));
  }

  const currentFiles = revisionManager.getRevisionFiles(config.revId) ?? {};
  const currentPaths = Object.keys(currentFiles);
  const currentPathSet = new Set(currentPaths);
  const sanitizedEntries: Array<{ path: string; content: string }> = [];

  for (const [rawPath, content] of Object.entries(files)) {
    let canonicalPath: string;
    try {
      canonicalPath = canonicalizeProjectPath(rawPath, {
        allowRootSlash: true,
        stripSrcPrefix: true,
        label: 'compileGuard path',
      });
    } catch (e) {
      config.onLog(`[CompileGuard] Blocked invalid fix path: ${rawPath} (${String(e)})`);
      continue;
    }
    sanitizedEntries.push({ path: canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`, content });
  }

  const addedPaths = sanitizedEntries
    .map(entry => entry.path.replace(/^\//, ''))
    .filter(path => !currentPathSet.has(path));

  if (addedPaths.length > 0) {
    if (!config.recheckAdmission) {
      config.onLog(
        `[CompileGuard] Blocked ${addedPaths.length} newly introduced path(s) because no admission recheck is registered`,
      );
      return 0;
    }
    const nextCandidatePaths = [...new Set([...currentPaths, ...addedPaths])];
    const approved = await config.recheckAdmission(nextCandidatePaths);
    if (!approved) {
      config.onLog(
        `[CompileGuard] Admission recheck rejected new path(s): ${addedPaths.join(', ')}`,
      );
      return 0;
    }
  }

  let written = 0;
  for (const { path, content } of sanitizedEntries) {
    if (!isValidFile(path, content)) continue;
    await revisionManager.writeCandidateFile(config.revId, path, content);
    config.onLog(`[CompileGuard] ✓ Fixed: ${path}`);
    written++;
  }
  return written;
}

function normalizeFailureSignature(errors: string[]): string {
  return errors
    .map(error => error
      .toLowerCase()
      .replace(/\b[0-9]+\b/g, '#')
      .replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/g, '<id>')
      .replace(/["'][^"']+["']/g, '"path"')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' | ')
    .slice(0, 400);
}

export function classifyRepairFailure(errors: string[]): RepairFailureClassification {
  const signature = normalizeFailureSignature(errors);
  const errorText = errors.join('\n').toLowerCase();

  if (!errorText.trim()) {
    return { severity: 'non_fatal', reason: 'warning_only_issue', signature: 'warning-only' };
  }

  if (
    errors.every(error => /^\s*(warning|warn)[:\s]/i.test(error)) ||
    /warning-level issue/.test(errorText)
  ) {
    return { severity: 'non_fatal', reason: 'warning_only_issue', signature };
  }

  if (
    /failed to resolve import/.test(errorText) &&
    /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|mp4|mp3|webm)(?:["']|\s|$)/.test(errorText)
  ) {
    return { severity: 'non_fatal', reason: 'missing_non_critical_asset', signature };
  }

  if (/white_screen_after_ready|preview is blank|white screen/.test(errorText)) {
    return { severity: 'fatal', reason: 'boot_blank_screen', signature };
  }

  if (/preview-mounted not received|did not mount|timed out|timeout/.test(errorText)) {
    return { severity: 'fatal', reason: 'boot_timeout', signature };
  }

  if (/failed to resolve import|cannot find module|module not found/.test(errorText)) {
    return { severity: 'fatal', reason: 'compile_dependency_failure', signature };
  }

  if (/before initialization|is not defined|hydrate|bootstrap|startup|initial/i.test(errorText)) {
    return { severity: 'fatal', reason: 'entry_runtime_initialization_failure', signature };
  }

  return { severity: 'fatal', reason: 'candidate_execution_failure', signature };
}

export function evaluateRepairProgress(
  previousSignature: string | null,
  currentSignature: string,
): RepairProgressEvaluation {
  return {
    status: previousSignature && previousSignature === currentSignature ? 'no_progress' : 'progress',
    previousSignature,
    currentSignature,
  };
}

function logFailureClassified(
  config: CompileLoopConfig,
  classification: RepairFailureClassification,
  errors: string[],
): void {
  previewLog('failure_classified', {
    buildId: config.revId,
    severity: classification.severity,
    reason: classification.reason,
    signature: classification.signature,
    errors,
  });
  config.onLog(
    `[CompileGuard] Failure classified: ${classification.severity} (${classification.reason})`,
  );
}

function logProgressEvaluated(
  config: CompileLoopConfig,
  progress: RepairProgressEvaluation,
): void {
  previewLog('progress_evaluated', {
    buildId: config.revId,
    status: progress.status,
    previousSignature: progress.previousSignature,
    currentSignature: progress.currentSignature,
  });
  config.onLog(`[CompileGuard] Progress evaluated: ${progress.status}`);
}

function logRepairDecision(
  config: CompileLoopConfig,
  decision: RepairDecision,
  reason: string,
  extra: Record<string, unknown> = {},
): void {
  previewLog('repair_decision', {
    buildId: config.revId,
    decision,
    reason,
    ...extra,
  });
  config.onLog(`[CompileGuard] Repair decision: ${decision} (${reason})`);
}

function logFinalStopReason(
  config: CompileLoopConfig,
  stopReason: string,
  extra: Record<string, unknown> = {},
): void {
  previewLog('final_stop_reason', {
    buildId: config.revId,
    stopReason,
    ...extra,
  });
  config.onLog(`[CompileGuard] Final stop reason: ${stopReason}`);
}

/**
 * Generate a minimal stub component that renders an error message.
 * Used as route-level fallback when a page file can't be fixed.
 */
function stubComponent(filePath: string, errorMsg: string): string {
  const name = filePath
    .replace(/^.*\//, '')
    .replace(/\.tsx?$/, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  const componentName = name.charAt(0).toUpperCase() + name.slice(1) || 'BrokenPage';
  const safeError = errorMsg.slice(0, 200).replace(/'/g, "\\'").replace(/\n/g, ' ');
  return [
    `export default function ${componentName}() {`,
    '  return (',
    '    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">',
    '      <div className="max-w-md text-center space-y-3">',
    `        <p className="text-lg font-semibold text-foreground">This page encountered an error</p>`,
    `        <p className="text-sm text-muted-foreground">${safeError}</p>`,
    `        <p className="text-xs text-muted-foreground">File: ${filePath}</p>`,
    '      </div>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/**
 * compileWithRetry — the self-correction loop.
 *
 * 1. Compile the candidate
 * 2. If success → return
 * 3. If failure → call fix agent with error context
 * 4. Write fix to the SAME candidate (additive)
 * 5. Recompile
 * 6. Repeat up to MAX_ATTEMPTS
 * 7. If all attempts fail → route-level recovery:
 *    replace the broken file with a stub, recompile once more
 */
export async function compileWithRetry(config: CompileLoopConfig): Promise<CompileLoopResult> {
  let executionAttempts = 0;
  let repairAttemptsUsed = 0;
  let budgetExhausted = false;
  let lastErrors: string[] = [];
  let lastClassification: RepairFailureClassification | null = null;
  let previousSignature: string | null = null;
  let nonFatalWithoutRepair = false;
  let stopReason = 'repair_not_started';
  const maxAttempts = getMaxRepairAttempts(config.revId);

  if (config.initialFailureErrors && config.initialFailureErrors.length > 0) {
    lastErrors = config.initialFailureErrors;
    executionAttempts = 1;
    lastClassification = classifyRepairFailure(lastErrors);
    previousSignature = lastClassification.signature;
    logFailureClassified(config, lastClassification, lastErrors);
  } else {
    executionAttempts = 1;
    const initialResult = await revisionManager.compileCandidate(config.revId);
    if (initialResult.success) {
      logRepairDecision(config, 'no_repair_needed', 'initial_compile_passed');
      logFinalStopReason(config, 'no_repair_needed');
      return {
        outcome: 'no_repair_needed',
        success: true,
        attempts: executionAttempts,
        stopReason: 'no_repair_needed',
        partialShip: false,
        degraded: false,
        minimumViableCandidate: true,
        budgetExhausted: false,
        failureClassification: null,
      };
    }
    lastErrors = initialResult.errors ?? ['Unknown compile error'];
    lastClassification = classifyRepairFailure(lastErrors);
    previousSignature = lastClassification.signature;
    logFailureClassified(config, lastClassification, lastErrors);
  }

  if (lastClassification.severity === 'non_fatal') {
    nonFatalWithoutRepair = true;
    stopReason = 'non_fatal_issue_no_repair';
    logRepairDecision(config, 'no_repair_needed', lastClassification.reason);
  }

  while (!nonFatalWithoutRepair && repairAttemptsUsed < maxAttempts) {
    repairAttemptsUsed++;
    previewLog('repair_attempt_started', {
      buildId: config.revId,
      attempt: repairAttemptsUsed,
      maxAttempts,
    });
    config.onLog(
      `[CompileGuard] Repair attempt ${repairAttemptsUsed}/${maxAttempts} started`,
    );

    if (!config.callFix) {
      stopReason = 'no_fix_agent_configured';
      logRepairDecision(config, 'stop', stopReason);
      break;
    }

    try {
      const filesFixed = await attemptFix(lastErrors, config, repairAttemptsUsed);
      if (filesFixed === 0) {
        stopReason = 'no_fix_output';
        logRepairDecision(config, 'stop', stopReason);
        break;
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      stopReason = 'fix_agent_error';
      config.onLog(`[CompileGuard] Fix agent error: ${String(e)} — stopping bounded repair`);
      logRepairDecision(config, 'stop', stopReason, {
        error: String(e),
      });
      break;
    }

    executionAttempts++;
    const result = await revisionManager.compileCandidate(config.revId);

    if (result.success) {
      stopReason = 'repair_succeeded';
      logFinalStopReason(config, stopReason, {
        attempts: executionAttempts,
      });
      return {
        outcome: 'repair_succeeded',
        success: true,
        attempts: executionAttempts,
        stopReason,
        partialShip: false,
        degraded: false,
        minimumViableCandidate: true,
        budgetExhausted: false,
        failureClassification: lastClassification,
      };
    }

    lastErrors = result.errors ?? ['Unknown compile error'];
    lastClassification = classifyRepairFailure(lastErrors);
    logFailureClassified(config, lastClassification, lastErrors);

    const progress = evaluateRepairProgress(previousSignature, lastClassification.signature);
    logProgressEvaluated(config, progress);
    previousSignature = lastClassification.signature;

    if (lastClassification.severity === 'non_fatal') {
      nonFatalWithoutRepair = true;
      stopReason = 'non_fatal_issue_after_repair';
      logRepairDecision(config, 'no_repair_needed', lastClassification.reason);
      break;
    }

    if (progress.status === 'no_progress') {
      stopReason = 'no_progress';
      logRepairDecision(config, 'stop', stopReason);
      break;
    }

    if (repairAttemptsUsed >= maxAttempts) {
      budgetExhausted = true;
      stopReason = 'repair_budget_exhausted';
      previewLog('repair_budget_exhausted', {
        buildId: config.revId,
        attemptsUsed: repairAttemptsUsed,
        maxAttempts,
      });
      config.onLog('[CompileGuard] Repair budget exhausted');
      break;
    }

    logRepairDecision(config, 'retry', lastClassification.reason, {
      nextAttempt: repairAttemptsUsed + 1,
    });
  }

  // ── Route-level recovery ──────────────────────────────────────────────────
  // Partial ship path: replace a broken route file with a stub component.
  // This is allowed only when the candidate can still boot successfully after
  // the substitution, which makes the result an explicit degraded candidate.
  const errorText = lastErrors.join('\n');
  const brokenFile = extractFileFromError(errorText);

  if (brokenFile && !isRouteFallbackTarget(brokenFile)) {
    if (stopReason === 'repair_not_started' || stopReason === 'no_fix_output') {
      stopReason = 'partial_ship_blocked_for_non_route_file';
    }
    config.onLog(`[CompileGuard] Partial ship blocked for non-route file: ${brokenFile}`);
    logRepairDecision(config, 'stop', stopReason);
  } else if (brokenFile) {
    const currentFiles = revisionManager.getRevisionFiles(config.revId) ?? {};
    const currentPaths = Object.keys(currentFiles);
    if (!currentPaths.includes(brokenFile) && config.recheckAdmission) {
      const approved = await config.recheckAdmission([...new Set([...currentPaths, brokenFile])]);
      if (!approved) {
        stopReason = 'partial_ship_rejected_by_admission';
        config.onLog(`[CompileGuard] Partial ship stub rejected for new path: ${brokenFile}`);
        logRepairDecision(config, 'stop', stopReason);
        logFinalStopReason(config, stopReason);
        commandBus.dispatch({ type: 'PREVIEW_FAILED', error: lastErrors.join('\n') });
        return {
          outcome: nonFatalWithoutRepair ? 'non_fatal_non_viable' : 'fatal_non_viable',
          success: false,
          attempts: executionAttempts,
          errors: lastErrors,
          stopReason,
          partialShip: false,
          degraded: false,
          minimumViableCandidate: false,
          budgetExhausted,
          failureClassification: lastClassification,
        };
      }
    } else if (!currentPaths.includes(brokenFile) && !config.recheckAdmission) {
      stopReason = 'partial_ship_blocked_for_new_path';
      config.onLog(`[CompileGuard] Partial ship blocked for new path: ${brokenFile}`);
      logRepairDecision(config, 'stop', stopReason);
      logFinalStopReason(config, stopReason);
      commandBus.dispatch({ type: 'PREVIEW_FAILED', error: lastErrors.join('\n') });
      return {
        outcome: nonFatalWithoutRepair ? 'non_fatal_non_viable' : 'fatal_non_viable',
        success: false,
        attempts: executionAttempts,
        errors: lastErrors,
        stopReason,
        partialShip: false,
        degraded: false,
        minimumViableCandidate: false,
        budgetExhausted,
        failureClassification: lastClassification,
      };
    }

    stopReason = stopReason === 'repair_not_started' ? 'partial_ship_candidate' : stopReason;
    logRepairDecision(config, 'partial_ship', `stub_${brokenFile}`);
    config.onLog(`[CompileGuard] Partial ship: stubbing ${brokenFile}`);
    const stub = stubComponent(brokenFile, lastErrors[0] ?? 'Compilation error');
    await revisionManager.writeCandidateFile(config.revId, '/' + brokenFile, stub);

    executionAttempts++;
    const recoveryResult = await revisionManager.compileCandidate(config.revId);
    if (recoveryResult.success) {
      stopReason = nonFatalWithoutRepair
        ? 'non_fatal_degraded_acceptable'
        : 'partial_ship';
      logFinalStopReason(config, stopReason, {
        partialShip: true,
        brokenFile,
      });
      config.onLog(
        `[CompileGuard] Partial ship succeeded — ${brokenFile} replaced with error stub`,
      );
      return {
        outcome: nonFatalWithoutRepair
          ? 'non_fatal_degraded_acceptable'
          : 'partial_ship',
        success: true,
        attempts: executionAttempts,
        errors: [`${brokenFile} replaced with error stub`],
        stopReason,
        partialShip: true,
        degraded: true,
        minimumViableCandidate: true,
        budgetExhausted,
        failureClassification: lastClassification,
      };
    }
    lastErrors = recoveryResult.errors ?? ['Partial ship compile failed'];
    lastClassification = classifyRepairFailure(lastErrors);
    logFailureClassified(config, lastClassification, lastErrors);
    const progress = evaluateRepairProgress(previousSignature, lastClassification.signature);
    logProgressEvaluated(config, progress);
    if (stopReason === 'repair_not_started' || stopReason === 'partial_ship_candidate') {
      stopReason = 'partial_ship_failed';
    }
    config.onLog('[CompileGuard] Partial ship compile also failed');
  }

  if (stopReason === 'repair_not_started') {
    stopReason = budgetExhausted ? 'repair_budget_exhausted' : 'fatal_candidate_unresolved';
  }

  logFinalStopReason(config, stopReason, {
    budgetExhausted,
  });
  config.onLog('[CompileGuard] ✗ Bounded repair stopped without viable candidate');
  commandBus.dispatch({ type: 'PREVIEW_FAILED', error: lastErrors.join('\n') });
  return {
    outcome: nonFatalWithoutRepair ? 'non_fatal_non_viable' : 'fatal_non_viable',
    success: false,
    attempts: executionAttempts,
    errors: lastErrors,
    stopReason,
    partialShip: false,
    degraded: false,
    minimumViableCandidate: false,
    budgetExhausted,
    failureClassification: lastClassification,
  };
}

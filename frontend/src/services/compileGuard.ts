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
import { canonicalizeProjectPath } from '../shared/safePaths';

const MAX_ATTEMPTS = 3;

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

interface CompileLoopResult {
  success:      boolean;
  attempts:     number;
  errors?:      string[];
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

async function readPreviewFile(filePath: string): Promise<string | null> {
  try {
    const resp = await fetch(`/__read_preview?path=${encodeURIComponent(filePath)}`);
    if (!resp.ok) return null;
    const data = await resp.json() as { ok?: boolean; content?: string };
    return data.ok ? (data.content ?? null) : null;
  } catch {
    return null;
  }
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
    const sourceCode = (await readPreviewFile(cleanSource))?.slice(0, 2000) ?? '';

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

    const content = await readPreviewFile(file);
    if (!content) {
      config.onLog(`[CompileGuard] Cannot read ${file}`);
      return 0;
    }

    prompt = `Fix this React/TypeScript compilation error (attempt ${attemptNum}/${MAX_ATTEMPTS}).

ERROR:
${errorText}

FILE: ${file}
${content}

Return the COMPLETE fixed file as a JSON artifact:
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
  let lastErrors: string[] = [];
  let nextAttempt = 1;

  if (config.initialFailureErrors && config.initialFailureErrors.length > 0) {
    lastErrors = config.initialFailureErrors;
    nextAttempt = 2;
    config.onLog('[CompileGuard] Continuing from failed fast gate result');

    if (!config.callFix) {
      config.onLog('[CompileGuard] No fix agent configured — skipping to recovery');
      nextAttempt = MAX_ATTEMPTS + 1;
    } else {
      try {
        const filesFixed = await attemptFix(lastErrors, config, 1);
        if (filesFixed === 0) {
          config.onLog('[CompileGuard] Fix agent produced no output — skipping to recovery');
          nextAttempt = MAX_ATTEMPTS + 1;
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        config.onLog(`[CompileGuard] Fix agent error: ${String(e)} — skipping to recovery`);
        nextAttempt = MAX_ATTEMPTS + 1;
      }
    }
  }

  for (let attempt = nextAttempt; attempt <= MAX_ATTEMPTS; attempt++) {
    config.onLog(`[CompileGuard] Compile attempt ${attempt}/${MAX_ATTEMPTS}...`);

    const result = await revisionManager.compileCandidate(config.revId);

    if (result.success) {
      if (attempt > 1) {
        config.onLog(`[CompileGuard] ✓ Compiled after ${attempt} attempt(s)`);
      }
      return { success: true, attempts: attempt };
    }

    lastErrors = result.errors ?? ['Unknown compile error'];
    config.onLog(`[CompileGuard] Compile failed: ${lastErrors[0]?.slice(0, 200)}`);

    if (attempt === MAX_ATTEMPTS) break; // fall through to route-level recovery

    if (!config.callFix) {
      config.onLog('[CompileGuard] No fix agent configured — skipping to recovery');
      break;
    }

    try {
      const filesFixed = await attemptFix(lastErrors, config, attempt);
      if (filesFixed === 0) {
        config.onLog('[CompileGuard] Fix agent produced no output — skipping to recovery');
        break;
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      config.onLog(`[CompileGuard] Fix agent error: ${String(e)} — skipping to recovery`);
      break;
    }
  }

  // ── Route-level recovery ──────────────────────────────────────────────────
  // Instead of total failure, replace the broken file with a stub component.
  // The rest of the app remains interactive — only the broken page shows an error.
  const errorText = lastErrors.join('\n');
  const brokenFile = extractFileFromError(errorText);

  if (brokenFile) {
    const currentFiles = revisionManager.getRevisionFiles(config.revId) ?? {};
    const currentPaths = Object.keys(currentFiles);
    if (!currentPaths.includes(brokenFile) && config.recheckAdmission) {
      const approved = await config.recheckAdmission([...new Set([...currentPaths, brokenFile])]);
      if (!approved) {
        config.onLog(`[CompileGuard] Recovery stub rejected for new path: ${brokenFile}`);
        commandBus.dispatch({ type: 'PREVIEW_FAILED', error: lastErrors.join('\n') });
        return { success: false, attempts: MAX_ATTEMPTS, errors: lastErrors };
      }
    } else if (!currentPaths.includes(brokenFile) && !config.recheckAdmission) {
      config.onLog(`[CompileGuard] Recovery blocked for new path: ${brokenFile}`);
      commandBus.dispatch({ type: 'PREVIEW_FAILED', error: lastErrors.join('\n') });
      return { success: false, attempts: MAX_ATTEMPTS, errors: lastErrors };
    }
    config.onLog(`[CompileGuard] Route-level recovery: stubbing ${brokenFile}`);
    const stub = stubComponent(brokenFile, lastErrors[0] ?? 'Compilation error');
    await revisionManager.writeCandidateFile(config.revId, '/' + brokenFile, stub);

    const recoveryResult = await revisionManager.compileCandidate(config.revId);
    if (recoveryResult.success) {
      config.onLog(`[CompileGuard] ✓ Recovered — ${brokenFile} replaced with stub, rest of app works`);
      return { success: true, attempts: MAX_ATTEMPTS, errors: [`${brokenFile} replaced with error stub`] };
    }
    config.onLog(`[CompileGuard] Recovery compile also failed — full failure`);
  }

  config.onLog(`[CompileGuard] ✗ All recovery attempts exhausted`);
  commandBus.dispatch({ type: 'PREVIEW_FAILED', error: lastErrors.join('\n') });
  return { success: false, attempts: MAX_ATTEMPTS, errors: lastErrors };
}

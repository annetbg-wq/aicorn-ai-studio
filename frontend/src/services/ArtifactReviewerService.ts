import type { ArtifactContract, ArtifactFile } from '../types/artifact';
import { parseArtifact, looksLikeSourceCode } from './artifactParser';
import type { AgentExecutionRoute } from './buildAgentRouting';
import { llmFetch } from './LLMProxy';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReviewerInput {
  intent: string;
  planContext?: string;
  artifact: ArtifactContract;
  qaRoute: AgentExecutionRoute;
  onLog: (msg: string) => void;
  signal?: AbortSignal;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Max characters per file content included in the AI repair prompt.
// Keeps the request inside a reasonable token budget.
const MAX_FILE_CONTENT_CHARS = 4_000;

// Hard cap on the total user-message string sent to the QA reviewer.
const MAX_TOTAL_PROMPT_CHARS = 40_000;

// ─── QA Reviewer system prompt ───────────────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are a strict Artifact Repair Agent.
Your ONLY job is to detect and repair structural issues in a JSON artifact before it is compiled.

REPAIR RULES — apply mechanically, in order:

1. NESTED ENVELOPE POLLUTION
   If any file.content is a JSON string that itself contains an "artifact" or "files" key
   with a nested files array, that file is corrupt.
   — Extract the real source code: find the nested file whose path matches this file's path,
     use its "content" field.
   — If no path match, use the first nested file whose content looks like real code
     (contains "import", "export", "function", "const", "return", or "=>").
   — If you still cannot extract clean code, REMOVE the file entirely.

2. FLAT FILE LIST
   artifact.files must be a flat array of { path, content } objects.
   Remove any element that is not a { path: string, content: string } object.

3. ENTRY POINT CONSISTENCY
   artifact.entry must match a path in artifact.files.
   If it does not, reassign entry in this priority:
     a) a file whose path ends in App.tsx
     b) a file whose path ends in index.tsx or main.tsx
     c) the first file in the list

4. TRIVIAL IMPORT CONSISTENCY
   Fix ONLY mechanical import paths broken by step 1 (e.g., a path that changed).
   Do NOT rewrite component logic or change any other code.

DO NOT:
- Rewrite, redesign, or improve any code
- Add new features, components, or pages
- Change naming, routing, or app structure beyond the four rules above

OUTPUT FORMAT — required:
{"artifact":{"entry":"src/App.tsx","files":[{"path":"src/App.tsx","content":"..."}]}}

No markdown fences. No text before or after. Output only the raw JSON object.
Preserve the original revisionId, routes, dependencies, and theme fields when present.`;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when a file's content string looks like a nested artifact
 * envelope — i.e., the LLM placed the entire JSON response inside a
 * single file body instead of flattening the files array.
 */
function isNestedEnvelope(value: string): boolean {
  const t = value.trim();
  if (!t.startsWith('{')) return false;
  return (/"artifact"\s*:/.test(t) || /"files"\s*:/.test(t)) && /"content"\s*:/.test(t);
}

/**
 * Attempts to extract real source code from a nested artifact envelope.
 * Returns the extracted content string, or null if extraction fails.
 */
function tryExtractFromEnvelope(
  envelopeContent: string,
  targetPath: string,
): string | null {
  try {
    const parsed = JSON.parse(envelopeContent.trim()) as Record<string, unknown>;
    const filesArr: unknown[] = (() => {
      if (Array.isArray(parsed.files)) return parsed.files;
      const inner = parsed.artifact;
      if (inner && typeof inner === 'object' && Array.isArray((inner as Record<string, unknown>).files)) {
        return (inner as Record<string, unknown>).files as unknown[];
      }
      return [];
    })();

    if (filesArr.length === 0) return null;

    // Normalise target path: strip leading slash + src/ prefix for comparison
    const norm = targetPath.replace(/^\/+/, '').replace(/^src\//, '');

    // Priority 1: exact path match
    for (const item of filesArr) {
      if (!item || typeof item !== 'object') continue;
      const f = item as Record<string, unknown>;
      if (typeof f.content !== 'string' || f.content.length < 30) continue;
      const fp = String(f.path ?? '').replace(/^\/+/, '').replace(/^src\//, '');
      if (fp === norm) return f.content;
    }

    // Priority 2: first item whose content looks like real source code
    for (const item of filesArr) {
      if (!item || typeof item !== 'object') continue;
      const f = item as Record<string, unknown>;
      if (typeof f.content !== 'string' || f.content.length < 50) continue;
      if (looksLikeSourceCode(f.content)) {
        return f.content;
      }
    }
  } catch {
    // Not parseable JSON — cannot extract
  }
  return null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ArtifactReviewerService {
  // ── Synchronous heuristic review ────────────────────────────────────────────
  // Preserved for the EDIT path. Throws on unrecoverable issues.

  static review(artifact: ArtifactContract): ArtifactContract {
    const { artifact: heuristicArtifact } =
      ArtifactReviewerService._deepHeuristicRepair(artifact, () => {});

    if (heuristicArtifact.files.length === 0) {
      throw new Error('ARTIFACT_SEMANTIC_PARSE_FAIL: 0 files after heuristic repair');
    }

    if (!heuristicArtifact.entry || !heuristicArtifact.files.find((file) => file.path === heuristicArtifact.entry)) {
      throw new Error('REVIEWER_FAIL: invalid entry point');
    }

    return heuristicArtifact;
  }

  // ── Deep heuristic repair ────────────────────────────────────────────────────
  // Extracts real source code from nested envelopes instead of just dropping
  // the file. Also repairs the entry pointer when it becomes stale.

  private static _deepHeuristicRepair(
    artifact: ArtifactContract,
    log: (msg: string) => void,
  ): { artifact: ArtifactContract; hadIssues: boolean } {
    let hadIssues = false;
    const repairedFiles: ArtifactFile[] = [];

    for (const file of artifact.files) {
      const trimmed = file.content.trim();

      if (isNestedEnvelope(trimmed)) {
        hadIssues = true;
        const extracted = tryExtractFromEnvelope(trimmed, file.path);
        if (extracted) {
          log(`[ArtifactReviewer] extracted real content from nested envelope in ${file.path}`);
          repairedFiles.push({ ...file, content: extracted });
        } else {
          log(`[ArtifactReviewer] ⚠ could not extract from envelope in ${file.path} — file dropped`);
          // File dropped intentionally: corrupt content, no recoverable source.
        }
      } else {
        repairedFiles.push(file);
      }
    }

    if (repairedFiles.length === 0 && artifact.files.length > 0) {
      log('[ArtifactReviewer] ⚠ all files were nested envelopes — artifact unrecoverable by heuristic');
      hadIssues = true;
    }

    // Repair stale entry pointer
    const hasEntry = repairedFiles.some(f => f.path === artifact.entry);
    if (!hasEntry && repairedFiles.length > 0) {
      hadIssues = true;
      const appFile  = repairedFiles.find(f => /App\.tsx$/i.test(f.path));
      const idxFile  = repairedFiles.find(f => /(?:index|main)\.tsx$/i.test(f.path));
      const newEntry = (appFile ?? idxFile ?? repairedFiles[0]).path;
      log(`[ArtifactReviewer] ⚠ entry '${artifact.entry}' not in files — reassigned to ${newEntry}`);
      return {
        artifact: { ...artifact, entry: newEntry, files: repairedFiles },
        hadIssues,
      };
    }

    return {
      artifact: { ...artifact, files: repairedFiles },
      hadIssues,
    };
  }

  // ── AI repair via QA slot ────────────────────────────────────────────────────

  private static async _callQAReviewer(
    artifact: ArtifactContract,
    input: ReviewerInput,
    qaRoute: AgentExecutionRoute,
  ): Promise<ArtifactContract | null> {
    // Build a compact representation of the artifact so we stay within token budget.
    const compactFiles = artifact.files.map(f => ({
      path: f.path,
      content: f.content.length > MAX_FILE_CONTENT_CHARS
        ? f.content.slice(0, MAX_FILE_CONTENT_CHARS) + '\n// [TRUNCATED FOR REVIEW]'
        : f.content,
    }));

    const artifactJson = JSON.stringify({
      artifact: {
        revisionId: artifact.revisionId,
        entry:      artifact.entry,
        files:      compactFiles,
        ...(artifact.routes       ? { routes:       artifact.routes }       : {}),
        ...(artifact.dependencies ? { dependencies: artifact.dependencies } : {}),
        ...(artifact.theme        ? { theme:        artifact.theme }        : {}),
      },
    });

    const userMessage = [
      `USER INTENT: ${input.intent.slice(0, 200)}`,
      input.planContext ? `PLAN CONTEXT (truncated):\n${input.planContext.slice(0, 500)}` : '',
      '',
      'ARTIFACT TO REPAIR:',
      artifactJson.slice(0, MAX_TOTAL_PROMPT_CHARS),
    ].filter(Boolean).join('\n');

    const body = JSON.stringify({
      model:       qaRoute.modelId,
      messages: [
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
      stream:      false,
      temperature: 0.1,
      max_tokens:  16_000,
    });

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${qaRoute.apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  window.location.origin,
    };

    const resp = await llmFetch(qaRoute.endpoint, headers, body);
    const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content) return null;

    const parseResult = parseArtifact(content);
    if (parseResult.success && parseResult.artifact) {
      // Restore revisionId from the original (parser assigns a new UUID)
      return { ...parseResult.artifact, revisionId: artifact.revisionId };
    }
    return null;
  }

  // ── Public async reviewer (NEW generation path) ──────────────────────────────
  // Called after parseArtifact() and before writeCandidateFile().
  // Runs deep heuristic repair first; only calls the QA LLM when heuristic
  // detected issues AND the QA slot has an API key configured.

  static async reviewWithAI(input: ReviewerInput): Promise<ArtifactContract> {
    const { artifact, onLog, qaRoute } = input;
    onLog(`[ArtifactReviewer] invoked — ${artifact.files.length} files to review`);

    // ── Step 1: Deep heuristic repair (always runs, free) ──────────────────
    const { artifact: heuristicArtifact, hadIssues } =
      ArtifactReviewerService._deepHeuristicRepair(artifact, onLog);

    if (heuristicArtifact.files.length === 0) {
      onLog('[ArtifactReviewer] semantic fail: 0 files remain after heuristic — classifying as retryable');
      // Prefix with ARTIFACT_SEMANTIC_PARSE_FAIL so SimpleGeneration can catch and
      // convert this into a retryable generation failure rather than a hard crash.
      throw new Error('ARTIFACT_SEMANTIC_PARSE_FAIL: 0 files after heuristic repair');
    }

    // ── Step 2: Decide whether AI review is needed ─────────────────────────
    if (!qaRoute.apiKey) {
      onLog('[ArtifactReviewer] QA route has no API key — using heuristic result only');
      return heuristicArtifact;
    }

    if (!hadIssues) {
      onLog('[ArtifactReviewer] heuristic found no issues — skipping AI review');
      return heuristicArtifact;
    }

    // ── Step 3: AI repair via QA slot ──────────────────────────────────────
    try {
      onLog('[ArtifactReviewer] AI review invoked (QA slot)');
      const aiArtifact = await ArtifactReviewerService._callQAReviewer(
        heuristicArtifact,
        input,
        qaRoute,
      );

      if (aiArtifact && aiArtifact.files.length > 0) {
        const before  = artifact.files.length;
        const after   = aiArtifact.files.length;
        const changed = aiArtifact.files.filter(f => {
          const orig = artifact.files.find(o => o.path === f.path);
          return !orig || orig.content !== f.content;
        }).length;
        onLog(
          `[ArtifactReviewer] changed files: ${before} → ${after} files (repaired ${changed})`,
        );
        return aiArtifact;
      }

      onLog('[ArtifactReviewer] AI reviewer returned empty result — using heuristic result');
    } catch (err) {
      onLog(
        `[ArtifactReviewer] AI review failed: ${String((err as Error)?.message ?? err)} — using heuristic result`,
      );
    }

    return heuristicArtifact;
  }
}

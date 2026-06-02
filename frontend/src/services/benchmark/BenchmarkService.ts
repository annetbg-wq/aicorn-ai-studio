/**
 * BenchmarkService — golden-intent benchmark harness for the studio.
 *
 * Runs a configurable subset of golden intents through the real
 * GenerationPipeline and collects structured results.
 *
 * Usage (from browser console or a UI button):
 *   import { BenchmarkService } from './services/benchmark/BenchmarkService';
 *   const report = await BenchmarkService.run({ apiKey, modelId });
 *   // report.json + report.markdown are ready
 *
 * Does NOT auto-run on app load.
 */

import { GenerationEngine as GenerationPipeline } from '../GenerationEngine';
import { ConfigService } from '../ConfigService';
import { resolveStandardRoute } from '../buildAgentRouting';
import { goldenIntents, type GoldenIntent, type IntentCategory } from './goldenIntents';
import { goldenTests, type GoldenTest } from './goldenTests';
import { parseArtifact } from '../artifactParser';
import {
  computeSummary,
  renderMarkdownSummary,
  type BenchmarkReport,
  type BenchmarkOutcome,
  type IntentRunResult,
} from './BenchmarkReport';
import { BaselineStore } from './BaselineStore';
import type { GenerationResult } from '../../shared/projectModel';

// ── Golden Suite types ─────────────────────────────────────────────────────

export interface GoldenTestDetail {
  testId:          string;
  passed:          boolean;
  durationMs:      number;
  /** true when parseArtifact().success === true */
  parsedOk:        boolean;
  /** true when App.tsx exists and contains valid JSX markers */
  appTsxValid:     boolean;
  /** Files from expectedFiles that were NOT found in output */
  missingFiles:    string[];
  /** Files detected as truncated (unclosed brackets) */
  truncatedFiles:  string[];
  error:           string | null;
}

export interface GoldenSuiteResult {
  total:    number;
  passed:   number;
  failed:   number;
  avgTimeMs: number;
  details:  GoldenTestDetail[];
}

// ── Config ──────────────────────────────────────────────────────────────────

export interface BenchmarkRunConfig {
  apiKey:       string;
  modelId:      string;
  fixModelId?:  string;
  /** Run only these intent ids. Omit or [] to run all 15. */
  intentIds?:   string[];
  /** Run only these categories. Omit or [] to run all. */
  categories?:  IntentCategory[];
  /** Called after each intent completes. */
  onProgress?:  (completed: number, total: number, last: IntentRunResult) => void;
  /** AbortSignal to cancel the entire run. */
  signal?:      AbortSignal;
}

export interface BenchmarkRunOutput {
  report:   BenchmarkReport;
  json:     string;
  markdown: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function selectIntents(cfg: BenchmarkRunConfig): GoldenIntent[] {
  let pool = [...goldenIntents];
  if (cfg.categories && cfg.categories.length > 0) {
    const cats = new Set(cfg.categories);
    pool = pool.filter(i => cats.has(i.category));
  }
  if (cfg.intentIds && cfg.intentIds.length > 0) {
    const ids = new Set(cfg.intentIds);
    pool = pool.filter(i => ids.has(i.id));
  }
  return pool;
}

function classifyOutcome(result: GenerationResult): {
  outcome: BenchmarkOutcome;
  blockingCodes: string[];
} {
  // Failed generation
  if (result.status === 'failed' || result.status === 'cancelled') {
    return { outcome: 'failed', blockingCodes: [] };
  }

  // RuntimeGuard blocked preview
  if (result.runtimeGuard && !result.runtimeGuard.passed) {
    return {
      outcome: 'blocked',
      blockingCodes: result.runtimeGuard.repairPayload.reasons.map(r => r.code),
    };
  }

  // IntegrityGuard blocked
  if (result.integrityGuard && !result.integrityGuard.passed) {
    return {
      outcome: 'blocked',
      blockingCodes: result.integrityGuard.errors.map(e => e.code),
    };
  }

  // IntegrationReport unhealthy
  if (result.integrationReport && !result.integrationReport.isHealthy) {
    return {
      outcome: 'blocked',
      blockingCodes: result.integrationReport.unresolvedIssues.map(i => i.kind),
    };
  }

  return { outcome: 'preview-ready', blockingCodes: [] };
}

// ── Golden Suite helpers ───────────────────────────────────────────────────

/** Check if a file has unclosed brackets (likely truncated by LLM). */
function isTruncated(content: string): boolean {
  let braces  = 0;
  let parens  = 0;
  let backticks = 0;

  for (const ch of content) {
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (ch === '`') backticks++;
  }

  // Odd backticks = unclosed template literal; positive braces/parens = unclosed block
  return braces > 0 || parens > 0 || backticks % 2 !== 0;
}

/** Check that App.tsx has minimal valid JSX structure. */
function isValidAppTsx(content: string): boolean {
  if (!content || content.trim().length < 30) return false;
  // Must have at least one JSX return and a function/const component
  const hasComponent = /(?:function\s+App|const\s+App\s*=)/.test(content);
  const hasJsx = /return\s*\(?\s*</.test(content);
  const hasExport = /export\s+(?:default\s+)?(?:function\s+)?App|export\s+default\s+App/.test(content);
  return hasComponent && hasJsx && hasExport;
}

async function runSingleGoldenTest(
  test: GoldenTest,
  apiKey: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<GoldenTestDetail> {
  const primaryRoute = resolveStandardRoute('primary');
  const buildRoute   = resolveStandardRoute('build');
  const fixRoute     = resolveStandardRoute('fix');
  const qaRoute      = resolveStandardRoute('qa');

  console.log(`[GoldenSuite] routes: primary=${primaryRoute.modelId} build=${buildRoute.modelId}`);

  const t0 = performance.now();
  let rawResponse = '';
  let error: string | null = null;

  try {
    await GenerationPipeline.run({
      intent:       test.prompt,
      history:      [],
      files:        {},
      primaryRoute,
      buildRoute,
      fixRoute,
      qaRoute,
      apiKey:    buildRoute.apiKey,
      modelId:   buildRoute.modelId,
      onStream: (chunk: string) => { rawResponse += chunk; },
      onFiles:  () => {},
      onPhase:  () => {},
      onLog:    () => {},
      onPlan:   () => {},
      signal,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Math.round(performance.now() - t0);

  // 1. Parse artifact
  const parsed = parseArtifact(rawResponse);
  if (!parsed.success || !parsed.artifact) {
    return {
      testId: test.id, passed: false, durationMs,
      parsedOk: false, appTsxValid: false,
      missingFiles: [...test.expectedFiles], truncatedFiles: [],
      error: error ?? parsed.error ?? 'Artifact parse failed',
    };
  }

  // Build path→content map from artifact files
  const fileMap: Record<string, string> = {};
  for (const f of parsed.artifact.files) {
    fileMap[f.path] = f.content;
  }
  const filePaths = Object.keys(fileMap);

  // 2. Expected files check
  const missingFiles = test.expectedFiles.filter(
    expected => !filePaths.some(p => p.endsWith(expected)),
  );

  // 3. App.tsx validity
  const appEntry = parsed.artifact.files.find(f => /App\.tsx$/i.test(f.path));
  const appTsxValid = appEntry ? isValidAppTsx(appEntry.content) : false;

  // 4. Truncation check
  const truncatedFiles: string[] = [];
  for (const f of parsed.artifact.files) {
    if (/\.(tsx?|jsx?)$/.test(f.path) && isTruncated(f.content)) {
      truncatedFiles.push(f.path);
    }
  }

  const passed = missingFiles.length === 0
    && appTsxValid
    && truncatedFiles.length === 0;

  return {
    testId: test.id, passed, durationMs,
    parsedOk: true, appTsxValid, missingFiles, truncatedFiles,
    error,
  };
}

// ── Main runner ─────────────────────────────────────────────────────────────

async function runSingleIntent(
  intent: GoldenIntent,
  cfg: BenchmarkRunConfig,
): Promise<IntentRunResult> {
  const t0 = performance.now();
  let genResult: GenerationResult | null = null;
  let error: string | null = null;

  const bPrimaryRoute = resolveStandardRoute('primary');
  const bBuildRoute   = resolveStandardRoute('build');
  const bFixRoute     = resolveStandardRoute('fix');
  const bQaRoute      = resolveStandardRoute('qa');
  try {
    genResult = await GenerationPipeline.run({
      intent:       intent.prompt,
      history:      [],
      files:        {},
      primaryRoute: bPrimaryRoute,
      buildRoute:   bBuildRoute,
      fixRoute:     bFixRoute,
      qaRoute:      bQaRoute,
      apiKey:    bBuildRoute.apiKey,
      modelId:   bBuildRoute.modelId,
      fixModelId: bFixRoute.modelId,
      onStream: () => {},
      onFiles:  () => {},
      onPhase:  () => {},
      onLog:    () => {},
      onPlan:   () => {},
      signal:   cfg.signal,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Math.round(performance.now() - t0);

  if (!genResult || error) {
    return {
      intentId:      intent.id,
      category:      intent.category,
      modelId:       cfg.modelId,
      durationMs,
      fileCount:     0,
      routeCount:    0,
      featureCount:  0,
      outcome:       'failed',
      blockingCodes: [],
      error:         error ?? genResult?.error ?? 'No result returned',
    };
  }

  const { outcome, blockingCodes } = classifyOutcome(genResult);
  const graph = genResult.graph;

  return {
    intentId:      intent.id,
    category:      intent.category,
    modelId:       genResult.usedModel || cfg.modelId,
    durationMs,
    fileCount:     graph.files.length,
    routeCount:    graph.routes.length,
    featureCount:  graph.features.length,
    outcome,
    blockingCodes,
    error:         genResult.error ?? null,
    visualQuality: genResult.visualQualitySummary
      ? {
          score: genResult.visualQualitySummary.score,
          verdict: genResult.visualQualitySummary.verdict,
          reasons: genResult.visualQualitySummary.reasons,
          notes: genResult.visualQualitySummary.notes,
        }
      : undefined,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export const BenchmarkService = {
  /** All available golden intents. */
  intents: goldenIntents,

  /**
   * Run the benchmark. Returns JSON report and markdown summary.
   * Does NOT run automatically — must be called explicitly.
   */
  async run(cfg: BenchmarkRunConfig): Promise<BenchmarkRunOutput> {
    const intents = selectIntents(cfg);
    if (intents.length === 0) {
      throw new Error('[BenchmarkService] No intents matched the filter — nothing to run.');
    }

    const runId = `bench-${Date.now().toString(36)}`;
    const startedAt = new Date().toISOString();
    const results: IntentRunResult[] = [];

    console.log(
      `[BenchmarkService] ── run started: ${runId} | ${intents.length} intent(s) | model=${cfg.modelId} ──`,
    );

    for (let i = 0; i < intents.length; i++) {
      if (cfg.signal?.aborted) {
        console.warn('[BenchmarkService] Aborted by signal.');
        break;
      }

      const intent = intents[i];
      console.log(`[BenchmarkService] [${i + 1}/${intents.length}] Running: ${intent.id} (${intent.category})`);

      const result = await runSingleIntent(intent, cfg);
      results.push(result);

      console.log(
        `[BenchmarkService] [${i + 1}/${intents.length}] ${intent.id}: ${result.outcome}` +
          ` | files=${result.fileCount} routes=${result.routeCount} features=${result.featureCount}` +
          ` | ${(result.durationMs / 1000).toFixed(1)}s` +
          (result.blockingCodes.length > 0 ? ` | blocking: ${result.blockingCodes.join(',')}` : ''),
      );

      cfg.onProgress?.(i + 1, intents.length, result);
    }

    const finishedAt = new Date().toISOString();
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);
    const summary = computeSummary(results);

    const report: BenchmarkReport = {
      version: 1,
      runId,
      startedAt,
      finishedAt,
      modelId: cfg.modelId,
      totalMs,
      results,
      summary,
    };

    const json     = JSON.stringify(report, null, 2);
    const markdown = renderMarkdownSummary(report);

    console.log(`[BenchmarkService] ── run complete: ${runId} ──`);
    console.log(markdown);

    return { report, json, markdown };
  },

  /**
   * Lightweight per-generation quality check.
   * Synchronous, no LLM calls — runs after every generation.
   * Returns score 0-100, warnings, and blockers.
   */
  check(
    files: Record<string, string>,
    plan?: { pages?: Array<{ name?: string; file?: string }> } | null,
  ): { score: number; passed: boolean; warnings: string[]; blockers: string[] } {
    const warnings: string[] = [];
    const blockers: string[] = [];
    let score = 100;

    const filePaths = Object.keys(files).filter(p => !p.startsWith('_'));
    const codeFiles = filePaths.filter(p => /\.(tsx?|jsx?)$/.test(p));

    // Must produce at least one code file
    if (codeFiles.length === 0) {
      blockers.push('No code files generated');
      score -= 40;
    } else {
      // App.tsx is only required when no other code files exist.
      // Skeleton-based pipelines (ProtoPipeline) ship App.tsx in the locked
      // skeleton and emit only delta pages/hooks/components, so the absence
      // of App.tsx in the delta output is normal — not a blocker.
      const hasApp = codeFiles.some(p => p.endsWith('App.tsx') || p.endsWith('App.jsx'));
      if (!hasApp && codeFiles.length === 0) {
        blockers.push('App.tsx missing from output');
        score -= 30;
      } else if (!hasApp) {
        // Non-blocking note — user's app.tsx comes from the skeleton.
        score -= 2;
      }
    }

    // Plan page coverage
    const planPages = plan?.pages ?? [];
    if (planPages.length > 1) {
      for (const page of planPages) {
        const expectedFile = page.file ?? `${page.name}.tsx`;
        const found = codeFiles.some(p => p.includes(expectedFile.replace(/^(src\/)?/, '')));
        if (!found) {
          warnings.push(`Plan page "${page.name ?? expectedFile}" not found in output`);
          score -= 5;
        }
      }
      // Multi-page but too few files
      if (codeFiles.length < 3) {
        warnings.push(`Plan has ${planPages.length} pages but only ${codeFiles.length} code files generated`);
        score -= 10;
      }
    }

    // Tiny files
    for (const [path, content] of Object.entries(files)) {
      if (/\.(tsx?|jsx?)$/.test(path) && content.trim().length < 50) {
        warnings.push(`${path} is suspiciously small (${content.trim().length} chars)`);
        score -= 3;
      }
    }

    score = Math.max(0, Math.min(100, score));
    return { score, passed: blockers.length === 0, warnings, blockers };
  },

  /**
   * Persist a completed report to Supabase as a stored baseline.
   * Called automatically by BenchmarkGate; also available for manual promotion.
   */
  async promoteAsBaseline(report: BenchmarkReport): Promise<void> {
    await BaselineStore.save(report);
  },

  /** All available golden tests. */
  goldenTests,

  /**
   * Run the full golden test suite (10 prompts) through SimpleGeneration.
   *
   * For each test validates:
   *   1. parseArtifact().success === true
   *   2. All expectedFiles present in output
   *   3. App.tsx exists and contains valid JSX
   *   4. No truncated files (unclosed brackets)
   *   5. Generation time
   *
   * Returns aggregate { total, passed, failed, avgTimeMs, details }.
   */
  async runGoldenSuite(
    apiKey: string,
    modelId: string,
    opts?: {
      testIds?: string[];
      signal?: AbortSignal;
      onProgress?: (completed: number, total: number, last: GoldenTestDetail) => void;
    },
  ): Promise<GoldenSuiteResult> {
    let tests = [...goldenTests];
    if (opts?.testIds && opts.testIds.length > 0) {
      const ids = new Set(opts.testIds);
      tests = tests.filter(t => ids.has(t.id));
    }

    if (tests.length === 0) {
      throw new Error('[BenchmarkService] No golden tests matched — nothing to run.');
    }

    console.log(
      `[BenchmarkService] ── golden suite started | ${tests.length} test(s) | model=${modelId} ──`,
    );

    const details: GoldenTestDetail[] = [];

    for (let i = 0; i < tests.length; i++) {
      if (opts?.signal?.aborted) {
        console.warn('[BenchmarkService] Golden suite aborted by signal.');
        break;
      }

      const test = tests[i];
      console.log(`[GoldenSuite] [${i + 1}/${tests.length}] Running: ${test.id}`);

      const detail = await runSingleGoldenTest(test, apiKey, modelId, opts?.signal);
      details.push(detail);

      const icon = detail.passed ? 'PASS' : 'FAIL';
      console.log(
        `[GoldenSuite] [${i + 1}/${tests.length}] ${test.id}: ${icon}` +
          ` | parse=${detail.parsedOk ? 'ok' : 'FAIL'}` +
          ` | app=${detail.appTsxValid ? 'ok' : 'FAIL'}` +
          ` | missing=${detail.missingFiles.length}` +
          ` | truncated=${detail.truncatedFiles.length}` +
          ` | ${(detail.durationMs / 1000).toFixed(1)}s`,
      );

      opts?.onProgress?.(i + 1, tests.length, detail);
    }

    const passed = details.filter(d => d.passed).length;
    const failed = details.length - passed;
    const totalMs = details.reduce((s, d) => s + d.durationMs, 0);
    const avgTimeMs = details.length > 0 ? Math.round(totalMs / details.length) : 0;

    const result: GoldenSuiteResult = { total: details.length, passed, failed, avgTimeMs, details };

    console.log(
      `[BenchmarkService] ── golden suite complete | ${passed}/${details.length} passed | avg ${(avgTimeMs / 1000).toFixed(1)}s ──`,
    );

    return result;
  },
};

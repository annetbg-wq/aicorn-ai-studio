/**
 * GenerationQualityService — lightweight per-run quality evaluator.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT BenchmarkGate.
 *
 * Two-level quality model:
 *
 *   GenerationQualityService   (this file)
 *   ─────────────────────────
 *   • Evaluates ONE generation result from the current run.
 *   • Cheap: no LLM calls, no network, no golden-intent replay.
 *   • Fast: runs synchronously after every generation.
 *   • Reads structured signals already present in the result:
 *       changePackage.guardResults, routeManifest, previewMeta,
 *       changePackage.warnings, changePackage.repairHints.
 *
 *   BenchmarkGate              (benchmark/BenchmarkGate.ts)
 *   ──────────────────────────
 *   • Replays a suite of golden intents through the real pipeline.
 *   • Expensive: 5–15 real LLM runs, Supabase baseline storage.
 *   • Used as a release / regression gate, NOT after every prompt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Blocking conditions (severity = 'blocking'):
 *   - status is 'failed' or 'cancelled'
 *   - entry file absent from generated files
 *   - changePackage.guardResults.integrity.passed === false
 *   - changePackage.guardResults.runtime.passed === false
 *
 * Non-blocking conditions (severity = 'warning'):
 *   - changePackage.warnings is non-empty
 *   - changePackage.repairHints is non-empty
 *
 * Does NOT call BenchmarkGate.check() or BaselineStore.
 * Does NOT scan raw file content strings as its primary logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { GenerationResult, GenerationQualitySummary } from '../../shared/projectModel';

// Re-export so callers can import the type from this module if they prefer.
export type { GenerationQualitySummary } from '../../shared/projectModel';

// ── Public API ────────────────────────────────────────────────────────────────

export const GenerationQualityService = {
  /**
   * Evaluate the quality of a single generation result.
   *
   * Reads exclusively from structured fields in the result —
   * changePackage.guardResults, routeManifest, previewMeta,
   * changePackage.warnings, changePackage.repairHints.
   *
   * Never calls BenchmarkGate, BaselineStore, or any golden-intent runner.
   * Never performs raw code string scanning as the primary check logic.
   *
   * safe to call on any GenerationResult regardless of status.
   */
  evaluate(result: GenerationResult): GenerationQualitySummary {
    const cp = result.changePackage;

    // ── 1. Entry file ─────────────────────────────────────────────────────────
    // Source of truth: changePackage.previewMeta.entryFile
    // Verification: the declared entry is present in graph.files or operations.
    const declaredEntry = cp.previewMeta?.entryFile ?? '';
    const allFilePaths  = result.graph.files.map(f => f.path);
    // FileOperation is a discriminated union; 'rename' uses from/to, others use name.
    const allOpsNames   = result.operations.flatMap(op =>
      op.op === 'rename' ? [op.from, op.to] : [op.name],
    );

    const previewEntryPresent =
      declaredEntry !== '' &&
      (
        allFilePaths.some(p =>
          p === declaredEntry ||
          p.endsWith('/App.tsx') ||
          p === 'App.tsx',
        ) ||
        allOpsNames.some(n =>
          n === declaredEntry ||
          n.endsWith('/App.tsx') ||
          n === 'src/App.tsx',
        )
      );

    // ── 2. Routes ─────────────────────────────────────────────────────────────
    // routeManifest.routes is canonical; graph.routes is the secondary source.
    const routeManifestRoutes = cp.routeManifest?.routes ?? [];
    const graphRoutes         = result.graph.routes ?? [];
    const totalRouteCount     = routeManifestRoutes.length || graphRoutes.length;
    const hasRoutesInfo       = totalRouteCount > 0;

    // ── 3. Guard results ──────────────────────────────────────────────────────
    // Read from changePackage.guardResults — the canonical guard location.
    const guardIntegrityPassed = cp.guardResults?.integrity?.passed ?? true;
    const guardRuntimePassed   = cp.guardResults?.runtime?.passed   ?? true;

    // ── 4. Warnings and repair hints ──────────────────────────────────────────
    // changePackage.warnings is string[].
    // changePackage.repairHints is RepairHint[] (code, filePath, message).
    const cpWarnings    = cp.warnings    ?? [];
    const cpRepairHints = cp.repairHints ?? [];

    const hasWarnings    = cpWarnings.length    > 0;
    const hasRepairHints = cpRepairHints.length > 0;

    // ── 5. Multi-page and dependencies ───────────────────────────────────────
    const multiPageDeclared    = (cp.routeManifest?.isMultiPage ?? false) || graphRoutes.length > 1;
    const dependenciesDeclared = (cp.dependencies ?? []).length > 0;

    // ── Blockers (hard failures) ──────────────────────────────────────────────
    const blockers: string[] = [];

    if (result.status === 'failed' || result.status === 'cancelled') {
      blockers.push(
        `generation status: ${result.status}${result.error ? ` — ${result.error}` : ''}`,
      );
    }

    if (!previewEntryPresent) {
      blockers.push(
        `entry file absent from generation output (declared: "${declaredEntry}", not found in graph.files)`,
      );
    }

    if (!guardIntegrityPassed) {
      const errCount = cp.guardResults?.integrity?.errorCount ?? 0;
      const codes    = (cp.guardResults?.integrity?.errors ?? []).map(e => e.code).join(', ');
      blockers.push(
        `integrity guard failed — ${errCount} error(s)${codes ? `: ${codes}` : ''}`,
      );
    }

    if (!guardRuntimePassed) {
      const reasons = (cp.guardResults?.runtime?.reasons ?? []).map(r => r.code).join(', ');
      blockers.push(`runtime guard failed${reasons ? `: ${reasons}` : ''}`);
    }

    // ── Warning messages to surface ───────────────────────────────────────────
    // Soft issues — do NOT block preview or project save.
    const warnMessages: string[] = [...cpWarnings];

    if (hasRepairHints) {
      // ChangePackage.repairHints shape: { code: string; strategy: 'block' | 'auto-fix' | 'retry' }
      cpRepairHints.forEach(h =>
        warnMessages.push(`[repair-hint:${h.code}] strategy=${h.strategy}`),
      );
    }

    // ── Severity ──────────────────────────────────────────────────────────────
    const severity: GenerationQualitySummary['severity'] =
      blockers.length > 0   ? 'blocking' :
      warnMessages.length > 0 ? 'warning'  :
      'ok';

    const passed    = blockers.length === 0;
    const fileCount = result.graph.files.length;

    // ── Summary line ──────────────────────────────────────────────────────────
    const summary = passed
      ? [
          `ok — ${fileCount} file(s), entry present`,
          hasRoutesInfo   ? `${totalRouteCount} route(s)` : null,
          warnMessages.length > 0 ? `${warnMessages.length} warning(s)` : null,
        ].filter(Boolean).join(', ')
      : `blocking — ${blockers[0]}`;

    return {
      passed,
      severity,
      checks: {
        previewEntryPresent,
        hasRoutesInfo,
        guardIntegrityPassed,
        guardRuntimePassed,
        hasWarnings,
        hasRepairHints,
        multiPageDeclared,
        dependenciesDeclared,
      },
      blockers,
      warnings: warnMessages,
      summary,
    };
  },
};

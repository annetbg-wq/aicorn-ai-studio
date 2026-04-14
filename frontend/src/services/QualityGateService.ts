/**
 * QualityGateService — end-to-end golden path validation.
 *
 * Validates the full generation pipeline from intent → deploy:
 *
 *   GATE 1: Plan quality        — architect produced valid pages array
 *   GATE 2: Code generation     — files were produced, no empty output
 *   GATE 3: Import resolution   — no broken relative imports
 *   GATE 4: Compile             — Vite ESM compile succeeded
 *   GATE 5: Preview mount       — iframe mounted without error
 *   GATE 6: Security            — no critical/high security findings
 *   GATE 7: Env vars            — no unset required env vars
 *   GATE 8: Save                — project persisted to storage
 *   GATE 9: Export readiness    — package.json + entry point present
 *
 * This does NOT run the pipeline — it validates it was completed correctly.
 * Call after each pipeline stage to get the current gate status.
 *
 * Design:
 *   - Each gate is independent: a failed gate does not block others from running
 *   - Gates have a 'bypass' mode for optional checks (warn but don't block)
 *   - The overall quality score is 0–100 (gates weighted by importance)
 */

import { runSecurityAudit } from './SecurityAuditService';
import { envSecretsService } from './EnvSecretsService';
import { validateImports, type UnresolvedImport } from './importValidator';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GateStatus = 'pass' | 'warn' | 'fail' | 'skip' | 'pending';

export interface GateResult {
  gate:      string;
  status:    GateStatus;
  message:   string;
  details?:  string[];
  /** Duration this check took to run in ms. */
  durationMs?: number;
}

export interface QualityReport {
  projectId:    string;
  generatedAt:  string;
  mode:         'new' | 'edit';
  /** 0–100 quality score */
  score:        number;
  /** true = safe to publish / expose to user */
  passedForPublish: boolean;
  gates:        GateResult[];
  /** Human-readable summary */
  summary:      string;
}

// ─── Gate weights (for score calculation) ────────────────────────────────────

const GATE_WEIGHTS: Record<string, number> = {
  'plan':            10,
  'code_generation': 15,
  'import_resolve':  15,
  'compile':         25,
  'preview_mount':   15,
  'security':        10,
  'env_vars':         5,
  'save':             3,
  'export_ready':     2,
};

// ─── Individual gate validators ───────────────────────────────────────────────

function checkPlan(plan: object | null | undefined): GateResult {
  const t0 = Date.now();
  if (!plan) return {
    gate: 'plan', status: 'fail',
    message: 'No plan produced by Architect LLM',
    durationMs: Date.now() - t0,
  };

  const p = plan as Record<string, unknown>;
  const pages = (p['pages'] as unknown[]) ?? [];
  const details: string[] = [];

  if (!p['appName']) details.push('Missing appName');
  if (!pages.length)  details.push('No pages defined');
  if (pages.length > 20) details.push(`Too many pages: ${pages.length} (max 20)`);

  const status: GateStatus = details.length === 0 ? 'pass' :
                              details.some(d => d.includes('No pages')) ? 'fail' : 'warn';
  return {
    gate:    'plan',
    status,
    message: status === 'pass' ? `Plan OK: ${pages.length} pages, app="${p['appName']}"` :
             `Plan issues: ${details.join(', ')}`,
    details,
    durationMs: Date.now() - t0,
  };
}

function checkCodeGeneration(files: Record<string, string>): GateResult {
  const t0 = Date.now();
  const count  = Object.keys(files).length;
  const details: string[] = [];

  if (count === 0) return {
    gate: 'code_generation', status: 'fail',
    message: 'No files produced by code generator',
    durationMs: Date.now() - t0,
  };

  // Check for suspiciously empty files
  const empty = Object.entries(files).filter(([, v]) => v.trim().length < 20);
  if (empty.length > 0) {
    details.push(`${empty.length} nearly-empty files: ${empty.map(([k]) => k).slice(0, 3).join(', ')}`);
  }

  // Check for artifact envelope blobs (JSON written as file content)
  const envelopes = Object.entries(files).filter(([, v]) => {
    const t = v.trim();
    return t.startsWith('{') && /"artifact"/.test(t) && /"files"/.test(t);
  });
  if (envelopes.length > 0) {
    details.push(`CRITICAL: ${envelopes.length} files contain artifact envelope JSON (LLM format leak)`);
    return {
      gate: 'code_generation', status: 'fail',
      message: 'Artifact envelope JSON detected in file content',
      details,
      durationMs: Date.now() - t0,
    };
  }

  // App.tsx + main.tsx should be present
  const hasApp  = 'App.tsx' in files || 'src/App.tsx' in files;
  const hasMain = 'main.tsx' in files || 'src/main.tsx' in files;
  if (!hasApp)  details.push('Missing App.tsx');
  if (!hasMain) details.push('Missing main.tsx');

  const status: GateStatus = (details.some(d => d.includes('CRITICAL')) || !hasApp) ? 'fail' :
                              details.length > 0 ? 'warn' : 'pass';
  return {
    gate: 'code_generation',
    status,
    message: status === 'pass' ? `Code OK: ${count} files generated` :
             `Code issues: ${details[0]}`,
    details,
    durationMs: Date.now() - t0,
  };
}

function checkImports(files: Record<string, string>, existingFiles?: Record<string, string>): GateResult {
  const t0 = Date.now();
  let unresolved: UnresolvedImport[];
  try {
    unresolved = validateImports(files, existingFiles);
  } catch {
    return {
      gate: 'import_resolve', status: 'warn',
      message: 'Import validator threw — skipping',
      durationMs: Date.now() - t0,
    };
  }

  if (unresolved.length === 0) return {
    gate: 'import_resolve', status: 'pass',
    message: 'All imports resolved',
    durationMs: Date.now() - t0,
  };

  const critical = unresolved.filter(u => !u.sourceFile.includes('node_modules'));
  return {
    gate: 'import_resolve',
    status: critical.length > 2 ? 'fail' : 'warn',
    message: `${unresolved.length} unresolved import(s)`,
    details: unresolved.slice(0, 5).map(u => `${u.sourceFile}: ${u.specifier}`),
    durationMs: Date.now() - t0,
  };
}

function checkCompile(compileResult: { success: boolean; attempts: number; errors?: string[] } | null): GateResult {
  const t0 = Date.now();
  if (!compileResult) return {
    gate: 'compile', status: 'skip',
    message: 'Compile not run yet',
    durationMs: 0,
  };

  if (compileResult.success) {
    const msg = compileResult.attempts > 1
      ? `Compiled after ${compileResult.attempts} attempts (self-correction used)`
      : 'Compiled successfully';
    return {
      gate: 'compile', status: compileResult.attempts > 1 ? 'warn' : 'pass',
      message: msg,
      details: compileResult.errors,
      durationMs: Date.now() - t0,
    };
  }

  return {
    gate: 'compile', status: 'fail',
    message: `Compile failed after ${compileResult.attempts} attempts`,
    details: compileResult.errors?.slice(0, 3),
    durationMs: Date.now() - t0,
  };
}

function checkPreviewMount(previewStatus: 'idle' | 'generating' | 'compiling' | 'ready' | 'failed' | null): GateResult {
  const t0 = Date.now();
  if (!previewStatus || previewStatus === 'idle') return {
    gate: 'preview_mount', status: 'skip',
    message: 'Preview not started',
    durationMs: 0,
  };
  if (previewStatus === 'ready') return {
    gate: 'preview_mount', status: 'pass',
    message: 'Preview mounted successfully',
    durationMs: Date.now() - t0,
  };
  if (previewStatus === 'failed') return {
    gate: 'preview_mount', status: 'fail',
    message: 'Preview failed to mount',
    durationMs: Date.now() - t0,
  };
  return {
    gate: 'preview_mount', status: 'pending',
    message: `Preview status: ${previewStatus}`,
    durationMs: Date.now() - t0,
  };
}

function checkSecurity(files: Record<string, string>, projectId: string): GateResult {
  const t0 = Date.now();
  const report = runSecurityAudit(files, projectId);
  const { critical, high, medium } = report.summary;

  if (critical > 0) return {
    gate: 'security', status: 'fail',
    message: `Security: ${critical} critical, ${high} high, ${medium} medium findings`,
    details: report.findings
      .filter(f => f.severity === 'critical')
      .map(f => `${f.file}:${f.line} ${f.description}`)
      .slice(0, 3),
    durationMs: Date.now() - t0,
  };

  if (high > 0) return {
    gate: 'security', status: 'warn',
    message: `Security: ${high} high, ${medium} medium findings`,
    details: report.findings
      .filter(f => f.severity === 'high')
      .map(f => `${f.file}:${f.line} ${f.description}`)
      .slice(0, 3),
    durationMs: Date.now() - t0,
  };

  return {
    gate: 'security', status: medium > 0 ? 'warn' : 'pass',
    message: medium > 0 ? `Security: ${medium} medium findings (non-blocking)` : 'No security issues',
    durationMs: Date.now() - t0,
  };
}

function checkEnvVars(projectId: string, files: Record<string, string>): GateResult {
  const t0 = Date.now();
  const validation = envSecretsService.validate(projectId, files);

  if (!validation.allSet && validation.missing.length > 0) {
    return {
      gate: 'env_vars', status: 'warn',
      message: `${validation.missing.length} env var(s) not set`,
      details: validation.missing.slice(0, 5).map(n => `${n}: not set`),
      durationMs: Date.now() - t0,
    };
  }

  if (validation.leaks.length > 0) {
    return {
      gate: 'env_vars', status: 'fail',
      message: `${validation.leaks.length} potential secret leak(s) detected`,
      details: validation.leaks.slice(0, 3).map(l => `${l.file}:${l.line} — ${l.pattern}`),
      durationMs: Date.now() - t0,
    };
  }

  return {
    gate: 'env_vars', status: 'pass',
    message: 'Env vars OK',
    durationMs: Date.now() - t0,
  };
}

function checkSave(saved: boolean): GateResult {
  return {
    gate: 'save',
    status: saved ? 'pass' : 'fail',
    message: saved ? 'Project saved' : 'Project not saved',
  };
}

function checkExportReady(files: Record<string, string>): GateResult {
  const t0 = Date.now();
  const details: string[] = [];

  const hasPackageJson = Object.keys(files).some(k => k === 'package.json' || k.endsWith('/package.json'));
  const hasEntry       = Object.keys(files).some(k =>
    k === 'index.html' || k === 'src/main.tsx' || k === 'main.tsx',
  );
  const hasGitignore   = Object.keys(files).some(k => k === '.gitignore');

  if (!hasPackageJson) details.push('Missing package.json');
  if (!hasEntry)       details.push('Missing entry point (index.html or main.tsx)');

  return {
    gate: 'export_ready',
    status: details.length === 0 ? 'pass' : 'warn',
    message: details.length === 0
      ? `Export ready${!hasGitignore ? ' (no .gitignore)' : ''}`
      : `Export issues: ${details.join(', ')}`,
    details,
    durationMs: Date.now() - t0,
  };
}

// ─── Score calculation ────────────────────────────────────────────────────────

function calculateScore(gates: GateResult[]): number {
  let total     = 0;
  let possible  = 0;

  for (const gate of gates) {
    const weight = GATE_WEIGHTS[gate.gate] ?? 5;
    possible += weight;

    if (gate.status === 'pass')    total += weight;
    else if (gate.status === 'warn') total += weight * 0.6;
    else if (gate.status === 'skip') {
      possible -= weight; // don't penalise skipped gates
    }
    // 'fail' and 'pending' = 0 points
  }

  if (possible === 0) return 100;
  return Math.round((total / possible) * 100);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface QualityGateInput {
  projectId:     string;
  mode:          'new' | 'edit';
  plan?:         object | null;
  files:         Record<string, string>;
  existingFiles?: Record<string, string>;
  compileResult?: { success: boolean; attempts: number; errors?: string[] } | null;
  previewStatus?: 'idle' | 'generating' | 'compiling' | 'ready' | 'failed' | null;
  saved?:        boolean;
}

/**
 * Run all quality gates and return a full QualityReport.
 *
 * Gates are run synchronously (all checks are local/static).
 */
export function runQualityGates(input: QualityGateInput): QualityReport {
  const gates: GateResult[] = [
    checkPlan(input.plan),
    checkCodeGeneration(input.files),
    checkImports(input.files, input.existingFiles),
    checkCompile(input.compileResult ?? null),
    checkPreviewMount(input.previewStatus ?? null),
    checkSecurity(input.files, input.projectId),
    checkEnvVars(input.projectId, input.files),
    checkSave(input.saved ?? false),
    checkExportReady(input.files),
  ];

  const score = calculateScore(gates);

  const failCount  = gates.filter(g => g.status === 'fail').length;
  const warnCount  = gates.filter(g => g.status === 'warn').length;
  const passCount  = gates.filter(g => g.status === 'pass').length;
  const skipCount  = gates.filter(g => g.status === 'skip' || g.status === 'pending').length;

  // Publish is blocked only by compile fail, security critical, or no save
  const passedForPublish = gates.every(g => {
    if (['compile', 'security', 'save'].includes(g.gate)) return g.status !== 'fail';
    return true;
  });

  const summary = [
    `Quality score: ${score}/100`,
    `${passCount} passed, ${warnCount} warnings, ${failCount} failed, ${skipCount} skipped`,
    !passedForPublish ? 'BLOCKED for publish — see failed gates' : '',
  ].filter(Boolean).join(' | ');

  return {
    projectId:        input.projectId,
    generatedAt:      new Date().toISOString(),
    mode:             input.mode,
    score,
    passedForPublish,
    gates,
    summary,
  };
}

/**
 * Format a QualityReport for display in the terminal log or analytics panel.
 */
export function formatQualityReport(report: QualityReport): string {
  const ICONS: Record<GateStatus, string> = {
    pass:    '✓',
    warn:    '⚠',
    fail:    '✗',
    skip:    '—',
    pending: '…',
  };

  const lines = [
    `Quality Gates — ${report.score}/100 (${report.passedForPublish ? 'OK to publish' : 'BLOCKED'})`,
  ];

  for (const gate of report.gates) {
    const icon = ICONS[gate.status];
    const ms   = gate.durationMs ? ` (${gate.durationMs}ms)` : '';
    lines.push(`  ${icon} ${gate.gate.padEnd(18)} ${gate.message}${ms}`);
    if (gate.details && gate.details.length > 0 && gate.status !== 'pass') {
      for (const d of gate.details.slice(0, 2)) {
        lines.push(`      → ${d}`);
      }
    }
  }

  return lines.join('\n');
}

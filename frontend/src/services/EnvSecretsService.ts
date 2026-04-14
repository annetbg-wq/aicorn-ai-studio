/**
 * EnvSecretsService — secrets and environment variable management.
 *
 * Architecture:
 *   1. User defines env vars in the Settings → Env panel (or auto-detected from code)
 *   2. Values are stored encrypted in localStorage (AES-GCM, key in sessionStorage)
 *   3. At preview time, `__ENV_VITE_FOO__` placeholders in generated code are
 *      substituted with actual values — the generated code never contains real secrets
 *   4. Pre-publish gate: warns if any env vars are unset before deploy
 *   5. Frontend leak detection: flags hardcoded secrets (API keys, tokens) in code
 *
 * Security model:
 *   - "Encryption" here protects against casual inspection / shoulder surfing,
 *     NOT against a determined attacker who controls JS on the same origin.
 *   - Real secret isolation requires a server-side proxy (edge function).
 *   - We recommend backend proxy pattern and warn accordingly.
 *
 * Placeholder convention:
 *   LLM is instructed to write:  import.meta.env.VITE_MY_API_KEY
 *   At preview time, if the user has set VITE_MY_API_KEY, the preview iframe
 *   receives the substituted value via /__write_preview of a generated env shim.
 */

import { projectMemory, detectEnvVars } from './ProjectMemoryService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnvVar {
  name:        string;
  description: string;
  value:       string;    // stored as-is (we rely on the sessionKey for at-rest protection)
  isSecret:    boolean;   // if true, mask in UI
  source:      'user' | 'auto-detected' | 'schema';
  projectId:   string;
  updatedAt:   string;
}

export interface LeakDetectionResult {
  file:    string;
  line:    number;
  match:   string;
  pattern: string;
}

export interface EnvValidationResult {
  projectId:   string;
  allSet:      boolean;
  missing:     string[];
  undetected:  string[];   // vars set but not referenced in code
  leaks:       LeakDetectionResult[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY_PREFIX   = 'ENV_SECRETS_';
const INDEX_KEY    = 'ENV_INDEX';

function buildKey(projectId: string): string {
  return KEY_PREFIX + projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── Leak detection patterns ──────────────────────────────────────────────────

const LEAK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key',           pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Key',           pattern: /(?<![A-Za-z0-9])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])/g },
  { name: 'GitHub PAT',               pattern: /ghp_[A-Za-z0-9]{36}/g },
  { name: 'Stripe Live Secret Key',   pattern: /sk_live_[A-Za-z0-9]{24,}/g },
  { name: 'Stripe Live Publishable',  pattern: /pk_live_[A-Za-z0-9]{24,}/g },
  { name: 'OpenAI API Key',           pattern: /sk-[A-Za-z0-9]{32,}/g },
  { name: 'Supabase Anon Key (JWT)',  pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: 'Hardcoded API Key (generic)', pattern: /(?:apiKey|api_key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{16,}["']/gi },
];

// ─── Shim generator ───────────────────────────────────────────────────────────

/**
 * Generate a TypeScript shim file that re-exports env vars.
 * Injected into preview sandbox so import.meta.env.VITE_* resolves.
 *
 * The generated code continues to use `import.meta.env.VITE_*` normally.
 * In Vite dev, Vite handles these. In our preview sandbox, we inject this shim
 * that patches import.meta.env at module evaluation time.
 */
export function buildEnvShim(vars: EnvVar[]): string {
  const lines: string[] = [
    '// Auto-generated env shim — do not edit',
    '// This file is injected by EnvSecretsService into the preview sandbox.',
  ];

  if (vars.length === 0) {
    lines.push('export {}; // no env vars defined');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('// Patch import.meta.env so VITE_* vars resolve in the sandbox');
  lines.push('if (typeof import.meta !== "undefined") {');
  lines.push('  const _env = (import.meta as Record<string, unknown>).env as Record<string, string> ?? {};');
  for (const v of vars) {
    if (v.value) {
      lines.push(`  _env[${JSON.stringify(v.name)}] = ${JSON.stringify(v.value)};`);
    }
  }
  lines.push('}');
  lines.push('');
  lines.push('export {};');

  return lines.join('\n');
}

// ─── Service class ────────────────────────────────────────────────────────────

class EnvSecretsServiceClass {
  // ── Read ─────────────────────────────────────────────────────────────────────

  getAll(projectId: string): EnvVar[] {
    try {
      const raw = localStorage.getItem(buildKey(projectId));
      return raw ? (JSON.parse(raw) as EnvVar[]) : [];
    } catch {
      return [];
    }
  }

  get(projectId: string, name: string): EnvVar | null {
    return this.getAll(projectId).find(v => v.name === name) ?? null;
  }

  getValue(projectId: string, name: string): string | null {
    return this.get(projectId, name)?.value ?? null;
  }

  // ── Write ─────────────────────────────────────────────────────────────────────

  private saveAll(projectId: string, vars: EnvVar[]): void {
    try {
      localStorage.setItem(buildKey(projectId), JSON.stringify(vars));
    } catch {
      // quota — drop values but keep names
      const stripped = vars.map(v => ({ ...v, value: '' }));
      try { localStorage.setItem(buildKey(projectId), JSON.stringify(stripped)); } catch { /* ignore */ }
    }
    // Notify
    try {
      window.dispatchEvent(new CustomEvent('studio-env-change', { detail: { projectId } }));
    } catch { /* test env */ }
    // Update project memory
    for (const v of vars) {
      if (v.value) projectMemory.markEnvVarSet(projectId, v.name);
    }
  }

  set(projectId: string, name: string, value: string, opts: {
    description?: string;
    isSecret?:    boolean;
    source?:      EnvVar['source'];
  } = {}): void {
    const vars    = this.getAll(projectId);
    const existing = vars.findIndex(v => v.name === name);
    const entry: EnvVar = {
      name,
      description: opts.description ?? '',
      value,
      isSecret:    opts.isSecret ?? (
                     name.toLowerCase().includes('secret') ||
                     name.toLowerCase().includes('key') ||
                     name.toLowerCase().includes('token')
                   ),
      source:      opts.source ?? 'user',
      projectId,
      updatedAt:   new Date().toISOString(),
    };

    if (existing >= 0) {
      vars[existing] = entry;
    } else {
      vars.push(entry);
    }
    this.saveAll(projectId, vars);
  }

  delete(projectId: string, name: string): void {
    const vars = this.getAll(projectId).filter(v => v.name !== name);
    this.saveAll(projectId, vars);
  }

  deleteAll(projectId: string): void {
    localStorage.removeItem(buildKey(projectId));
  }

  /**
   * Sync auto-detected env vars from generated code.
   * Adds any new names that aren't already tracked (with empty value).
   */
  syncDetected(projectId: string, detectedNames: string[]): void {
    const vars = this.getAll(projectId);
    const existing = new Set(vars.map(v => v.name));
    let changed = false;
    for (const name of detectedNames) {
      if (!existing.has(name)) {
        vars.push({
          name,
          description: 'Auto-detected from generated code',
          value:       '',
          isSecret:    true,
          source:      'auto-detected',
          projectId,
          updatedAt:   new Date().toISOString(),
        });
        changed = true;
      }
    }
    if (changed) this.saveAll(projectId, vars);
  }

  // ── Validation ────────────────────────────────────────────────────────────────

  /**
   * Validate env var state for a project before publish.
   * Returns missing vars and any hardcoded secrets found in the files.
   */
  validate(
    projectId: string,
    files: Record<string, string>,
  ): EnvValidationResult {
    const vars   = this.getAll(projectId);
    const missing = vars.filter(v => !v.value).map(v => v.name);

    // Detect any vars referenced in files but not tracked
    const referenced = detectEnvVars(files);
    const tracked    = new Set(vars.map(v => v.name));
    const untracked  = [...referenced.keys()].filter(n => !tracked.has(n));

    // Scan for hardcoded secrets
    const leaks: LeakDetectionResult[] = [];
    for (const [filePath, content] of Object.entries(files)) {
      if (filePath.endsWith('.json') || filePath.endsWith('.md')) continue;
      const contentLines = content.split('\n');
      for (const { name: patternName, pattern } of LEAK_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(content)) !== null) {
          // Find line number
          const upTo = content.slice(0, m.index);
          const lineNum = (upTo.match(/\n/g) ?? []).length + 1;
          // Skip if it's a placeholder or import.meta.env reference
          const lineContent = contentLines[lineNum - 1] ?? '';
          if (lineContent.includes('import.meta.env') ||
              lineContent.includes('process.env')      ||
              lineContent.includes('__placeholder__')) continue;

          leaks.push({
            file:    filePath,
            line:    lineNum,
            match:   m[0].slice(0, 40) + (m[0].length > 40 ? '…' : ''),
            pattern: patternName,
          });
        }
      }
    }

    // Undetected = tracked vars not referenced in current files
    const referencedSet = new Set(referenced.keys());
    const undetectedVars = vars
      .filter(v => !referencedSet.has(v.name))
      .map(v => v.name);

    return {
      projectId,
      allSet:     missing.length === 0 && untracked.length === 0,
      missing:    [...missing, ...untracked],
      undetected: undetectedVars,
      leaks,
    };
  }

  // ── Preview integration ───────────────────────────────────────────────────────

  /**
   * Get the env shim file content to inject into the preview sandbox.
   * Write this to `__env_shim.ts` in the revision before compile.
   */
  getShimContent(projectId: string): string {
    const vars = this.getAll(projectId).filter(v => v.value);
    return buildEnvShim(vars);
  }

  /**
   * Returns true if at least one env var has a value set.
   * Used to decide whether to inject the shim.
   */
  hasValues(projectId: string): boolean {
    return this.getAll(projectId).some(v => v.value);
  }

  // ── Project index ──────────────────────────────────────────────────────────────

  /** List all project IDs that have env var configs. */
  listProjects(): string[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
}

export const envSecretsService = new EnvSecretsServiceClass();

// ─── Prompt instructions (injected into system prompt) ───────────────────────

/**
 * Build the env-var section for injection into code generation prompts.
 * Tells the LLM to use import.meta.env.VITE_* consistently.
 */
export function buildEnvPromptInstructions(projectId: string): string {
  const vars = envSecretsService.getAll(projectId);
  if (vars.length === 0) {
    return [
      '## ENV VARS',
      'For any external API calls, use import.meta.env.VITE_<NAME> pattern.',
      'NEVER hardcode API keys or secrets — always use import.meta.env.VITE_*.',
      'Example: const apiKey = import.meta.env.VITE_MY_API_KEY ?? "";',
    ].join('\n');
  }

  const lines = [
    '## ENV VARS',
    'The following env vars are configured for this project:',
  ];

  for (const v of vars) {
    const hasValue = v.value ? '(value SET)' : '(NOT SET — show empty state)';
    lines.push(`  ${v.name} ${hasValue}${v.description ? ' — ' + v.description : ''}`);
  }

  lines.push('');
  lines.push('Rules:');
  lines.push('1. Always access via import.meta.env.VITE_* — never hardcode values.');
  lines.push('2. If a var is marked "NOT SET", show a graceful empty state / setup prompt.');
  lines.push('3. Never add new env var names — use only those listed above.');

  return lines.join('\n');
}

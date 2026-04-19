/**
 * ProjectMemoryService — per-project persistent semantic memory.
 *
 * Stores accumulated context that grows with each generation:
 *   - Intent history (what the user asked for)
 *   - Tech decisions (packages added, backend wired, auth type)
 *   - Known broken areas (compile errors that needed recovery)
 *   - Env var names detected in generated code
 *   - Route/page map (what pages exist, their purpose)
 *   - Schema decisions (Supabase tables, columns)
 *   - Generation history (last 10 summaries with outcome)
 *
 * This closes the gap where the LLM on the 5th edit "forgets" what
 * packages were added on edit 2, and re-introduces the same patterns
 * that already caused a compile error on edit 3.
 *
 * Usage in prompts:
 *   const block = projectMemory.buildContextPrompt(projectId);
 *   // inject into system prompt before generating
 *
 * Storage: localStorage key per project, max 64KB per project.
 */

import type {
  DesignCorrectionPatternSummary,
  DesignLearningBucketSummary,
  DesignLearningSummary,
  DesignRecipeTelemetry,
} from '../shared/projectModel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerationHistoryEntry {
  timestamp:    string;
  intent:       string;
  mode:         'new' | 'edit';
  outcome:      'success' | 'partial' | 'failed';
  filesChanged: string[];
  /** If compile error was recovered, what file was stubbed. */
  stubbed?:     string;
  /** Errors encountered (first 200 chars each). */
  errors?:      string[];
}

export interface EnvVarRecord {
  name:         string;
  /** Where it's referenced in the codebase. */
  usedIn:       string[];
  /** Whether a value has been set by the user in EnvSecretsService. */
  hasValue:     boolean;
}

export interface PackageRecord {
  name:         string;
  version?:     string;
  addedAt:      string;
  addedForIntent: string;
}

export interface RouteMemory {
  path:         string;
  component:    string;
  filePath:     string;
  purpose:      string;
}

export interface SchemaDecision {
  tableName:    string;
  columns:      string[];
  hasRls:       boolean;
  addedAt:      string;
}

export interface KnownIssue {
  file:         string;
  description:  string;
  firstSeenAt:  string;
  resolved:     boolean;
  resolvedAt?:  string;
}

export interface ProjectMemory {
  projectId:         string;
  appName:           string;
  intent:            string;        // Original / primary intent
  techStack: {
    framework:       string;        // 'react'
    backend:         string | null; // 'supabase' | null
    auth:            string | null; // 'supabase-auth' | 'clerk' | null
    stateManagement: string | null;
    hasPayments:     boolean;
    hasRealtime:     boolean;
  };
  packages:          PackageRecord[];
  envVars:           EnvVarRecord[];
  routes:            RouteMemory[];
  schemaDecisions:   SchemaDecision[];
  knownIssues:       KnownIssue[];
  generationHistory: GenerationHistoryEntry[];
  /** Lightweight local recipe/outcome telemetry for future design learning. */
  designTelemetry?:  DesignRecipeTelemetry[];
  /** Compact notes for the LLM — user or system can append. */
  notes:             string[];
  createdAt:         string;
  updatedAt:         string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function emptyMemory(projectId: string): ProjectMemory {
  const now = new Date().toISOString();
  return {
    projectId,
    appName:    '',
    intent:     '',
    techStack: {
      framework:       'react',
      backend:         null,
      auth:            null,
      stateManagement: null,
      hasPayments:     false,
      hasRealtime:     false,
    },
    packages:          [],
    envVars:           [],
    routes:            [],
    schemaDecisions:   [],
    knownIssues:       [],
    generationHistory: [],
    designTelemetry:   [],
    notes:             [],
    createdAt:         now,
    updatedAt:         now,
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY_PREFIX = 'PROJECT_MEM_';
const MAX_HISTORY = 10;
const MAX_ISSUES  = 20;
const MAX_PACKAGES = 50;
const MAX_DESIGN_TELEMETRY = 30;

function storageKey(projectId: string): string {
  return KEY_PREFIX + projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── Auto-detection helpers ───────────────────────────────────────────────────

/**
 * Scan generated files for `import.meta.env.VITE_*` references and return
 * the unique variable names found.
 */
export function detectEnvVars(files: Record<string, string>): Map<string, string[]> {
  const map = new Map<string, string[]>(); // varName → files[]
  const RE = /import\.meta\.env\.(VITE_[A-Z_][A-Z0-9_]*)/g;
  for (const [path, content] of Object.entries(files)) {
    let m: RegExpExecArray | null;
    RE.lastIndex = 0;
    while ((m = RE.exec(content)) !== null) {
      const name = m[1];
      const files = map.get(name) ?? [];
      if (!files.includes(path)) files.push(path);
      map.set(name, files);
    }
  }
  return map;
}

/**
 * Scan generated files for Supabase usage indicators.
 */
function detectBackend(files: Record<string, string>): { backend: string | null; auth: string | null } {
  const allContent = Object.values(files).join('\n');
  const hasSupabase = /from\s+['"]@supabase\//.test(allContent) ||
                      /createClient\(/.test(allContent);
  const hasAuth     = /supabase\.auth\./.test(allContent) ||
                      /from\s+['"]@clerk\//.test(allContent);
  const hasClerk    = /from\s+['"]@clerk\//.test(allContent);

  return {
    backend: hasSupabase ? 'supabase' : null,
    auth:    hasClerk ? 'clerk' : hasAuth ? 'supabase-auth' : null,
  };
}

function detectPayments(files: Record<string, string>): boolean {
  const all = Object.values(files).join('\n');
  return /stripe|lemonsqueezy|paddle/i.test(all);
}

function detectRealtime(files: Record<string, string>): boolean {
  const all = Object.values(files).join('\n');
  return /\.subscribe\(|\.channel\(|websocket/i.test(all);
}

/**
 * Extract package names from files (npm imports).
 * Returns packages that are NOT relative imports and NOT node builtins.
 */
export function detectPackages(files: Record<string, string>): string[] {
  const pkgSet = new Set<string>();
  const RE = /from\s+['"]([^'"./][^'"]*)['"]/g;
  for (const content of Object.values(files)) {
    let m: RegExpExecArray | null;
    RE.lastIndex = 0;
    while ((m = RE.exec(content)) !== null) {
      const pkg = m[1];
      // Extract package scope + name (first path segment)
      const base = pkg.startsWith('@')
        ? pkg.split('/').slice(0, 2).join('/')
        : pkg.split('/')[0];
      pkgSet.add(base);
    }
  }
  // Remove obvious stdlib / browser globals
  const BUILTINS = new Set(['react', 'react-dom', 'react-router-dom', 'path', 'fs', 'os',
    'url', 'crypto', 'util', 'events', 'stream', 'buffer', 'child_process']);
  return [...pkgSet].filter(p => !BUILTINS.has(p));
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ProjectMemoryServiceClass {
  // ── Read ────────────────────────────────────────────────────────────────────

  get(projectId: string): ProjectMemory {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      if (raw) return JSON.parse(raw) as ProjectMemory;
    } catch { /* corrupt — start fresh */ }
    return emptyMemory(projectId);
  }

  /** Returns null if no memory exists for this project. */
  find(projectId: string): ProjectMemory | null {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      return raw ? (JSON.parse(raw) as ProjectMemory) : null;
    } catch {
      return null;
    }
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  save(mem: ProjectMemory): void {
    mem.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(storageKey(mem.projectId), JSON.stringify(mem));
    } catch {
      // quota — trim history
      mem.generationHistory = mem.generationHistory.slice(-3);
      mem.knownIssues       = mem.knownIssues.slice(-5);
      mem.designTelemetry   = (mem.designTelemetry ?? []).slice(-8);
      try {
        localStorage.setItem(storageKey(mem.projectId), JSON.stringify(mem));
      } catch { /* give up */ }
    }
  }

  delete(projectId: string): void {
    localStorage.removeItem(storageKey(projectId));
  }

  // ── Update helpers ───────────────────────────────────────────────────────────

  /**
   * Record a completed generation run — extracts env vars, packages,
   * backend detection, and appends to history.
   */
  recordGeneration(
    projectId:   string,
    params: {
      appName?:     string;
      intent:       string;
      mode:         'new' | 'edit';
      files:        Record<string, string>;
      outcome:      'success' | 'partial' | 'failed';
      errors?:      string[];
      stubbed?:     string;
      routes?:      RouteMemory[];
      designTelemetry?: DesignRecipeTelemetry;
    },
  ): ProjectMemory {
    const mem = this.get(projectId);

    // App name
    if (params.appName && !mem.appName) {
      mem.appName = params.appName;
    }

    // Intent (first generation sets the primary intent)
    if (params.mode === 'new' || !mem.intent) {
      mem.intent = params.intent.slice(0, 300);
    }

    // Tech stack
    if (params.mode === 'new') {
      const { backend, auth } = detectBackend(params.files);
      mem.techStack.backend      = backend;
      mem.techStack.auth         = auth;
      mem.techStack.hasPayments  = detectPayments(params.files);
      mem.techStack.hasRealtime  = detectRealtime(params.files);
    } else {
      // Additive update for edits
      const { backend, auth } = detectBackend(params.files);
      if (backend) mem.techStack.backend = backend;
      if (auth)    mem.techStack.auth    = auth;
      if (!mem.techStack.hasPayments) mem.techStack.hasPayments = detectPayments(params.files);
      if (!mem.techStack.hasRealtime) mem.techStack.hasRealtime = detectRealtime(params.files);
    }

    // Packages
    const detected = detectPackages(params.files);
    const existing = new Set(mem.packages.map(p => p.name));
    for (const pkg of detected) {
      if (!existing.has(pkg) && mem.packages.length < MAX_PACKAGES) {
        mem.packages.push({
          name:           pkg,
          addedAt:        new Date().toISOString(),
          addedForIntent: params.intent.slice(0, 80),
        });
      }
    }

    // Env vars
    const envMap = detectEnvVars(params.files);
    for (const [name, files] of envMap) {
      const existing = mem.envVars.find(e => e.name === name);
      if (existing) {
        existing.usedIn = [...new Set([...existing.usedIn, ...files])];
      } else {
        mem.envVars.push({ name, usedIn: files, hasValue: false });
      }
    }

    // Routes
    if (params.routes && params.routes.length > 0) {
      // Replace — routes come from the manifest which is authoritative
      mem.routes = params.routes;
    }

    // History
    const filesChanged = Object.keys(params.files).slice(0, 20);
    mem.generationHistory.push({
      timestamp:    new Date().toISOString(),
      intent:       params.intent.slice(0, 150),
      mode:         params.mode,
      outcome:      params.outcome,
      filesChanged,
      stubbed:      params.stubbed,
      errors:       params.errors?.map(e => e.slice(0, 200)),
    });
    if (mem.generationHistory.length > MAX_HISTORY) {
      mem.generationHistory = mem.generationHistory.slice(-MAX_HISTORY);
    }

    // Design telemetry
    if (params.designTelemetry) {
      const nextTelemetry = [
        ...(mem.designTelemetry ?? []),
        params.designTelemetry,
      ];
      mem.designTelemetry = nextTelemetry.slice(-MAX_DESIGN_TELEMETRY);
    }

    // Known issues
    if (params.errors && params.errors.length > 0) {
      for (const err of params.errors.slice(0, 3)) {
        const file = err.match(/src\/([\w/.]+\.tsx?)/)?.[1] ?? 'unknown';
        const existing = mem.knownIssues.find(i => i.file === file && !i.resolved);
        if (!existing && mem.knownIssues.length < MAX_ISSUES) {
          mem.knownIssues.push({
            file,
            description: err.slice(0, 200),
            firstSeenAt: new Date().toISOString(),
            resolved:    false,
          });
        }
      }
    }
    // Resolve issues for files that now compile ok
    if (params.outcome === 'success' || params.outcome === 'partial') {
      for (const issue of mem.knownIssues) {
        if (!issue.resolved && params.files[issue.file]) {
          issue.resolved   = true;
          issue.resolvedAt = new Date().toISOString();
        }
      }
    }

    this.save(mem);
    return mem;
  }

  getDesignTelemetry(projectId: string): DesignRecipeTelemetry[] {
    return this.get(projectId).designTelemetry ?? [];
  }

  summarizeDesignTelemetry(projectId: string): DesignLearningSummary {
    return summarizeDesignTelemetryEntries(this.getDesignTelemetry(projectId));
  }

  /** Append a free-form note (e.g. from the user: "don't use dark backgrounds"). */
  addNote(projectId: string, note: string): void {
    const mem = this.get(projectId);
    mem.notes.push(note.slice(0, 300));
    if (mem.notes.length > 20) mem.notes.shift();
    this.save(mem);
  }

  /** Mark an env var as having a value (called from EnvSecretsService). */
  markEnvVarSet(projectId: string, varName: string): void {
    const mem = this.get(projectId);
    const ev  = mem.envVars.find(e => e.name === varName);
    if (ev) {
      ev.hasValue = true;
      this.save(mem);
    }
  }

  // ── Prompt generation ────────────────────────────────────────────────────────

  /**
   * Build a compact context block for injection into generation prompts.
   * Tells the LLM what has already been decided so it doesn't re-invent
   * or contradict previous generations.
   */
  buildContextPrompt(projectId: string): string {
    const mem = this.find(projectId);
    if (!mem) return '';

    const lines: string[] = [
      '## PROJECT MEMORY',
      `App: ${mem.appName || '(unnamed)'}  |  Intent: ${mem.intent || '(new project)'}`,
    ];

    // Tech stack
    const ts = mem.techStack;
    const techParts: string[] = [`framework: react`];
    if (ts.backend)         techParts.push(`backend: ${ts.backend}`);
    if (ts.auth)            techParts.push(`auth: ${ts.auth}`);
    if (ts.hasPayments)     techParts.push('payments: yes');
    if (ts.hasRealtime)     techParts.push('realtime: yes');
    if (ts.stateManagement) techParts.push(`state: ${ts.stateManagement}`);
    lines.push(`Stack: ${techParts.join(', ')}`);

    // Packages added in previous runs
    if (mem.packages.length > 0) {
      const pkgList = mem.packages.map(p => p.name).join(', ');
      lines.push(`Packages already installed: ${pkgList}`);
      lines.push('DO NOT add or re-install these — they are already present.');
    }

    // Env vars
    const unset = mem.envVars.filter(e => !e.hasValue);
    const set   = mem.envVars.filter(e => e.hasValue);
    if (set.length > 0) {
      lines.push(`Env vars (set): ${set.map(e => e.name).join(', ')}`);
    }
    if (unset.length > 0) {
      lines.push(`Env vars (NOT YET SET by user): ${unset.map(e => e.name).join(', ')}`);
      lines.push('Show appropriate empty states when these env vars are missing.');
    }

    // Routes
    if (mem.routes.length > 0) {
      lines.push('Existing routes (DO NOT REMOVE):');
      for (const r of mem.routes) {
        lines.push(`  ${r.path} → ${r.component} (${r.filePath}) — ${r.purpose}`);
      }
    }

    // Known issues
    const openIssues = mem.knownIssues.filter(i => !i.resolved);
    if (openIssues.length > 0) {
      lines.push('Known compile issues (these files previously had errors):');
      for (const issue of openIssues.slice(0, 5)) {
        lines.push(`  ${issue.file}: ${issue.description.slice(0, 100)}`);
      }
      lines.push('Be extra careful editing these files — fix the issue, do not re-introduce it.');
    }

    // Recent generation history
    if (mem.generationHistory.length > 0) {
      const recent = mem.generationHistory.slice(-3);
      lines.push('Recent changes:');
      for (const h of recent) {
        const outcome = h.outcome === 'success' ? '✓' : h.outcome === 'partial' ? '⚠' : '✗';
        lines.push(`  ${outcome} [${h.mode}] ${h.intent.slice(0, 80)}`);
      }
    }

    // User notes
    if (mem.notes.length > 0) {
      lines.push('Notes:');
      for (const note of mem.notes) {
        lines.push(`  - ${note}`);
      }
    }

    lines.push('## END PROJECT MEMORY');
    return lines.join('\n');
  }
}

export const projectMemory = new ProjectMemoryServiceClass();

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rate(matches: number, total: number): number {
  return total > 0 ? matches / total : 0;
}

function summarizeBucketEntries(
  entries: DesignRecipeTelemetry[],
  keyForEntry: (entry: DesignRecipeTelemetry) => string,
): DesignLearningBucketSummary[] {
  const buckets = new Map<string, DesignRecipeTelemetry[]>();

  for (const entry of entries) {
    const key = keyForEntry(entry);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => ({
      key,
      sampleCount: bucket.length,
      avgVisualScore: average(bucket.map((entry) => entry.outcome.visualScore)),
      strongRate: rate(bucket.filter((entry) => entry.outcome.visualVerdict === 'strong').length, bucket.length),
      weakRate: rate(bucket.filter((entry) => entry.outcome.visualVerdict === 'weak').length, bucket.length),
      polishAppliedRate: rate(bucket.filter((entry) => entry.outcome.polishApplied).length, bucket.length),
      polishImprovedRate: rate(bucket.filter((entry) => entry.outcome.qualityImprovedAfterPolish).length, bucket.length),
    }))
    .sort((a, b) =>
      b.avgVisualScore - a.avgVisualScore
      || b.sampleCount - a.sampleCount
      || a.key.localeCompare(b.key))
    .slice(0, 6);
}

function summarizeCorrectionPatterns(entries: DesignRecipeTelemetry[]): DesignCorrectionPatternSummary[] {
  const patternMap = new Map<string, DesignRecipeTelemetry[]>();

  for (const entry of entries) {
    for (const pattern of entry.outcome.polishTriggerReasons) {
      const bucket = patternMap.get(pattern) ?? [];
      bucket.push(entry);
      patternMap.set(pattern, bucket);
    }
  }

  return Array.from(patternMap.entries())
    .map(([pattern, bucket]) => {
      const deltas = bucket
        .map((entry) => entry.outcome.polishDeltaScore)
        .filter((delta): delta is number => typeof delta === 'number');

      return {
        pattern,
        sampleCount: bucket.length,
        avgDeltaScore: average(deltas),
        improveRate: rate(bucket.filter((entry) => entry.outcome.qualityImprovedAfterPolish).length, bucket.length),
      };
    })
    .sort((a, b) =>
      b.improveRate - a.improveRate
      || b.avgDeltaScore - a.avgDeltaScore
      || b.sampleCount - a.sampleCount
      || a.pattern.localeCompare(b.pattern))
    .slice(0, 8);
}

export function summarizeDesignTelemetryEntries(entries: DesignRecipeTelemetry[]): DesignLearningSummary {
  const notes: string[] = [];
  if (entries.length === 0) {
    notes.push('No design telemetry recorded yet.');
  }

  return {
    totalSamples: entries.length,
    bestRecipes: summarizeBucketEntries(
      entries,
      (entry) => `${entry.recipe.category}/${entry.recipe.style}/${entry.recipe.visualArchetype}`,
    ),
    styleSummary: summarizeBucketEntries(
      entries,
      (entry) => `${entry.recipe.category}/${entry.recipe.style}`,
    ),
    redesignModeSummary: summarizeBucketEntries(
      entries,
      (entry) => `${entry.redesign.mode}/${entry.redesign.structureLock}`,
    ),
    assetPolicySummary: summarizeBucketEntries(
      entries,
      (entry) => `${entry.assets.mediaRemotePolicy}/${entry.assets.fontLoadingStrategy}/${entry.assets.componentRemotePolicy}`,
    ),
    correctionPatternSummary: summarizeCorrectionPatterns(entries),
    notes: notes.length > 0 ? notes : undefined,
  };
}

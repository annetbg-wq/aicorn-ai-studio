/**
 * projectModel.ts — Canonical Internal Project Model  (v1)
 *
 * ProjectGraph is the single source of truth for ALL generated output.
 * Preview files and downloadable repo files are DERIVED from the same graph.
 * No stage of the pipeline produces free-form string blobs.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ProductManifest   intent + tech-stack declaration                      │
 * │  └─ ProjectGraph   full file graph + routes + features + deps           │
 * │     ├─ FileBlueprint[]    every generated / user-edited file            │
 * │     ├─ RouteSpec[]        typed URL → file mapping                      │
 * │     ├─ FeatureSpec[]      named capability slices                       │
 * │     └─ DependencySpec[]   external packages + env refs                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Derived surfaces (read-only projections):
 *   projectGraphToFileMap(g)        → Record<string,string>  preview sandbox
 *   applyOperationsToGraph(g, ops)  → ProjectGraph           after AI diff
 *   wrapOrchestratorResult(...)     → GenerationResult       legacy bridge
 */

// ─── Chat / Streaming primitives (owned here, re-exported by Orchestrator) ───

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ContentPart {
  type:       'text' | 'image_url';
  text?:      string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role:    ChatRole;
  content: string | ContentPart[];
}

export interface FileDiff {
  find:    string;
  replace: string;
}

export type FileOperation =
  | { op: 'upsert'; name: string; content: string }
  | { op: 'patch';  name: string; diff: FileDiff[] }
  | { op: 'delete'; name: string }
  /** Move a file and rewrite cross-file import references. Use OperationEngine.apply() for full support. */
  | { op: 'rename'; from: string; to: string };

export interface UsageData {
  promptTokens:     number;
  completionTokens: number;
}

export type AgentPhase = 'idle' | 'think' | 'plan' | 'code' | 'verify';

export interface PhaseEvent {
  phase:    AgentPhase;
  progress: number;   // 0–100
  detail?:  string;
}

// ─── Primitive Enumerations ──────────────────────────────────────────────────

export type FileRole =
  | 'entry'      // App.tsx, main.tsx, index.html
  | 'page'       // pages/About.tsx  (routed)
  | 'component'  // components/Button.tsx
  | 'layout'     // layouts/RootLayout.tsx
  | 'hook'       // hooks/useStudio.ts
  | 'service'    // services/ApiService.ts
  | 'config'     // vite.config.ts, tailwind.config.js
  | 'style'      // styles/global.css
  | 'schema'     // supabase/schema.sql
  | 'type'       // types/index.d.ts
  | 'test'       // __tests__/Button.test.tsx
  | 'asset'      // images, fonts  (content = base64 or URL ref)
  | 'util';      // utils/helpers.ts

export type FileLanguage =
  | 'tsx' | 'ts' | 'jsx' | 'js'
  | 'css' | 'scss'
  | 'json' | 'sql' | 'html' | 'md' | 'yaml' | 'env';

export type DependencyKind =
  | 'npm'        // external package  (react, tailwindcss)
  | 'internal'   // local import      (./Button, ../hooks/useStudio)
  | 'cdn'        // <script src> from CDN
  | 'supabase'   // Supabase client import
  | 'env';       // import.meta.env / process.env reference

export type FeatureKind =
  | 'ui' | 'data' | 'auth' | 'integration'
  | 'api' | 'payment' | 'realtime' | 'storage' | 'analytics';

export type FeatureStatus =
  | 'planned' | 'generating' | 'generated' | 'validated' | 'failed';

export type GenerationStatus =
  | 'streaming' | 'complete' | 'failed' | 'cancelled';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationCategory =
  | 'syntax' | 'imports' | 'types' | 'runtime'
  | 'security' | 'performance' | 'accessibility';

export type ExportFormat =
  | 'zip' | 'figma-spec' | 'storybook'
  | 'npm-package' | 'docker' | 'supabase-migration';

export type TargetPlatform = 'web' | 'mobile' | 'desktop';

export type StylingFramework = 'tailwind';

export type BackendKind = 'supabase' | null;

export type StateManagementKind = 'zustand' | 'redux' | 'context' | 'jotai' | null;

// ─── TechStackSpec ───────────────────────────────────────────────────────────

export interface TechStackSpec {
  framework:       'react';
  language:        'typescript' | 'javascript';
  styling:         StylingFramework;
  bundler:         'vite';
  backend:         BackendKind;
  stateManagement: StateManagementKind;
}

// ─── ProductArchitect types ───────────────────────────────────────────────────

/** High-level application archetype inferred from user intent */
export type ProductMode =
  | 'dashboard'    // data-heavy: charts, tables, KPIs
  | 'landing'      // marketing: hero, features, CTA
  | 'app'          // general SPA: mixed UI
  | 'saas'         // subscription product: pricing, accounts
  | 'e-commerce'   // shopping: catalogue, cart, checkout
  | 'admin'        // CRUD management panels
  | 'blog'         // content-driven: posts, tags, CMS
  | 'portfolio'    // showcase: projects, gallery
  | 'tool'         // single-purpose utility
  | 'game'         // interactive entertainment
  | 'social'       // UGC: feed, likes, follows
  | 'unknown';

/** Information density preference */
export type VisualDensity = 'compact' | 'comfortable' | 'spacious';

/** UI richness level */
export type VisualComplexity = 'minimal' | 'moderate' | 'rich';

/**
 * Visual presentation characteristics inferred from intent.
 * All fields are inferred — never user-inputted directly.
 */
export interface VisualMode {
  density:       VisualDensity;
  complexity:    VisualComplexity;
  prefersDark:   boolean;
  colorScheme:   'neutral' | 'vibrant' | 'brand';
  hasAnimations: boolean;
  hasSidebar:    boolean;
  hasTopNav:     boolean;
  hasBottomNav:  boolean;
}

/**
 * Lightweight route declaration inside the manifest.
 * Precedes FileBlueprint assignment — no fileBlueprintId yet.
 * RouteSpec (in ProjectGraph) is the full version once files exist.
 */
export interface ManifestRoute {
  id:                string;
  path:              string;
  title:             string;
  description:       string;
  isIndex:           boolean;
  isProtected:       boolean;
  /** This route warrants its own dedicated module */
  isDedicatedModule: boolean;
  /** URL param names, e.g. ["id", "slug"] */
  params:            string[];
}

/**
 * A core data entity inferred from user intent.
 * Drives DB schema, API shape, and component naming.
 */
export interface EntitySpec {
  id:          string;
  name:        string;         // PascalCase, e.g. "User"
  description: string;
  /** Key attribute names, e.g. ["email", "createdAt"] */
  attributes:  string[];
  /** EntitySpec.id[] of related entities */
  relations:   string[];
  needsDB:     boolean;
}

/**
 * A key user journey inferred from intent.
 * Used to determine feature scope and required capabilities.
 */
export interface FlowSpec {
  id:               string;
  name:             string;       // e.g. "User Onboarding"
  description:      string;
  /** Ordered step descriptions */
  steps:            string[];
  /** EntitySpec.id[] touched by this flow */
  involvedEntities: string[];
  isAuthRequired:   boolean;
}

/** Identifier for a well-known runtime capability */
export type CapabilityId =
  | 'auth'          // Supabase Auth / JWT                  → slot: auth-ready
  | 'database'      // Supabase / persistent data           → slot: persistence-ready
  | 'storage'       // file uploads (Supabase Storage)      → slot: file-upload-ready
  | 'realtime'      // WebSocket / live updates             → slot: realtime-ready
  | 'payments'      // Stripe / checkout                    → slot: payments-ready
  | 'ai'            // OpenAI / Claude API                  → slot: ai-ready
  | 'voice'         // Web Speech API / media capture       → slot: media/voice-ready
  | 'external-api'  // third-party REST/GraphQL integration → slot: external-api-ready
  | 'email'         // transactional email
  | 'charts'        // Chart.js / Recharts
  | 'maps'          // Leaflet / geo
  | 'search'        // full-text search
  | 'export'        // PDF / CSV download
  | 'camera'        // webcam / MediaDevices
  | 'ocr'           // Tesseract.js
  | 'push'          // push notifications
  | 'i18n';         // multi-language

/** A capability needed by the product, with rationale and priority */
export interface CapabilitySpec {
  id:           CapabilityId;
  /** One-line reason why this capability is needed */
  reason:       string;
  priority:     'must' | 'should' | 'could';
  /** Preferred library, e.g. "chart.js", "leaflet" */
  suggestedLib?: string;
}

/**
 * A feature cluster that warrants a dedicated module (own page + service + state).
 * Populated only when the feature is complex enough to stand alone.
 */
export interface ModuleSpec {
  id:           string;
  name:         string;
  description:  string;
  /** ManifestRoute.id[] belonging to this module */
  routeIds:     string[];
  /** EntitySpec.id[] owned by this module */
  entityIds:    string[];
  capabilities: CapabilityId[];
  /** True when the module can be feature-flagged or lazy-loaded independently */
  isStandalone: boolean;
}

// ─── ProductManifest ─────────────────────────────────────────────────────────

/**
 * Top-level project intent and configuration.
 * Created once from the user's initial prompt; updated when intent changes.
 * Never derived from file content — always the authoritative declaration.
 *
 * Fields added by ProductArchitect are optional so legacy graphs stay valid.
 */
export interface ProductManifest {
  readonly version: 1;
  id:               string;
  name:             string;
  description:      string;
  /** Raw user intent — the first or most recent defining prompt */
  intent:           string;
  targetPlatforms:  TargetPlatform[];
  techStack:        TechStackSpec;
  marketTarget?:    'USA' | 'EU' | 'GLOBAL';
  figmaFileKey?:    string;
  createdAt:        string;  // ISO 8601
  updatedAt:        string;

  // ── ProductArchitect output (populated after inference) ──────────────────
  /** Application archetype inferred from intent */
  productMode?:      ProductMode;
  /** Visual presentation characteristics */
  visualMode?:       VisualMode;
  /** Whether the app has multiple distinct pages/routes */
  isMultiPage?:      boolean;
  /** Declared routes before file assignment */
  manifestRoutes?:   ManifestRoute[];
  /** Core data entities */
  mainEntities?:     EntitySpec[];
  /** Key user journeys */
  keyFlows?:         FlowSpec[];
  /** Runtime capabilities required by the product */
  neededCapabilities?: CapabilitySpec[];
  /** Feature clusters that deserve dedicated modules */
  dedicatedModules?: ModuleSpec[];
  /** Human-readable notes explaining inference decisions */
  inferenceNotes?:   string[];
  /** Visual preset inferred from intent + mode — drives design token generation */
  visualPreset?:     import('./designSystem').VisualPresetId;
  /**
   * When true, generation is restricted to single-page output only.
   * Multi-page, routes.json, router shell are forbidden. Set by
   * GenerationPipeline when singlePageSafeMode is requested.
   */
  singlePageSafeMode?: boolean;
}

// ─── DependencySpec ──────────────────────────────────────────────────────────

/**
 * A typed dependency: npm package, internal module, CDN link, or env var.
 * Stored at both file level (FileBlueprint.dependencies) and graph level
 * (ProjectGraph.externalDependencies) for npm / CDN / supabase kinds.
 */
export interface DependencySpec {
  /** Deterministic: `${kind}:${name}` */
  id:               string;
  /** 'react', './Button', 'VITE_API_KEY', etc. */
  name:             string;
  kind:             DependencyKind;
  /** Semver for npm, e.g. "^18.2.0" */
  version?:         string;
  /** FileBlueprint.id[] of files that import this dependency */
  importedBy:       string[];
  isDevDependency:  boolean;
  resolvedVersion?: string;
}

// ─── FileBlueprint ───────────────────────────────────────────────────────────

/**
 * A zone of user-owned content inside a file.
 * Mirrors the [USER_ZONE_START]…[USER_ZONE_END] contract in Orchestrator.
 */
export interface UserZone {
  id:      string;
  startLn: number;
  endLn:   number;
  content: string;
}

/**
 * A single file in the project graph.
 *
 * Content is canonical.  Preview and export surfaces are read-only
 * projections derived via projectGraphToFileMap().  Nothing writes to
 * `content` outside of a graph mutation function.
 */
export interface FileBlueprint {
  /** Deterministic: djb2Hash(path) */
  id:           string;
  /** Relative path from project root, e.g. "src/components/Button.tsx" */
  path:         string;
  content:      string;
  role:         FileRole;
  language:     FileLanguage;
  /** Named exports declared in this file (populated by ScannerService) */
  exports:      string[];
  /** DependencySpec.id[] this file directly imports */
  dependencies: string[];
  /** djb2 fingerprint of content — enables cheap change detection */
  hash:         string;
  generatedAt:  string;
  generatedBy:  'ai' | 'user' | 'template';
  /** When true, AI must preserve this file unless user explicitly asks */
  isProtected:  boolean;
  userZones:    UserZone[];
}

// ─── RouteSpec ───────────────────────────────────────────────────────────────

/**
 * Typed URL → file mapping.
 * Replaces the loosely-typed RouteEntry from RouteManifestService.
 * Supports nested routes via children[].
 */
export interface RouteSpec {
  id:              string;
  /** URL pattern, e.g. "/about/:slug" */
  path:            string;
  /** FileBlueprint.id of the component that renders this route */
  fileBlueprintId: string;
  /** Convenience copy — avoids a graph lookup in router generation */
  filePath:        string;
  title?:          string;
  isIndex:         boolean;
  /** Whether this route requires auth */
  isProtected:     boolean;
  /** Param names extracted from path, e.g. ["slug"] */
  params:          string[];
  children:        RouteSpec[];
}

// ─── FeatureSpec ─────────────────────────────────────────────────────────────

/**
 * A named capability / vertical slice of the application.
 * Groups related files and declares cross-feature dependencies.
 */
export interface FeatureSpec {
  id:                 string;
  name:               string;
  description:        string;
  kind:               FeatureKind;
  status:             FeatureStatus;
  /** FileBlueprint.id[] owned by this feature */
  fileBlueprintIds:   string[];
  /** Other FeatureSpec.id[] this feature depends on */
  dependsOn:          string[];
  acceptanceCriteria: string[];
}

// ─── ProjectGraph ─────────────────────────────────────────────────────────────

/**
 * THE canonical source of truth.
 *
 * Preview (Vite sandbox) and downloadable repo are BOTH derived from this.
 * Nothing writes to files outside of a graph mutation (applyOperationsToGraph).
 *
 * Derivation:
 *   projectGraphToFileMap(graph)        → Record<string,string>  preview / sandbox
 *   applyOperationsToGraph(graph, ops)  → ProjectGraph            after AI diff
 *   buildExportArtifact(graph, fmt)     → ExportArtifact          downloadable
 */
export interface ProjectGraph {
  readonly version:     1;
  id:                   string;
  projectId:            string;
  revisionId:           string;
  manifest:             ProductManifest;
  files:                FileBlueprint[];
  routes:               RouteSpec[];
  features:             FeatureSpec[];
  externalDependencies: DependencySpec[];
  /** FileBlueprint.id of the app entry point */
  entryFileId:          string;
  createdAt:            string;
  updatedAt:            string;
}

// ─── ValidationResult ────────────────────────────────────────────────────────

export interface ValidationIssue {
  /** FileBlueprint.id */
  fileId:      string;
  filePath:    string;
  line?:       number;
  column?:     number;
  category:    ValidationCategory;
  severity:    ValidationSeverity;
  message:     string;
  suggestion?: string;
  autoFixable: boolean;
}

/**
 * Result of a code-quality validation pass over a ProjectGraph.
 *
 * Distinct from AIEngineService.ValidationResult (Figma geometry validation).
 * checkedBy determines cost: 'heuristic' = zero cost, 'ai' = API call, 'tsc' = local.
 */
export interface ValidationResult {
  id:        string;
  /** ProjectGraph.id this result applies to */
  graphId:   string;
  passed:    boolean;
  /** Composite quality score 0–100 */
  score:     number;
  issues:    ValidationIssue[];
  summary:   string;
  checkedAt: string;
  checkedBy: 'heuristic' | 'ai' | 'tsc';
}

// ─── Strict Generation Contract — supporting types ────────────────────────────

/**
 * Structured plan extracted from the AI response.
 * Populated from <think>…</think> and "## 📋 Plan" sections.
 * Never inferred by downstream — always produced by GenerationPipeline.
 */
export interface StructuredPlan {
  /** Content of <think>…</think> block (raw AI reasoning) */
  thinking?: string;
  /** Ordered steps extracted from the "## 📋 Plan" section */
  steps:     string[];
  /** Raw markdown text of the plan section (display-ready) */
  rawText:   string;
}

/**
 * Preview metadata derived from graph.manifest — no AI call needed.
 * Tells sandbox consumers exactly how to boot the generated project.
 */
export interface PreviewMeta {
  /** Relative path of the app entry point, e.g. "src/main.tsx" */
  entryFile:   string;
  /** Detected/declared frontend framework */
  framework:   'react';
  /** True when the project has multiple routed pages */
  isMultiPage: boolean;
}

/**
 * A route detected in the generated output.
 * Flat, display-safe projection — no graph IDs or internal refs.
 */
export interface GenerationRouteEntry {
  path:         string;
  filePath:     string;
  title?:       string;
  isHome:       boolean;
  isProtected?: boolean;
}

/** Severity of a unified warning */
export type WarningSeverity = 'error' | 'warning' | 'info';

/** Guard system that produced a unified warning */
export type WarningSource = 'runtime-guard' | 'integration' | 'integrity';

/**
 * A single issue from any guard pass, normalised into a common shape.
 * Downstream code reads result.warnings — never individual guard payloads.
 */
export interface UnifiedWarning {
  severity: WarningSeverity;
  /** Which guard produced this warning */
  source:   WarningSource;
  /** Machine-readable code, e.g. "IMPORT_UNRESOLVED", "ENTRY_MISSING" */
  code:     string;
  filePath: string;
  message:  string;
}

/**
 * An actionable repair hint derived from guard payloads.
 * Never produced by parsing raw AI text.
 */
export interface RepairHint {
  code:        string;
  filePath:    string;
  message:     string;
  /** Human-readable suggestion for resolving the issue */
  suggestion?: string;
}

// ─── ChangePackage ────────────────────────────────────────────────────────────

/**
 * Structured output package produced by a single GenerationPipeline run.
 *
 * This is the canonical change description.  Every field is explicitly derived
 * from a typed source — no field is inferred from raw AI text.
 *
 * Sources:
 *   plan            ← ProductManifest.inferenceNotes (ProductArchitect output)
 *   graph           ← post-seam ProjectGraph (all auto-fixes applied)
 *   fileOperations  ← raw Orchestrator diff (backward-compat only)
 *   routeManifest   ← graph.routes + graph.manifest.isMultiPage
 *   dependencies    ← graph.externalDependencies
 *   previewMeta     ← graph.manifest (entry file, declared capabilities)
 *   guardResults    ← live outputs of the three guard passes
 *   warnings        ← human-readable messages from all guard passes
 *   repairHints     ← blocking / auto-fixed / retry-able issue records
 */
export interface ChangePackage {
  /** ProductArchitect inference notes — why the manifest was shaped this way */
  plan: string[];

  /** The post-seam, post-fix ProjectGraph — authoritative source of truth */
  graph: ProjectGraph;

  /** Raw Orchestrator diff — backward-compat only; prefer graph */
  fileOperations: FileOperation[];

  /** Route manifest derived from graph — no file scanning needed */
  routeManifest: {
    routes:      RouteSpec[];
    isMultiPage: boolean;
  };

  /** External npm / CDN / env dependencies declared across generated files */
  dependencies: DependencySpec[];

  /** How to boot the generated project in the sandbox */
  previewMeta: {
    /** Relative path of the app entry point, e.g. "src/main.tsx" */
    entryFile:    string;
    /** Declared runtime capabilities from the product manifest */
    capabilities: CapabilityId[];
  };

  /** Typed results from all three guard passes — always present, never optional */
  guardResults: {
    integration: {
      isHealthy:        boolean;
      totalIssues:      number;
      fixedCount:       number;
      reportedCount:    number;
      unresolvedIssues: Array<{ kind: string; message: string; filePath: string }>;
      durationMs:       number;
    };
    integrity: {
      passed:     boolean;
      errorCount: number;
      warnCount:  number;
      errors:     Array<{ code: string; filePath: string; message: string }>;
      warnings:   Array<{ code: string; filePath: string; message: string }>;
      durationMs: number;
    };
    runtime: {
      passed:       boolean;
      failingFiles: string[];
      reasons:      Array<{ code: string; filePath: string; message: string; subject?: string }>;
      durationMs:   number;
    };
  };

  /** Human-readable issue messages merged from all guard passes */
  warnings: string[];

  /**
   * Actionable repair hints with triage strategy:
   *   'block'    — commit is blocked; user or next iteration must fix this
   *   'auto-fix' — issue was resolved automatically by IntegrationService
   *   'retry'    — soft failure; a regeneration pass may resolve it
   */
  repairHints: Array<{
    code:     string;
    strategy: 'block' | 'auto-fix' | 'retry';
  }>;

  /**
   * Unified repair audit trail produced by RepairFramework.
   * Present only when the repair loop ran (i.e. there were repairable failures).
   * undefined means the repair framework was not invoked this run.
   */
  repairAudit?: {
    /** Total failures diagnosed */
    totalFailures: number;
    /** Number successfully repaired */
    repairedCount: number;
    /** Number surfaced to user (block or failed repair) */
    blockedCount:  number;
    /** Wall-clock time of the repair loop in ms */
    durationMs:    number;
    /** Per-failure audit records — typed class + method + outcome */
    records: Array<{
      id:              string;
      class:           string;
      code:            string;
      filePath:        string;
      strategy:        string;
      repairAttempted: boolean;
      repairSucceeded: boolean;
      repairMethod?:   string;
      source:          string;
    }>;
  };
}

// ─── GenerationQualitySummary ─────────────────────────────────────────────────

/**
 * Per-run quality summary produced by GenerationQualityService.
 *
 * Populated from structured signals already present in the result —
 * changePackage.guardResults, routeManifest, previewMeta, warnings, repairHints.
 *
 * NOT a BenchmarkGate result. No golden-intent replays, no Supabase reads.
 * See benchmark/GenerationQualityService.ts for the two-level quality model.
 */
export interface GenerationQualitySummary {
  passed:   boolean;
  severity: 'ok' | 'warning' | 'blocking';
  checks: {
    previewEntryPresent:  boolean;
    hasRoutesInfo:        boolean;
    guardIntegrityPassed: boolean;
    guardRuntimePassed:   boolean;
    hasWarnings:          boolean;
    hasRepairHints:       boolean;
    multiPageDeclared:    boolean;
    dependenciesDeclared: boolean;
  };
  /** Hard failures — missing entry, guard failures, incomplete output. */
  blockers: string[];
  /** Soft issues — warnings and repair hints surfaced for visibility. */
  warnings: string[];
  /** One-line human-readable diagnosis. */
  summary:  string;
}

// ─── GenerationResult ─────────────────────────────────────────────────────────

/**
 * Output of a single generation run through GenerationPipeline.
 *
 * `graph` is always present and is the authoritative result.
 * `operations` is a backward-compat diff view — derived, not primary.
 */
export interface GenerationResult {
  id:            string;
  status:        GenerationStatus;
  /** The updated ProjectGraph — primary source of truth */
  graph:         ProjectGraph;
  /** Diff-view for legacy consumers — derived from graph delta */
  operations:    FileOperation[];
  /** Full AI response text (markdown) */
  message:       string;
  thinkingText?: string;
  phase:         AgentPhase;
  usedModel:     string;
  usage?:        UsageData;
  selfCorrected: boolean;
  iterations:    number;
  durationMs:    number;
  error?:        string;
  createdAt:     string;
  /** Theme selected by Architect (dark-slate, trust, warm, neon, bloom) */
  planTheme?:    string;
  /**
   * Structured change package — the canonical output of GenerationPipeline v5+.
   *
   * All guard results, routes, dependencies, and preview metadata live here.
   * New code must read from `changePackage`; the flat fields below are kept
   * for backward compatibility only.
   */
  changePackage: ChangePackage;

  // ── Deprecated flat fields — read from changePackage instead ────────────────

  /**
   * @deprecated since v5 — use result.changePackage.guardResults.runtime
   * Kept for backward compatibility; populated from changePackage.
   */
  runtimeGuard?: {
    passed:        boolean;
    repairPayload: {
      failingFiles: string[];
      reasons: Array<{
        code:     string;
        filePath: string;
        message:  string;
        subject?: string;
      }>;
    };
    durationMs: number;
  };
  /**
   * @deprecated since v5 — use result.changePackage.guardResults.integration
   * Kept for backward compatibility; populated from changePackage.
   */
  integrationReport?: {
    isHealthy:     boolean;
    totalIssues:   number;
    fixedCount:    number;
    reportedCount: number;
    unresolvedIssues: Array<{
      kind:     string;
      message:  string;
      filePath: string;
    }>;
  };
  /**
   * @deprecated since v5 — use result.changePackage.guardResults.integrity
   * Kept for backward compatibility; populated from changePackage.
   */
  integrityGuard?: {
    passed:     boolean;
    errorCount: number;
    warnCount:  number;
    errors: Array<{
      code:     string;
      filePath: string;
      message:  string;
    }>;
    durationMs: number;
  };

  // ── Deprecated v4 flat fields — read from changePackage instead ──────────────

  /**
   * @deprecated since v5 — use result.changePackage.plan
   * Structured plan extracted from AI reasoning sections.
   */
  plan?: StructuredPlan;

  /**
   * @deprecated since v5 — use result.changePackage.routeManifest
   */
  routeManifest?: GenerationRouteEntry[];

  /**
   * @deprecated since v5 — use result.changePackage.dependencies
   */
  dependencies: DependencySpec[];

  /**
   * @deprecated since v5 — use result.changePackage.previewMeta
   */
  previewMeta: PreviewMeta;

  /**
   * @deprecated since v5 — use result.changePackage.warnings
   * Previously UnifiedWarning[], kept typed for backward compat.
   */
  warnings: UnifiedWarning[];

  /**
   * @deprecated since v5 — use result.changePackage.repairHints
   */
  repairHints: RepairHint[];

  /**
   * When set, indicates the generation pipeline wrote files directly to
   * preview-sandbox/<revisionId>/ via /__write_file and registered the entry
   * via /__preview_entry.  useStudio should set the iframe src to
   * /preview?v=<directSandboxRevision> and skip ProjectService + materialization.
   */
  directSandboxRevision?: string;

  /**
   * Lightweight per-run quality summary built from structured signals
   * (guardResults, routeManifest, previewMeta, warnings, repairHints).
   *
   * Populated by GenerationQualityService.evaluate() in SimpleGeneration.
   * Undefined on cancelled or pre-v5 results.
   */
  qualitySummary?: GenerationQualitySummary;
}

// ─── Preview Lifecycle (readiness gate) ───────────────────────────────────────

/**
 * Preview state machine stages for the active generation request.
 * A request is complete only on 'preview-ready' or a terminal stage (blocked/failed).
 */
export type PreviewLifecycleStage =
  | 'idle'
  | 'generating'
  | 'validating'
  | 'committing'
  | 'materializing'
  | 'preview-ready'
  | 'blocked'
  | 'failed'
  /** New revision failed but last materialized working revision is still shown in iframe */
  | 'degraded';

// ─── Materialize diagnostic stages ───────────────────────────────────────────

/**
 * Fine-grained stages inside materializeRevision / iframe lifecycle.
 * Each stage represents an explicit checkpoint; on failure the last reached
 * stage plus the error message are persisted and shown in the UI.
 */
export type PreviewMaterializeStage =
  | 'source-ready'
  | 'entry-resolved'
  | 'sandbox-written'
  | 'bootstrap-written'
  | 'preview-entry-registered'
  | 'iframe-mounted'
  | 'iframe-ready';

/**
 * Diagnostic snapshot emitted at every materialize checkpoint.
 * Stored in SandpackPreview state and persisted in the preview passport.
 */
export interface PreviewDiagnosticState {
  stage: PreviewMaterializeStage;
  revisionId: string | null;
  entryPath: string | null;
  error: { stage: PreviewMaterializeStage; message: string } | null;
  updatedAt: string;
}

/**
 * Structured blocked/failed info surfaced in UI when preview cannot be opened.
 */
export interface PreviewBlockedInfo {
  stage:      PreviewLifecycleStage;
  code:       string;
  message:    string;
  revisionId: string | null;
}

/**
 * Full preview lifecycle state — exposed from useStudio, consumed by PreviewCanvas.
 */
export interface PreviewLifecycleState {
  stage:   PreviewLifecycleStage;
  blocked: PreviewBlockedInfo | null;
  /** The source revision ID that must be confirmed in the sandbox. */
  pendingRevisionId: string | null;
  /**
   * When stage is 'degraded': the sandbox revision ID currently shown as fallback.
   * Null in all other stages.
   */
  lastMaterializedRevisionId: string | null;
}

// ─── ExportArtifact ──────────────────────────────────────────────────────────

export interface ExportArtifactMeta {
  fileCount:           number;
  routeCount:          number;
  featureCount:        number;
  includesSql:         boolean;
  includesEnvTemplate: boolean;
  targetNodeVersion?:  string;
}

/**
 * A downloadable artifact derived from a ProjectGraph.
 * Graph → ExportArtifact conversion happens in ExportService.
 */
export interface ExportArtifact {
  id:         string;
  /** Source ProjectGraph.id */
  graphId:    string;
  format:     ExportFormat;
  /** Suggested filename for download */
  name:       string;
  /** Hosted download URL, if available */
  url?:       string;
  /** In-memory blob, if freshly generated */
  blob?:      Blob;
  sizeBytes?: number;
  /** djb2 checksum of serialised content */
  checksum?:  string;
  createdAt:  string;
  expiresAt?: string;
  meta:       ExportArtifactMeta;
}

// ─── Utility: djb2 hash ───────────────────────────────────────────────────────

/**
 * djb2 hash — deterministic, browser-safe, zero external dependencies.
 * Used for FileBlueprint.id and FileBlueprint.hash.
 */
export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/** Derive a stable FileBlueprint.id from its path */
export function fileBlueprintId(path: string): string {
  return djb2Hash(path);
}

// ─── Utility: FileRole / FileLanguage inference ───────────────────────────────

/** Infer FileRole from a file path */
export function inferFileRole(path: string): FileRole {
  const p = path.toLowerCase();
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(p))            return 'test';
  if (/(^|\/)(app|main|index)\.(tsx?|jsx?)$/.test(p))   return 'entry';
  if (/(^|\/)pages?\//i.test(p))                         return 'page';
  if (/(^|\/)layouts?\//i.test(p))                       return 'layout';
  if (/(^|\/)hooks?\//i.test(p))                         return 'hook';
  if (/(^|\/)services?\//i.test(p))                      return 'service';
  if (/(^|\/)types?\//i.test(p) || /\.d\.ts$/.test(p))  return 'type';
  if (/(^|\/)utils?\//i.test(p))                         return 'util';
  if (/(^|\/)components?\//i.test(p))                    return 'component';
  if (/\.(css|scss|less)$/.test(p))                      return 'style';
  if (/\.sql$/.test(p))                                  return 'schema';
  if (/\.(json|ya?ml|\.env.*)$/.test(p))                 return 'config';
  if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?)$/.test(p)) return 'asset';
  return 'util';
}

/** Infer FileLanguage from a file path */
export function inferFileLanguage(path: string): FileLanguage {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, FileLanguage> = {
    tsx: 'tsx', ts: 'ts', jsx: 'jsx', js: 'js',
    css: 'css', scss: 'scss',
    json: 'json', sql: 'sql', html: 'html', md: 'md',
    yaml: 'yaml', yml: 'yaml', env: 'env',
  };
  return (map[ext] as FileLanguage | undefined) ?? 'ts';
}

// ─── Utility: route inference ────────────────────────────────────────────────

/**
 * Derive a RouteSpec from a page-file path.
 *
 * Handles paths like:
 *   pages/HomePage.tsx       → /        (isIndex)
 *   pages/AboutPage.tsx      → /about
 *   pages/Settings.tsx       → /settings
 *   src/pages/Dashboard.tsx  → /dashboard
 */
function inferRouteFromPageFile(file: FileBlueprint): RouteSpec {
  const basename = file.path.split('/').pop() ?? file.path;
  // Strip extension, then strip trailing 'Page'
  const name  = basename.replace(/\.(tsx?|jsx?)$/, '').replace(/Page$/i, '');
  const slug  = name.toLowerCase();
  const isIdx = slug === 'home' || slug === 'index' || slug === '';
  return {
    id:              djb2Hash(`route:${file.path}`),
    path:            isIdx ? '/' : `/${slug}`,
    fileBlueprintId: file.id,
    filePath:        file.path,
    title:           name,
    isIndex:         isIdx,
    isProtected:     false,
    params:          [],
    children:        [],
  };
}

/**
 * Sync the routes[] in a graph with its current page-role files.
 * Adds routes for new page files; removes routes whose file no longer exists;
 * leaves existing routes unchanged (preserves hand-authored overrides).
 *
 * Exported so OperationEngine can call it without circular imports.
 */
export function syncRoutes(files: FileBlueprint[], existingRoutes: RouteSpec[]): RouteSpec[] {
  const pageFiles = files.filter(f => f.role === 'page');
  const routedIds = new Set(existingRoutes.map(r => r.fileBlueprintId));

  // Add missing routes
  const added = pageFiles
    .filter(f => !routedIds.has(f.id))
    .map(f => inferRouteFromPageFile(f));

  // Remove routes whose page file was deleted
  const existingFileIds = new Set(files.map(f => f.id));
  const retained = existingRoutes.filter(
    r => !r.fileBlueprintId || existingFileIds.has(r.fileBlueprintId),
  );

  return [...retained, ...added];
}

// ─── Utility: graph construction ─────────────────────────────────────────────

/**
 * Bootstrap a ProjectGraph from a flat FileMap (legacy bridge).
 *
 * All metadata is inferred from paths.  Callers should patch
 * manifest / routes / features after construction.
 */
export function fileMapToProjectGraph(
  files:      Record<string, string>,
  projectId:  string,
  revisionId: string,
  partial?:   Partial<Pick<ProjectGraph, 'manifest' | 'routes' | 'features' | 'externalDependencies'>>,
): ProjectGraph {
  const now = new Date().toISOString();

  const blueprints: FileBlueprint[] = Object.entries(files).map(
    ([path, content]): FileBlueprint => ({
      id:           fileBlueprintId(path),
      path,
      content,
      role:         inferFileRole(path),
      language:     inferFileLanguage(path),
      exports:      [],
      dependencies: [],
      hash:         djb2Hash(content),
      generatedAt:  now,
      generatedBy:  'ai',
      isProtected:  false,
      userZones:    [],
    }),
  );

  const entryFile = blueprints.find(f => f.role === 'entry') ?? blueprints[0];

  const defaultManifest: ProductManifest = {
    version:         1,
    id:              djb2Hash(`${projectId}:${revisionId}`),
    name:            'Untitled Project',
    description:     '',
    intent:          '',
    targetPlatforms: ['web'],
    techStack: {
      framework:       'react',
      language:        'typescript',
      styling:         'tailwind',
      bundler:         'vite',
      backend:         null,
      stateManagement: 'context',
    },
    createdAt: now,
    updatedAt: now,
  };

  // Infer routes from page files when caller does not supply them.
  const routes = partial?.routes ?? syncRoutes(blueprints, []);

  return {
    version:              1,
    id:                   djb2Hash(`graph:${projectId}:${revisionId}:${now}`),
    projectId,
    revisionId,
    manifest:             partial?.manifest ?? defaultManifest,
    files:                blueprints,
    routes,
    features:             partial?.features             ?? [],
    externalDependencies: partial?.externalDependencies ?? [],
    entryFileId:          entryFile?.id ?? '',
    createdAt:            now,
    updatedAt:            now,
  };
}

// ─── Utility: graph projection ────────────────────────────────────────────────

/**
 * Derive the flat FileMap from a ProjectGraph.
 *
 * Sanctioned projection points: PreviewAdapter.toFileMap(), ExportAdapter.toFileTree(),
 * useStudio derived-files memo, and the legacy bridge in Orchestrator.
 * All other callers should operate on ProjectGraph directly.
 *
 * @deprecated — use ProjectGraph directly where possible. FileMap loses routes,
 *   features, dependencies, and manifest metadata. Only use this at sanctioned
 *   projection boundaries (preview sandbox, export, legacy FileMap consumers).
 */
export function projectGraphToFileMap(graph: ProjectGraph): Record<string, string> {
  return Object.fromEntries(graph.files.map(f => [f.path, f.content]));
}

// ─── Utility: graph mutation ──────────────────────────────────────────────────

/**
 * Apply FileOperation[] to a ProjectGraph and return a new graph.
 *
 * Backward-compatible implementation — handles upsert / patch / delete / rename.
 * For rename ops, updates the file path only (no cross-file import rewriting).
 * Use OperationEngine.apply() when you need dryRun, protectedPaths, rollback,
 * or full import-path rewriting on rename.
 *
 * Returns a new object — the input graph is not mutated.
 */
export function applyOperationsToGraph(
  graph: ProjectGraph,
  ops:   FileOperation[],
): ProjectGraph {
  const now   = new Date().toISOString();
  let   files = [...graph.files];

  for (const op of ops) {
    if (op.op === 'delete') {
      files = files.filter(f => f.path !== op.name);

    } else if (op.op === 'upsert') {
      const idx = files.findIndex(f => f.path === op.name);
      const blueprint: FileBlueprint = {
        id:           fileBlueprintId(op.name),
        path:         op.name,
        content:      op.content,
        role:         inferFileRole(op.name),
        language:     inferFileLanguage(op.name),
        exports:      [],
        dependencies: [],
        hash:         djb2Hash(op.content),
        generatedAt:  now,
        generatedBy:  'ai',
        isProtected:  false,
        userZones:    [],
      };
      if (idx >= 0) {
        // Preserve user-editable fields when updating an existing file
        files[idx] = {
          ...blueprint,
          isProtected: files[idx].isProtected,
          userZones:   files[idx].userZones,
          generatedBy: files[idx].generatedBy === 'user' ? 'user' : 'ai',
        };
      } else {
        files.push(blueprint);
      }

    } else if (op.op === 'patch') {
      const idx = files.findIndex(f => f.path === op.name);
      if (idx >= 0) {
        let content = files[idx].content;
        for (const d of op.diff) content = content.replace(d.find, d.replace);
        files[idx] = {
          ...files[idx],
          content,
          hash:        djb2Hash(content),
          generatedAt: now,
        };
      }

    } else if (op.op === 'rename') {
      // Simple path update — no cross-file import rewriting.
      // For import rewriting use OperationEngine.apply() instead.
      const idx = files.findIndex(f => f.path === op.from);
      if (idx >= 0) {
        const toNorm = op.to.startsWith('/') ? op.to : `/${op.to}`;
        files[idx] = {
          ...files[idx],
          id:          fileBlueprintId(toNorm),
          path:        toNorm,
          role:        inferFileRole(toNorm),
          language:    inferFileLanguage(toNorm),
          generatedAt: now,
        };
      }
    }
  }

  const entryFile = files.find(f => f.role === 'entry') ?? files[0];

  // Keep routes[] in sync: add routes for new page files, drop routes for deleted files.
  const routes = syncRoutes(files, graph.routes);

  return {
    ...graph,
    files,
    routes,
    entryFileId: entryFile?.id ?? graph.entryFileId,
    updatedAt:   now,
  };
}

// ─── Utility: legacy bridge ───────────────────────────────────────────────────

/**
 * Wrap a bare OrchestratorResult in a GenerationResult.
 *
 * Used while Orchestrator is still the generation backend.
 * Once GenerationPipeline owns the full pipeline, this bridge can be removed.
 */
export function wrapOrchestratorResult(
  orcResult: { message: string; operations: FileOperation[] },
  baseGraph: ProjectGraph,
  meta: {
    id:            string;
    usedModel:     string;
    selfCorrected: boolean;
    iterations:    number;
    durationMs:    number;
    phase:         AgentPhase;
    usage?:        UsageData;
    thinkingText?: string;
  },
): GenerationResult {
  const updatedGraph = applyOperationsToGraph(baseGraph, orcResult.operations);
  const entryFile    = updatedGraph.files.find(f => f.id === updatedGraph.entryFileId)?.path ?? 'src/main.tsx';

  // Minimal ChangePackage — guard results are empty (this bridge bypasses the pipeline)
  const changePackage: ChangePackage = {
    plan:           updatedGraph.manifest.inferenceNotes ?? [],
    graph:          updatedGraph,
    fileOperations: orcResult.operations,
    routeManifest:  { routes: updatedGraph.routes, isMultiPage: updatedGraph.manifest.isMultiPage ?? false },
    dependencies:   updatedGraph.externalDependencies ?? [],
    previewMeta:    { entryFile, capabilities: updatedGraph.manifest.neededCapabilities?.map(c => c.id) ?? [] },
    guardResults: {
      integration: { isHealthy: true, totalIssues: 0, fixedCount: 0, reportedCount: 0, unresolvedIssues: [], durationMs: 0 },
      integrity:   { passed: true, errorCount: 0, warnCount: 0, errors: [], warnings: [], durationMs: 0 },
      runtime:     { passed: true, failingFiles: [], reasons: [], durationMs: 0 },
    },
    warnings:    [],
    repairHints: [],
  };

  return {
    ...meta,
    status:     'complete',
    graph:      updatedGraph,
    operations: orcResult.operations,
    message:    orcResult.message,
    error:      undefined,
    createdAt:  new Date().toISOString(),
    // ── v5 canonical contract ─────────────────────────────────────────────────
    changePackage,
    // ── deprecated flat fields (populated from changePackage for compat) ──────
    dependencies: changePackage.dependencies,
    previewMeta:  {
      entryFile,
      framework:   updatedGraph.manifest.techStack.framework,
      isMultiPage: updatedGraph.manifest.isMultiPage ?? false,
    },
    warnings:    [],
    repairHints: [],
  };
}

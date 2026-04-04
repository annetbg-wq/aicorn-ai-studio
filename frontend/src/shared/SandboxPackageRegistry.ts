/**
 * SandboxPackageRegistry.ts — Canonical Package & Capability Registry  (v2)
 *
 * Single source of truth for:
 *   SANDBOX_SAFE_PACKAGES      — packages pre-installed in the Vite preview sandbox
 *   CAPABILITY_EXPORT_PACKAGES — capability → packages for the exported project (may not be sandbox-safe)
 *   CAPABILITY_ENV_VARS        — capability → VITE_* env vars required at runtime
 *   PATH_ALIAS_PREFIXES        — '@/' and other local path aliases (NOT npm packages)
 *
 * Consumers — each derives its knowledge from this file, nothing is hardcoded elsewhere:
 *   SandboxMaterializeService  → re-exports SANDBOX_SAFE_PACKAGES as SUPPORTED_SANDBOX_PACKAGES
 *   RuntimeGuard               → validates non-relative imports against SANDBOX_SAFE_PACKAGES
 *   BatchGenerator             → builds AI system-prompt package whitelist + fallback table
 *   ManifestPlanner            → derives export npm deps + env DependencySpecs per capability
 *   ExportAdapter              → enriches .env.example with per-key descriptions
 *   CapabilityBootstrap        → reads cdnUrl/cdnCssUrl to inject CDN scripts per revision
 *
 * Import classification rules (mirrors classifyImport in RuntimeGuard):
 *   './foo', '../foo', '/foo'   → relative / absolute local path   — skip package check
 *   '@/lib/utils'               → Vite path alias (local module)    — skip package check
 *   '@scope/pkg', 'pkg'         → external npm package             — check against this registry
 *
 * Capability-gated packages (e.g. @stripe/stripe-js, chart.js):
 *   - NOT in SANDBOX_SAFE_PACKAGES (not installed in frontend/node_modules)
 *   - Listed in CAPABILITY_EXPORT_PACKAGES with a previewFallback strategy + cdnUrl
 *   - CapabilityBootstrap generates _runtime/ adapter files so AI can use normal ESM imports
 *   - vite-plugin-write-files resolveId redirects 'chart.js' → '_runtime/chart.ts' per revision
 *   - RuntimeGuard skips packages declared in the project's neededCapabilities
 *   - 'import type { X } from pkg' is type-only and is erased by esbuild — not blocked
 */

import type { CapabilityId } from './projectModel';

// ─── Types ────────────────────────────────────────────────────────────────────

/** How the preview sandbox should handle a package that is not sandbox-safe. */
export type PreviewFallbackKind = 'fetch-rest' | 'cdn' | 'native' | 'inline';

/** One entry in CAPABILITY_EXPORT_PACKAGES. */
export interface CapabilityPackageSpec {
  /** npm package name */
  name:    string;
  /** semver range for export package.json */
  version: string;
  /** true → goes into devDependencies of the exported project */
  dev?:    boolean;
  /**
   * How the preview runtime handles this package.
   * 'fetch-rest' — CapabilityBootstrap generates a fetch()-based adapter in _runtime/
   * 'cdn'        — CapabilityBootstrap injects <script src="cdnUrl"> + writes _runtime/ shim
   * 'native'     — CapabilityBootstrap generates a browser-API stub in _runtime/
   * 'inline'     — tiny inline implementation, no external dep
   */
  previewFallback?:     PreviewFallbackKind;
  /** One-line note for the AI system prompt: what to use in preview code instead. */
  previewFallbackNote?: string;
  /**
   * CDN <script src="…"> URL for packages with previewFallback === 'cdn'.
   * CapabilityBootstrap injects this into the per-revision preview HTML.
   * Loaded before the ESM bootstrap so window globals are available.
   */
  cdnUrl?: string;
  /**
   * CDN <link href="…" rel="stylesheet"> URL (CSS companion for some packages, e.g. Leaflet).
   * CapabilityBootstrap injects this as a <link> tag in the preview HTML.
   */
  cdnCssUrl?: string;
}

/** One entry in CAPABILITY_ENV_VARS. */
export interface CapabilityEnvSpec {
  /** VITE_* env variable name */
  key:         string;
  /** Short description for .env.example comment */
  description: string;
}

// ─── Sandbox-safe packages ────────────────────────────────────────────────────

/**
 * Packages installed in frontend/node_modules that Vite serves to the preview
 * sandbox iframe.  Keep in sync with frontend/package.json "dependencies".
 *
 * This is the ONLY authoritative list.
 *   SandboxMaterializeService re-exports this as SUPPORTED_SANDBOX_PACKAGES.
 *   RuntimeGuard.validateRuntimeSymbols() checks against this set.
 *   BatchGenerator derives its AI system-prompt whitelist from this set.
 *
 * To add a new sandbox-safe package:
 *   1. Install it in frontend/ (npm install <pkg>)
 *   2. Add it here
 *   3. No other changes required — all consumers update automatically.
 */
export const SANDBOX_SAFE_PACKAGES: ReadonlySet<string> = new Set([
  // ── runtime deps (frontend/package.json "dependencies") ──────────────────
  'react',
  'react-dom',
  'react-router-dom',
  'lucide-react',
  'react-markdown',
  'remark-gfm',
  'framer-motion',
  '@google/generative-ai',
  '@supabase/supabase-js',
  '@tanstack/react-query',
  '@tanstack/react-query-devtools',
  'axios',
  'zustand',
  // ── shadcn/ui — Radix UI primitives + utility libs ───────────────────────
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-select',
  '@radix-ui/react-tabs',
  '@radix-ui/react-toast',
  '@radix-ui/react-tooltip',
  '@radix-ui/react-popover',
  '@radix-ui/react-slot',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  // ── Vite-injected internals (never user-written; safe to allow) ───────────
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]);

// ─── Capability → export-only packages ───────────────────────────────────────

/**
 * Maps each CapabilityId to the npm packages required in the EXPORTED project.
 *
 * @supabase/supabase-js IS in SANDBOX_SAFE_PACKAGES — the SDK is fully
 * available in the preview sandbox.  No fetch-based fallbacks needed.
 */
export const CAPABILITY_EXPORT_PACKAGES: Partial<Record<CapabilityId, CapabilityPackageSpec[]>> = {
  // ── Supabase-backed capabilities (SDK available in sandbox) ──────────────
  auth:     [{ name: '@supabase/supabase-js', version: '^2.39.0' }],
  database: [{ name: '@supabase/supabase-js', version: '^2.39.0' }],
  realtime: [{ name: '@supabase/supabase-js', version: '^2.39.0' }],
  storage:  [{ name: '@supabase/supabase-js', version: '^2.39.0' }],

  // ── Payments ─────────────────────────────────────────────────────────────
  payments: [{
    name: '@stripe/stripe-js', version: '^3.0.0', previewFallback: 'cdn',
    cdnUrl: 'https://js.stripe.com/v3/',
    previewFallbackNote: 'CapabilityBootstrap injects Stripe.js CDN; use `import { loadStripe } from \'@stripe/stripe-js\'` normally',
  }],

  // ── AI — @google/generative-ai IS sandbox-safe; openai gets fetch-REST adapter ──
  ai: [{
    name: 'openai', version: '^4.0.0', previewFallback: 'fetch-rest',
    previewFallbackNote: 'CapabilityBootstrap generates a fetch()-based OpenAI adapter; use `import OpenAI from \'openai\'` normally',
  }],

  // ── Visualisation — CDN in preview via CapabilityBootstrap ───────────────
  charts: [
    {
      name: 'chart.js', version: '^4.4.0', previewFallback: 'cdn',
      cdnUrl: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
      previewFallbackNote: 'CapabilityBootstrap injects chart.js CDN; use `import { Chart } from \'chart.js\'` normally',
    },
    {
      name: 'react-chartjs-2', version: '^5.2.0', previewFallback: 'cdn',
      previewFallbackNote: 'CapabilityBootstrap generates a React wrapper adapter; use `import { Bar, Line } from \'react-chartjs-2\'` normally',
    },
  ],
  maps: [{
    name: 'leaflet', version: '^1.9.0', previewFallback: 'cdn',
    cdnUrl:    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    cdnCssUrl: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    previewFallbackNote: 'CapabilityBootstrap injects Leaflet CDN; use `import L from \'leaflet\'` normally',
  }],
  export: [{
    name: 'jspdf', version: '^2.5.1', previewFallback: 'cdn',
    cdnUrl: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    previewFallbackNote: 'CapabilityBootstrap injects jsPDF CDN; use `import { jsPDF } from \'jspdf\'` normally',
  }],
  ocr: [{
    name: 'tesseract.js', version: '^5.1.0', previewFallback: 'cdn',
    cdnUrl: 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',
    previewFallbackNote: 'CapabilityBootstrap injects Tesseract.js CDN; use `import Tesseract from \'tesseract.js\'` normally',
  }],

  // ── i18n — native browser-API adapters ───────────────────────────────────
  i18n: [
    {
      name: 'i18next', version: '^23.0.0', previewFallback: 'native',
      previewFallbackNote: 'CapabilityBootstrap generates a navigator.language-based adapter; use `import i18n from \'i18next\'` normally',
    },
    {
      name: 'react-i18next', version: '^14.0.0', previewFallback: 'native',
      previewFallbackNote: 'CapabilityBootstrap generates a React hook adapter; use `import { useTranslation } from \'react-i18next\'` normally',
    },
  ],
};

// ─── Capability → required env vars ──────────────────────────────────────────

/**
 * Maps each CapabilityId to the VITE_* env vars its runtime code requires.
 *
 * ManifestPlanner uses this to add 'env' DependencySpecs to the ProjectGraph.
 * ExportAdapter reads those DependencySpecs to generate .env.example.
 * The description field is used as an inline comment in .env.example.
 */
export const CAPABILITY_ENV_VARS: Partial<Record<CapabilityId, CapabilityEnvSpec[]>> = {
  auth: [
    { key: 'VITE_SUPABASE_URL',      description: 'Supabase project URL (e.g. https://xyz.supabase.co)' },
    { key: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anon (public) API key' },
  ],
  database: [
    { key: 'VITE_SUPABASE_URL',      description: 'Supabase project URL (e.g. https://xyz.supabase.co)' },
    { key: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anon (public) API key' },
  ],
  realtime: [
    { key: 'VITE_SUPABASE_URL',      description: 'Supabase project URL (e.g. https://xyz.supabase.co)' },
    { key: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anon (public) API key' },
  ],
  storage: [
    { key: 'VITE_SUPABASE_URL',      description: 'Supabase project URL (e.g. https://xyz.supabase.co)' },
    { key: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anon (public) API key' },
  ],
  payments: [
    { key: 'VITE_STRIPE_PK', description: 'Stripe publishable key (pk_live_… or pk_test_…)' },
  ],
  ai: [
    { key: 'VITE_OPENAI_API_KEY', description: 'OpenAI API key — use server-side only; do not expose in browser bundles' },
  ],
};

// ─── Path alias prefixes ──────────────────────────────────────────────────────

/**
 * Path alias prefixes that identify LOCAL project modules.
 * A specifier starting with any of these is NOT an npm package and must never
 * be validated against the package registry.
 *
 * '@/' is the canonical Vite alias resolving to src/ (e.g. '@/lib/utils' → 'src/lib/utils').
 * It must never be confused with scoped npm packages like '@tanstack/react-query'.
 */
export const PATH_ALIAS_PREFIXES: readonly string[] = ['@/'];

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Returns true when an import specifier resolves to a package that is
 * pre-installed in the preview sandbox (SANDBOX_SAFE_PACKAGES).
 *
 * Returns false for:
 *   - relative imports ('.' or '/')
 *   - path alias imports ('@/')
 *   - export-only packages (@supabase/supabase-js, chart.js, openai, etc.)
 */
export function isSandboxSafe(specifier: string): boolean {
  if (!specifier) return false;
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
  if (specifier.startsWith('@/')) return false; // local alias — not a package
  if (SANDBOX_SAFE_PACKAGES.has(specifier)) return true;
  // Root-package fallback: 'react-dom/client' is covered by 'react-dom'
  const root = specifier.startsWith('@') ? specifier : specifier.split('/')[0];
  return SANDBOX_SAFE_PACKAGES.has(root);
}

/**
 * Returns all unique export packages required by the given capabilities.
 * Deduplicates by package name (first occurrence wins).
 *
 * Used by ManifestPlanner to populate graph.externalDependencies with
 * the npm packages that belong in the exported project's package.json.
 */
export function getExportPackages(capabilityIds: CapabilityId[]): CapabilityPackageSpec[] {
  const seen   = new Set<string>();
  const result: CapabilityPackageSpec[] = [];
  for (const id of capabilityIds) {
    for (const pkg of CAPABILITY_EXPORT_PACKAGES[id] ?? []) {
      if (!seen.has(pkg.name)) {
        seen.add(pkg.name);
        result.push(pkg);
      }
    }
  }
  return result;
}

/**
 * Returns unique env var specs required by the given capabilities.
 * Deduplicates by key (first occurrence wins).
 *
 * Used by ManifestPlanner to add 'env' DependencySpecs;
 * ExportAdapter builds .env.example from those DependencySpecs.
 */
export function getRequiredEnvVars(capabilityIds: CapabilityId[]): CapabilityEnvSpec[] {
  const seen   = new Set<string>();
  const result: CapabilityEnvSpec[] = [];
  for (const id of capabilityIds) {
    for (const env of CAPABILITY_ENV_VARS[id] ?? []) {
      if (!seen.has(env.key)) {
        seen.add(env.key);
        result.push(env);
      }
    }
  }
  return result;
}

/**
 * Returns a map of package-name → fallback note for every export-only package
 * that declares a previewFallback policy.
 *
 * BatchGenerator uses this to build the "unsupported packages → fallback"
 * section of the AI system prompt — derived from the registry, not hardcoded.
 */
export function getPreviewFallbackMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pkgs of Object.values(CAPABILITY_EXPORT_PACKAGES)) {
    for (const pkg of pkgs ?? []) {
      if (!map.has(pkg.name) && pkg.previewFallback) {
        map.set(pkg.name, pkg.previewFallbackNote ?? `use an alternative (${pkg.previewFallback})`);
      }
    }
  }
  return map;
}

/**
 * Returns the set of package names that have a previewFallback defined in the
 * capability registry but are NOT in SANDBOX_SAFE_PACKAGES and do NOT have a
 * runtime adapter (cdnUrl / fetch-rest / native).
 *
 * After CapabilityBootstrap was introduced, ALL packages with previewFallback have
 * _runtime/ adapters generated when the relevant capability is declared. This function
 * now returns an empty set — CapabilityBootstrap handles resolution at runtime.
 *
 * Kept for backward compatibility; RuntimeGuard uses allowedRuntimePackages instead.
 *
 * @deprecated Use getRuntimeAdapterPackages() to check if a package has an adapter.
 */
export function getFallbackOnlyPackages(): ReadonlySet<string> {
  // All previewFallback packages now have _runtime/ adapters via CapabilityBootstrap.
  // RuntimeGuard receives the declared-capability package set and skips them.
  return new Set<string>();
}

/**
 * Returns all package names that have a previewFallback policy defined (i.e. packages
 * for which CapabilityBootstrap can generate a _runtime/ adapter when the capability
 * is declared). These packages are allowed through RuntimeGuard when explicitly listed
 * in the project's neededCapabilities.
 *
 * RuntimeGuard receives this set as `allowedRuntimePackages` from GenerationPipeline.
 */
export function getRuntimeAdapterPackages(capabilityIds: CapabilityId[]): ReadonlySet<string> {
  const set = new Set<string>();
  for (const id of capabilityIds) {
    for (const pkg of CAPABILITY_EXPORT_PACKAGES[id] ?? []) {
      if (pkg.previewFallback && !SANDBOX_SAFE_PACKAGES.has(pkg.name)) {
        set.add(pkg.name);
      }
    }
  }
  return set;
}

/**
 * Returns CDN script URLs and CSS stylesheet URLs for all capability packages
 * that have a cdnUrl or cdnCssUrl defined.  Used by CapabilityBootstrap.
 *
 * Deduplicates by URL (first occurrence wins).
 */
export function getPreviewCdnAssets(
  capabilityIds: CapabilityId[],
): { scripts: string[]; styles: string[] } {
  const seenScripts = new Set<string>();
  const seenStyles  = new Set<string>();
  const scripts: string[] = [];
  const styles:  string[] = [];

  for (const id of capabilityIds) {
    for (const pkg of CAPABILITY_EXPORT_PACKAGES[id] ?? []) {
      if (pkg.cdnUrl && !seenScripts.has(pkg.cdnUrl)) {
        seenScripts.add(pkg.cdnUrl);
        scripts.push(pkg.cdnUrl);
      }
      if (pkg.cdnCssUrl && !seenStyles.has(pkg.cdnCssUrl)) {
        seenStyles.add(pkg.cdnCssUrl);
        styles.push(pkg.cdnCssUrl);
      }
    }
  }
  return { scripts, styles };
}

/**
 * Look up the human description for an env var key from any capability mapping.
 * Returns undefined when the key is not registered.
 *
 * ExportAdapter uses this to add an inline comment above each var in .env.example.
 */
export function getEnvDescription(key: string): string | undefined {
  for (const envSpecs of Object.values(CAPABILITY_ENV_VARS)) {
    for (const spec of envSpecs ?? []) {
      if (spec.key === key) return spec.description;
    }
  }
  return undefined;
}

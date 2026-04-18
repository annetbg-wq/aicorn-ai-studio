/**
 * Orchestrator.ts — v11 Economic Intelligence Layer
 *
 * Self-correction priority:
 *   1. Local regex (zero cost)  →  2. Lightweight model  →  3. Main model
 * Max 2 API attempts per request. Budget guard blocks calls at 90% spent.
 *
 * Primitive types (LLMMessage, FileOperation, AgentPhase, etc.) are
 * defined in shared/projectModel.ts and re-exported here for backward compat.
 */

import { Dispatcher }     from './ai/dispatcher';
import { ScannerService } from './ScannerService';
import { metricsService } from './MetricsService';
import { promptRegistry } from './PromptRegistry';
import { ConfigService }  from './ConfigService';
import { buildArtistLayerPrompt } from './designSystem';
import type { AgentSlot, ApiProvider } from './ConfigService';
import { ORCHESTRATOR_TIMEOUT_MS, withOrchestratorTimeout } from './orchestratorTimeout';
import {
  fileMapToProjectGraph,
  applyOperationsToGraph,
  projectGraphToFileMap,
  type ProjectGraph,
  type FileOperation,
  type FileDiff,
  type ChatRole,
  type ContentPart,
  type LLMMessage,
  type ChatMessage,
  type UsageData,
  type AgentPhase,
  type PhaseEvent,
} from '../shared/projectModel';
import { llmFetch, llmFetchStream } from './LLMProxy';

export { ORCHESTRATOR_TIMEOUT_MS, withOrchestratorTimeout };

// Re-export primitives so existing imports of Orchestrator keep working
export type {
  FileOperation,
  FileDiff,
  ChatRole,
  ContentPart,
  LLMMessage,
  ChatMessage,
  UsageData,
  AgentPhase,
  PhaseEvent,
  ProjectGraph,
};

export interface OrchestratorResult {
  message:    string;
  operations: FileOperation[];
  /** ProjectGraph after all operations have been applied. Always present. */
  graph:      ProjectGraph;
  /**
   * True when the model returned substantial code but NOT in <!--FILE:-->
   * marker format. Callers should retry with an explicit format instruction.
   */
  parseFailure?: boolean;
}

/**
 * Build a ProjectGraph from the current FileMap after applying a result's ops.
 * Convenience wrapper used by callers that only have a FileMap + result.
 */
export function buildProjectGraph(
  files:      Record<string, string>,
  result:     Pick<OrchestratorResult, 'operations'>,
  projectId:  string,
  revisionId: string,
): ProjectGraph {
  const base    = fileMapToProjectGraph(files, projectId, revisionId);
  return applyOperationsToGraph(base, result.operations);
}

// ---- applyOperations — thin wrapper around applyOperationsToGraph ----

export const applyOperations = (
  files: Record<string, string>,
  ops:   FileOperation[]
): Record<string, string> => {
  const graph  = fileMapToProjectGraph(files, '', '');
  const result = applyOperationsToGraph(graph, ops);
  return projectGraphToFileMap(result);
};

// ---- Parser ----

/**
 * Sanitize a string extracted from inside FILE markers.
 * Removes any leaked <think>...</think> blocks and leading/trailing whitespace.
 */
const sanitizeFileContent = (content: string): string => {
  content = content.replace(/<!--\/?FILE:[^>]*-->/g, '').replace(/<!--\/FILE-->/g, '');
  const result = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```[\w]*\n?/m, '')   // strip leading ``` fences if AI wrapped code
    .replace(/\n?```$/m, '')        // strip trailing ``` fences
    .trim();
  return result;
};

// ── Protected Zones ───────────────────────────────────────────────────────────

/**
 * Detects whether a fenced code block contains signals that the AI intended
 * multi-file output but failed to use <!--FILE:--> markers.
 *
 * Signals: relative imports to local project modules (./components/X, ./pages/Y)
 * that would produce ReferenceErrors if collapsed into a single /App.tsx.
 */
const detectMultiFileSignals = (code: string): boolean => {
  const re = /\bfrom\s+['"]\.\.?\/([^'"]+)['"]/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const target = m[1];
    // Skip asset/style imports — these don't indicate multi-file code intent
    if (/\.(css|scss|less|json|svg|png|jpg|jpeg|gif|webp|ico)$/.test(target)) continue;
    count++;
  }
  return count >= 1;
};

/**
 * Strip leaked env-variable lines (VITE_*, DATABASE_URL=, etc.) from source code files.
 * Only applied to .ts/.tsx/.js/.jsx — never to .env* or config files.
 */
const stripLeakedEnvVars = (filePath: string, content: string): string => {
  // Only strip from source code files
  if (!/\.(tsx?|jsx?)$/.test(filePath)) return content;
  // Match bare env-var lines that are NOT inside a string literal (quote on the same line)
  // Pattern: start of line → optional whitespace → UPPER_SNAKE=value → end of line
  const envLineRe = /^[ \t]*[A-Z][A-Z0-9_]*=[^\n]*$/gm;
  const cleaned = content.replace(envLineRe, (match, _offset, fullStr) => {
    // Keep lines that are inside a string literal (surrounded by quotes/backticks on the same line)
    const lineStart = fullStr.lastIndexOf('\n', _offset) + 1;
    const before = fullStr.slice(lineStart, _offset);
    if (/['"`]/.test(before)) return match; // inside a template or string
    console.warn(`[parseOperations] stripped leaked env line from ${filePath}: "${match.trim()}"`);
    return '';
  }).replace(/\n{3,}/g, '\n\n'); // collapse triple+ blank lines left behind
  return cleaned;
};

const parseOperations = (raw: string): FileOperation[] => {
  const ops: FileOperation[] = [];

  // Strategy 1: <!--FILE:/path-->...<!--/FILE-->
  const markerRe = /<!--FILE:([^>]+)-->([\s\S]*?)<!--\/FILE-->/g;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(raw)) !== null) {
    const name     = m[1].trim();
    const rawContent = m[2];
    console.log('[parse] raw m[2] first 300:', JSON.stringify(rawContent.slice(0, 300)));
    const trimmed  = rawContent.replace(/^[^]*?((?:\/\*|import\s|export\s|const\s|function\s|type\s|interface\s))/, '$1');
    const content  = sanitizeFileContent(trimmed);
    console.log('[parse] after sanitize first 300:', JSON.stringify(content.slice(0, 300)));
    if (name && content) {
      const normalizedName = name.startsWith('/') ? name : `/${name}`;
      ops.push({ op: 'upsert', name: normalizedName, content: stripLeakedEnvVars(normalizedName, content) });
    }
  }
  if (ops.length > 0) {
    // Safety: detect concatenated files (parser missed a split)
    const safeOps: FileOperation[] = [];
    for (const op of ops) {
      if (op.op === 'upsert' && op.content.includes('<!--FILE:')) {
        console.warn('[parseOperations] concatenated file detected in', op.name);
        const splitPoint = op.content.indexOf('<!--FILE:');
        const head = op.content.slice(0, splitPoint).trim();
        const tail = op.content.slice(splitPoint);
        if (head) safeOps.push({ op: 'upsert', name: op.name, content: head });
        const subOps = parseOperations(tail);
        if (subOps.length > 0) {
          safeOps.push(...subOps);
        }
      } else {
        safeOps.push(op);
      }
    }

    // Safety: detect CSS content leaked into .tsx/.ts/.jsx/.js files
    const extraOps: FileOperation[] = [];
    for (const op of safeOps) {
      if (op.op === 'upsert' && /\.(tsx?|jsx?)$/.test(op.name)) {
        const cssMatch = op.content.match(/\n(@import\s|@tailwind\s|@layer\s)/);
        if (cssMatch) {
          const splitIdx = op.content.indexOf(cssMatch[0]);
          const codeContent = op.content.slice(0, splitIdx).trim();
          const cssContent = op.content.slice(splitIdx).trim();
          op.content = codeContent;
          extraOps.push({ op: 'upsert', name: '/index.css', content: cssContent });
          console.warn('[parseOperations] split CSS from', op.name);
        }
      }
    }
    if (extraOps.length > 0) safeOps.push(...extraOps);

    return safeOps;
  }

  // Strategy 2: single tsx/jsx/typescript block → /App.tsx
  // BLOCKED when the block contains relative imports to local modules —
  // collapsing multi-file output into one App.tsx would produce broken imports.
  const tsx = raw.match(/```(?:tsx?|jsx?|typescript)\s*([\s\S]*?)```/);
  if (tsx && tsx[1].length > 100) {
    const code = tsx[1].trim();
    if (detectMultiFileSignals(code)) {
      console.warn(
        '[parseOperations] BLOCKED: fenced code block contains relative imports to local modules. ' +
        'Refusing single-file collapse — structured parse failure.',
      );
      return [];
    }
    return [{ op: 'upsert', name: '/App.tsx', content: stripLeakedEnvVars('/App.tsx', code) }];
  }

  // Strategy 3: html block → /index.html
  const html = raw.match(/```html\s*([\s\S]*?)```/);
  if (html && html[1].length > 100) return [{ op: 'upsert', name: '/index.html', content: html[1].trim() }];

  return [];
};

// ---- SYSTEM PROMPT ----

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian (Русский)',
  es: 'Spanish (Español)',
  de: 'German (Deutsch)',
  fr: 'French (Français)',
  zh: 'Chinese Simplified (简体中文)',
};

const selectRelevantFiles = (
  intent: string,
  files: Record<string, string>,
  maxTokens = 8000
): Record<string, string> => {
  const excluded = ['PROJECT_MEMORY.md', '_figma_theme.css', '_intent', '_projectId'];
  const entries = Object.entries(files).filter(([n]) => !excluded.includes(n));

  if (entries.length === 0) return {};

  const intentLower = intent.toLowerCase();
  const intentWords = intentLower.split(/\s+/).filter(w => w.length > 3);

  const scored = entries.map(([name, content]) => {
    let score = 0;
    const nameLower = name.toLowerCase();

    // Direct name match — highest priority
    for (const word of intentWords) {
      if (nameLower.includes(word)) score += 10;
    }

    // App.tsx always included — it's the entry point
    if (name === '/App.tsx' || name === 'App.tsx') score += 8;

    // TypeScript/JSX files get a baseline boost
    if (/\.(tsx|ts)$/.test(name)) score += 2;

    // Content match (first 1000 chars)
    const contentLower = content.slice(0, 1000).toLowerCase();
    for (const word of intentWords) {
      if (contentLower.includes(word)) score += 3;
    }

    // Estimate token count (~4 chars per token)
    const tokens = Math.ceil(content.length / 4);

    return { name, content, score, tokens };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Fill token budget
  const result: Record<string, string> = {};
  let usedTokens = 0;

  for (const file of scored) {
    if (usedTokens + file.tokens > maxTokens) {
      // Include truncated version if it's high priority
      if (file.score >= 8) {
        result[file.name] = file.content.slice(0, 2000) + '\n// ... truncated';
        usedTokens += 500;
      }
      continue;
    }
    result[file.name] = file.content;
    usedTokens += file.tokens;
  }

  return result;
};

function buildRequiredFilesBlock(manifest: import('../shared/projectModel').ProductManifest | undefined): string {
  // In single-page safe mode, emit constraint block instead of multi-page requirements
  if (manifest?.singlePageSafeMode) {
    return buildSinglePageConstraintBlock();
  }
  const routes = manifest?.manifestRoutes;
  if (!routes || routes.length < 2) return '';
  const fileLines = routes.map(r => {
    const base = r.title.replace(/[^a-zA-Z0-9]/g, '');
    const fname = (base.endsWith('Page') ? base : base + 'Page') + '.tsx';
    const pad = ' '.repeat(Math.max(1, 34 - fname.length - 6));
    return `  pages/${fname}${pad}← route "${r.path}"${r.isIndex ? ' (home)' : ''}`;
  }).join('\n');
  return `
═══════════════════════════════════════════════════
  REQUIRED OUTPUT FILES — GENERATE ALL OF THESE
═══════════════════════════════════════════════════

This project has ${routes.length} routes. You MUST generate ALL files below in a SINGLE response.
Missing any file will break the preview.

  App.tsx                           ← entry + HashRouter + all routes
  index.css                         ← global styles
  routes.json                       ← route manifest
${fileLines}

  Plus any shared components/, hooks/, or services/ the pages need.
  ALL files must appear as <!--FILE:...--> blocks in this single response.
`;
}

/**
 * Constraint block injected into the system prompt when single-page safe mode
 * is active. Overrides multi-page rules: no routes.json, no pages/, no router shell.
 */
function buildSinglePageConstraintBlock(): string {
  return `
═══════════════════════════════════════════════════
  🛡️ SINGLE-PAGE SAFE MODE — STRICT CONSTRAINTS
═══════════════════════════════════════════════════

This project runs in SINGLE-PAGE SAFE MODE. You MUST follow these rules:

ALLOWED FILES (only these are permitted):
  ✅ App.tsx          — single entry point, export default App
  ✅ index.css        — global styles
  ✅ components/*.tsx  — simple presentational components (optional)

FORBIDDEN (will be rejected by the guard — do NOT generate):
  ❌ routes.json                — no route manifest
  ❌ pages/ directory           — no page files
  ❌ <Routes>, <Route>          — no multi-page routing (single use of HashRouter with one route is OK only if necessary)
  ❌ router shell / layout wrapper that switches between pages
  ❌ Multiple <Route> elements  — this is a SINGLE page app
  ❌ useNavigate() for page transitions

STRUCTURE RULES:
  - App.tsx contains ALL application logic OR imports from components/
  - Every import must resolve to a file you generate in this response
  - Do NOT import files you are not generating
  - Do NOT use @/ alias imports — sandbox has no src/ directory, @/ will not resolve
  - Use relative paths only: import { Foo } from './components/Foo'
  - Keep it simple: one page, one view, working UI
  - All state lives in App.tsx or its direct component children
  - Use inline styles or index.css — no CSS modules, no Tailwind config

CAPABILITY PACKAGES NOT AVAILABLE IN SINGLE-PAGE SAFE MODE:
  Single-page safe mode has no capability declarations — CapabilityBootstrap does not
  generate _runtime/ adapters. Do NOT import these packages here:
  ❌ chart.js, react-chartjs-2  — draw charts with SVG <rect>/<path> or CSS width bars
  ❌ leaflet                    — show a static map image or a placeholder div
  ❌ jspdf                      — render print-ready HTML instead of generating a PDF
  ❌ tesseract.js               — show a file upload UI without OCR processing
  ❌ i18next, react-i18next     — use a simple string map for text localisation
  ❌ openai                     — use @google/generative-ai (always available) instead

OUTPUT: generate a complete, self-contained single-page app that displays a working UI.
`;
}

export const buildSystemPrompt = (
  files: Record<string, string>,
  language?: string,
  manifest?: import('../shared/projectModel').ProductManifest,
  scopeConstraint?: string,
): string => {
  const fileCtx = Object.entries(files)
    .map(([n, c]) => `### ${n}\n\`\`\`\n${c.slice(0, 2500)}\n\`\`\``)
    .join('\n\n');

  return `You are AIC-RG Studio — an elite product builder.
Stack: React + TypeScript + Tailwind CSS + Vite ESM. No other stacks.
Never use Vue, Svelte, Angular, or vanilla JS.
Never use CSS modules, styled-components, plain CSS classes, or inline style objects when Tailwind classes can replace them.
Always use Tailwind utility classes for layout, spacing, color, typography, and responsive design.
When Supabase is needed (auth/db/storage), use the @supabase/supabase-js SDK via ./lib/supabase.ts.

## RUNTIME: esbuild + Vite ESM (NOT Babel, NOT UMD globals)
Your code runs via esbuild-wasm in a Vite-powered iframe.
Every file is a proper ESM module. You MUST use import statements.

═══════════════════════════════════════════════════
  ⚠️  ESM CONTRACT — VIOLATION = WHITE SCREEN
═══════════════════════════════════════════════════

RULE 1 — ALWAYS import React and hooks explicitly:
  ✅ import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
  ❌ const { useState } = React  ← only works with UMD globals, NOT here
  ❌ React.useState(...)         ← avoid, prefer destructured hooks

RULE 2 — export default App is REQUIRED:
  ✅ export default function App() { ... }
  ❌ function App() { ... }  ← no export = blank screen

RULE 3 — Import everything you use:
  ✅ import { HashRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
  ✅ import { motion } from 'framer-motion'
  ❌ <Link to="/">  ← without import = ReferenceError

RULE 4 — SANDBOX IMPORT CONTRACT — relative paths only:
  The preview sandbox materializes ALL files at the revision root (no src/ directory).
  All local imports MUST use relative paths from the importing file's location:
  ✅ import { Button } from './components/Button'
  ✅ import { theme } from './constants/theme'
  ✅ import { HomePage } from './pages/HomePage'
  ✅ import './index.css'
  ❌ import { Button } from '@/components/Button'   ← @/ does NOT resolve in sandbox
  ❌ import { Button } from '../../components/Button' ← unnecessary depth
  @/ is NOT supported in the preview sandbox. Never use @/ in generated preview files.

RULE 5 — JSX: close all tags (<img />) | one root element per return | camelCase attrs (onClick, className, htmlFor)

═══════════════════════════════════════════════════
  AVAILABLE LIBRARIES
═══════════════════════════════════════════════════

Always import — never use UMD globals:
  react, react-router-dom, framer-motion, lucide-react, zustand — always available
  Icons: import { Home, User, Settings, Bell, Plus, X, Check, Search, Star, Heart,
    ChevronRight, ArrowRight, Edit, Trash, Eye, Lock, Mail, Calendar, Download,
    Zap, Shield, Globe, TrendingUp, DollarSign, Users, Menu, Send, LogOut } from 'lucide-react'
  Usage: <Home size={20} className="text-white" />

⛔ SANDBOX IMPORT RULES — VIOLATIONS WILL BREAK THE PREVIEW:
  DO NOT import any package not listed above.
  NEVER import: openai, @anthropic-ai/sdk, @google/generative-ai, axios,
    chart.js, react-chartjs-2, @stripe/stripe-js, leaflet, tesseract.js,
    jspdf, i18next, @supabase/supabase-js, or any AI/payment/chart SDK.
  If the user asks for AI features → simulate with mock data and setTimeout.
  If the user asks for charts → render plain SVG or CSS bar charts.
  If the user asks for maps → render a static placeholder div.
  Only use: react, react-dom, react-router-dom, lucide-react, framer-motion, zustand.

═══════════════════════════════════════════════════
  COMPONENT LIBRARY — shadcn/ui (pre-installed)
═══════════════════════════════════════════════════

The project includes shadcn/ui components in ./components/ui/.
ALWAYS use these instead of creating custom UI primitives.

Available (import using ./ relative paths — NEVER @/):
  import { Button } from './components/ui/button'
  import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from './components/ui/card'
  import { Input } from './components/ui/input'
  import { Label } from './components/ui/label'
  import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog'
  import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './components/ui/select'
  import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs'
  import { Badge } from './components/ui/badge'
  import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './components/ui/table'
  import { Textarea } from './components/ui/textarea'
  import { Skeleton } from './components/ui/skeleton'
  import { Separator } from './components/ui/separator'
  import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './components/ui/dropdown-menu'
  import { cn } from './lib/utils'

NEVER create custom button, input, card, dialog, select, or table components.
Use the ones above. Style variants via className + Tailwind utilities.
  ✅ <Button variant="outline" size="sm">Click</Button>
  ✅ <Card className="p-4">...</Card>
  ❌ const MyButton = () => <button className="...">  ← never recreate primitives

From pages/ and components/ subdirectories, adjust relative paths:
  import { Button } from '../components/ui/button'  (from pages/)
  import { Button } from '../ui/button'              (from components/blocks/)

═══════════════════════════════════════════════════
  HIGH-LEVEL BLOCK COMPONENTS (pre-installed)
═══════════════════════════════════════════════════

Composite components in ./components/blocks/ — PREFER these over building from scratch.
Each accepts typed props with sensible defaults and is built on shadcn/ui primitives.

  import HeroSection from './components/blocks/HeroSection'
    <HeroSection title="..." subtitle="..." ctaText="Get Started" />
  import FeatureGrid from './components/blocks/FeatureGrid'
    <FeatureGrid features={[{ icon: Zap, title: '...', description: '...' }]} />
  import PricingTable from './components/blocks/PricingTable'
    <PricingTable plans={[{ name: 'Pro', price: '$9', features: ['...'], highlighted: true }]} />
  import StatsRow from './components/blocks/StatsRow'
    <StatsRow stats={[{ icon: Users, label: 'Users', value: '1,234', trend: 'up', trendValue: '+12%' }]} />
  import TestimonialCarousel from './components/blocks/TestimonialCarousel'
    <TestimonialCarousel testimonials={[{ quote: '...', name: '...', role: '...' }]} />
  import AuthForm from './components/blocks/AuthForm'
    <AuthForm mode="login" onSubmit={(email, pw) => {}} />
  import DataTable from './components/blocks/DataTable'
    <DataTable data={rows} columns={[{ key: 'name', label: 'Name', sortable: true }]} />
  import SidebarNav from './components/blocks/SidebarNav'
    <SidebarNav groups={[{ title: 'Main', items: [{ icon: Home, label: 'Home', active: true }] }]} />
  import OnboardingWizard from './components/blocks/OnboardingWizard'
    <OnboardingWizard steps={[{ title: 'Step 1', content: <div>...</div> }]} />
  import FileUpload from './components/blocks/FileUpload'
    <FileUpload accept="image/*" multiple onFiles={(files) => {}} />
  import EmptyState from './components/blocks/EmptyState'
    <EmptyState title="No items yet" actionText="Add Item" onAction={() => {}} />
  import LoadingScreen from './components/blocks/LoadingScreen'
    <LoadingScreen variant="skeleton" />
  import ErrorBoundary from './components/blocks/ErrorBoundary'
    <ErrorBoundary><App /></ErrorBoundary>
  import PageHeader from './components/blocks/PageHeader'
    <PageHeader title="Dashboard" description="Overview" actions={<Button>New</Button>} />
  import SearchCommand from './components/blocks/SearchCommand'
    <SearchCommand items={[{ id: '1', label: 'Home', onSelect: () => nav('/') }]} open={open} onOpenChange={setOpen} />

From pages/ directory, use: import HeroSection from '../components/blocks/HeroSection'

═══════════════════════════════════════════════════
  DESIGN TOKENS — CSS VARIABLES
═══════════════════════════════════════════════════

A design token file exists at ./lib/design-tokens.css.
Your index.css MUST import it after Tailwind:
  <!--FILE:/index.css-->
  @import "tailwindcss";
  @import './lib/design-tokens.css';
  @source "./**/*.{ts,tsx}";
  <!--/FILE-->

Use semantic color classes from the design system (NOT hardcoded colors):
  ✅ bg-background, text-foreground, bg-card, text-card-foreground
  ✅ bg-primary, text-primary-foreground, bg-secondary, text-secondary-foreground
  ✅ bg-muted, text-muted-foreground, bg-accent, text-accent-foreground
  ✅ bg-destructive, text-destructive-foreground, border-border, border-input
  ❌ bg-gray-800, text-blue-500, bg-slate-900 ← avoid hardcoded colors

═══════════════════════════════════════════════════
  ASSET / SOURCE POLICY
═══════════════════════════════════════════════════

Components:
  - Prefer existing shadcn/ui primitives and local block components
  - Do NOT import other component libraries
  - Custom components should compose approved primitives instead of replacing them

Icons:
  - Prefer lucide-react for all generic UI actions
  - Use one icon family consistently across the product
  - Reserve bespoke inline SVG only for logos or special illustrations

Media:
  - Default to self-contained gradients, inline SVG, shaped placeholders, or mock product visuals
  - Remote images are allowed ONLY when realism is core to the product (for example travel, real estate, food, portfolio)
    and the layout still works cleanly without them
  - If you use remote media, provide a graceful self-contained fallback presentation

Fonts:
  - Prefer existing local or system-safe font stacks
  - Remote fonts are allowed only when typography is central to the concept and the UI still works with fallbacks
  - Never make layout integrity depend on a remote font loading successfully

Advanced design resources:
  - Allowed: CSS gradients, inline SVG patterns, data-URI textures, Framer Motion
  - Avoid mixing multiple dramatic effects in one viewport
  - Keep atmospheric layers secondary to readability and interaction clarity

═══════════════════════════════════════════════════
  QUALITY STANDARDS (match professional app quality)
═══════════════════════════════════════════════════

STRUCTURE — generate MULTIPLE files:
  - App.tsx: ONLY router + providers (max 40 lines)
  - components/layout/AppLayout.tsx: shared layout with navigation
  - pages/: one file per page/route
  - components/: reusable UI logic (NOT shadcn primitives — those are pre-installed)
  - hooks/: custom hooks for shared state
  - data/: static content and mock data (NOT inline in components)
  Minimum 5 files for simple apps. 10+ for complex ones.

DESIGN — use the design system:
  - Import from ./components/ui/ for ALL UI primitives
  - Use CSS variable colors: bg-primary, text-muted-foreground, border-border
  - Do NOT hardcode colors (no bg-gray-800, no text-blue-500)
  - Rounded corners: rounded-xl for cards, rounded-lg for buttons
  - Spacing: p-6 for sections, gap-4 for lists

LAYOUT — every app needs:
  - A shared layout component with navigation
  - Mobile-first: min-h-screen, flex flex-col
  - For multi-page: bottom tab bar or top nav with icons from lucide-react
  - For single-page: centered max-w-md or max-w-2xl with header

COMPLETENESS:
  - Every button has a working handler
  - Every form has validation
  - Every list has an empty state (use EmptyState block)
  - Every async operation has loading + error states
  - Use localStorage for persistence

OG META TAGS — add to App.tsx (at top-level, NOT inside a page component):
  useEffect(() => {
    // Set app title from BUILD PLAN — replace with actual app name
    document.title = '<AppName from BUILD PLAN>';

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(\`meta[property="\${property}"]\`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('og:title',       '<AppName from BUILD PLAN>');
    setMeta('og:description', '<one-sentence description from BUILD PLAN>');
    setMeta('og:type',        'website');
  }, []);
  Replace <AppName from BUILD PLAN> with the actual app name derived from the user's request.
  Replace <one-sentence description from BUILD PLAN> with a concise description of what the app does.

═══════════════════════════════════════════════════
  TAILWIND CSS RULES
═══════════════════════════════════════════════════

Use Tailwind utility classes for ALL styling. No inline style objects except for
dynamic values that Tailwind cannot express (e.g. exact pixel offsets from JS state).

  ✅ className="flex items-center gap-4 bg-gray-900 text-white p-4 rounded-xl"
  ✅ className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  ✅ className="text-sm md:text-base font-semibold text-blue-400 hover:text-blue-300 transition"
  ❌ style={{ display: 'flex', alignItems: 'center', gap: 16 }}  ← use flex items-center gap-4

Animations — use framer-motion or Tailwind transition/animate utilities:
  ✅ <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} />
  ✅ className="transition-all duration-300 hover:scale-105"

═══════════════════════════════════════════════════
  MULTI-PAGE ROUTING
═══════════════════════════════════════════════════

Routing layers (keep in sync):
  1. App.tsx HashRouter — RUNTIME authority. <Routes>/<Route> drive navigation.
  2. pages/ files       — each page file corresponds to exactly one route.
  3. routes.json        — SIDECAR metadata. Does NOT drive bootstrap.

App.tsx = entry + HashRouter only. Every component/page/hook lives in its own file.
ALWAYS HashRouter — NEVER BrowserRouter (preview sandbox uses hash-based routing for iframe compatibility).
Pages → pages/ directory. Navigation → Link or useNavigate, never <a href>.

routes.json is REQUIRED alongside pages/ (sidecar metadata — not used to control routing):
<!--FILE:/routes.json-->
{ "version": 1, "routes": [
  { "path": "/",      "filePath": "pages/HomePage.tsx",  "title": "Home",     "isHome": true  },
  { "path": "/about", "filePath": "pages/AboutPage.tsx", "title": "About",    "isHome": false }
]}
<!--/FILE-->
${buildRequiredFilesBlock(manifest)}
═══════════════════════════════════════════════════
  SUPABASE / BACKEND
═══════════════════════════════════════════════════

When the project needs auth/db/storage/realtime, use Supabase (@supabase/supabase-js is always available):
  lib/supabase.ts → export supabase singleton (createClient from @supabase/supabase-js)
  lib/auth.ts     → signIn, signUp, signOut, getSession, useAuth, AuthProvider
  lib/db.ts       → fetchAll, fetchById, insertRow, updateRow, deleteRow

  ✅ import { supabase } from './lib/supabase'         ← always use the shared singleton
  ✅ import { useAuth } from './lib/auth'
  ✅ supabase.from('table').select() / .insert() / .update() / .delete()
  ✅ supabase.auth.signInWithPassword / .signUp / .signOut
  ❌ import { createClient } from '@supabase/supabase-js' in components
  ❌ hardcode URLs — always read from import.meta.env.VITE_SUPABASE_URL

Always generate .env.example:
  <!--FILE:/.env.example-->
  VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  <!--/FILE-->

Every Route → matching page file. Every import → generated file (or define inline).
Never use @/ paths — always ./ relative from the importing file.

## CURRENT PROJECT
${fileCtx || '(new project — build from scratch)'}
${manifest?.artistLayer ? `
## ARTIST LAYER — CURRENT SOURCE OF TRUTH
${buildArtistLayerPrompt(manifest.artistLayer)}
` : ''}
${scopeConstraint ? `
## SCOPE CONSTRAINT ⚠️ — STRICTLY ENFORCE
${scopeConstraint}
DO NOT regenerate or modify files that are not listed in the scope above.
If a file is not a target, output it ONLY if it requires a wiring change.
` : ''}
## BUILD SYSTEM FILES — DO NOT GENERATE
NEVER output these files — they are owned by the build system and will break the sandbox if present:
- vite.config.ts / vite.config.js
- tsconfig.json / tsconfig.*.json
- postcss.config.js / postcss.config.ts
- tailwind.config.js / tailwind.config.ts
- package.json / package-lock.json
Only generate application source code: App.tsx, pages/, components/, services/, hooks/, etc.

## SHADCN/UI COMPONENTS — DO NOT GENERATE
NEVER generate files under @/components/ui/ or src/components/ui/.
These are pre-installed shadcn/ui primitives. They already exist in the sandbox.
Just import from them: import { Button } from "@/components/ui/button"
Do NOT output <!--FILE:/src/components/ui/button.tsx--> or similar.
Only generate YOUR application code: App.tsx, pages/, components/ (but NOT components/ui/), hooks/, data/, contexts/.

## OUTPUT FORMAT — MANDATORY MULTI-FILE

You MUST output MULTIPLE separate files. MINIMUM 3 files.
Each file MUST have its own <!--FILE:/path--> and <!--/FILE--> markers.

REQUIRED files for EVERY app:
<!--FILE:/App.tsx-->
(router + layout only, max 40 lines, imports from pages/)
<!--/FILE-->

<!--FILE:/index.css-->
(Tailwind imports + any custom styles)
<!--/FILE-->

<!--FILE:/pages/MainPage.tsx--> (or HomePage.tsx etc.)
(actual page content with UI logic)
<!--/FILE-->

CRITICAL RULES:
- FIRST CHARACTER of your response must be \`<\` (the start of \`<!--FILE:\`)
- NO text, NO explanation, NO markdown, NO prose before \`<!--FILE:\`
- NO \`\`\`code blocks\`\`\` — use FILE markers ONLY
- NEVER put CSS (@import, @tailwind, body{}) inside a .tsx file
- NEVER put more than one component definition in App.tsx
- App.tsx is ONLY: imports + router + export default
- Each page is a SEPARATE <!--FILE:--> block
- Each component is a SEPARATE <!--FILE:--> block
- index.css is a SEPARATE <!--FILE:--> block
- Each file: complete, no placeholders, no "// ... rest unchanged"
- TypeScript — use proper types
- All buttons must DO something (never empty onClick)
- Data persistence: localStorage
- Dark theme by default unless specified

WRONG (everything in one file):
<!--FILE:/App.tsx-->
import React...
function App() {...}
@tailwind base;
<!--/FILE-->

CORRECT (separate files):
<!--FILE:/App.tsx-->
import './index.css'
import MainPage from './pages/MainPage'
export default function App() { return <MainPage /> }
<!--/FILE-->
<!--FILE:/index.css-->
@tailwind base;
@tailwind components;
@tailwind utilities;
<!--/FILE-->
<!--FILE:/pages/MainPage.tsx-->
export default function MainPage() { return <div>...</div> }
<!--/FILE-->
`;
};

// ---- Project Memory auto-update ----

const updateProjectMemory = (
  files:        Record<string, string>,
  intent:       string,
  newFileNames: string[]
): Record<string, string> => {
  const existing = files['PROJECT_MEMORY.md'] ?? '';
  if (!existing) return files;

  const timestamp    = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const filesMentioned = newFileNames
    .filter(n => !['PROJECT_MEMORY.md', '_figma_theme.css', '_intent'].includes(n))
    .join(', ');

  if (!filesMentioned) return files;

  const entry   = `- [${timestamp}] ${intent.slice(0, 60)} → ${filesMentioned}`;
  const section = '## Recent Changes';
  let updated: string;

  if (existing.includes(section)) {
    updated = existing.replace(section + '\n', section + '\n' + entry + '\n');
  } else {
    updated = existing + '\n\n' + section + '\n' + entry + '\n';
  }

  // Keep only last 20 entries to prevent bloat
  const lines      = updated.split('\n');
  const sectionIdx = lines.findIndex(l => l === section);
  if (sectionIdx !== -1) {
    const before  = lines.slice(0, sectionIdx + 1);
    const entries = lines.slice(sectionIdx + 1).filter(l => l.startsWith('- ['));
    const rest    = lines.slice(sectionIdx + 1).filter(l => !l.startsWith('- ['));
    updated = [...before, ...entries.slice(0, 20), ...rest].join('\n');
  }

  return { ...files, 'PROJECT_MEMORY.md': updated };
};

const persistMemoryToSupabase = async (
  content:   string,
  projectId: string | null,
  onLog:     (msg: string) => void = () => {}
): Promise<void> => {
  try {
    const { supabase } = await import('../lib/supabase');
    await supabase
      .from('project_memory')
      .upsert({
        project_id: projectId ?? 'global',
        content,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' });
  } catch (err) {
    onLog('[MEMORY] Supabase persist failed: ' + String(err));
  }
};

// ---- Anti-Loop state (delegated to Dispatcher) ----

export class Orchestrator {

  private static _sessionId: string = crypto.randomUUID();
  private static _sessionRequestCount: number = 0;

  /** Returns the chat-completions endpoint URL for each provider. */
  static getEndpoint(provider: ApiProvider | string): string {
    switch (provider) {
      case 'anthropic':     return 'https://api.anthropic.com/v1/messages';
      case 'openai':        return 'https://api.openai.com/v1/chat/completions';
      case 'google':        return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      case 'deepseek':      return 'https://api.deepseek.com/v1/chat/completions';
      case 'claude-bridge': return `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/chat`;
      default:              return 'https://openrouter.ai/api/v1/chat/completions';
    }
  }

  // ---- Heuristic checker ----

  static heuristicCheck(code: string): string[] {
    const issues: string[] = [];
    // Unself-closed void elements
    if (/<(?:input|img|br|hr|meta|link)\b[^>]*[^/]>/m.test(code)) {
      issues.push('void element not self-closed (add />)');
    }
    // HTML class= attribute
    if (/\sclass=["']/.test(code)) {
      issues.push('HTML class= found (use className=)');
    }
    return issues;
  }

  // ---- Self-correction ----

  static async selfCorrect(
    code:   string,
    issues: string[],
    apiKey: string,
    model:  string
  ): Promise<string | null> {
    const _t0 = Date.now();
    try {
      const prompt = `Fix the following JSX/React code issues and return ONLY the corrected code.

Issues found:
${issues.map(i => `- ${i}`).join('\n')}

Fixing rules:
1. Self-close void elements: <input />, <img />, <br />
2. Use className instead of class
3. NEVER remove, alter, or comment out any import or export statement — preserve ALL ESM imports/exports exactly as written
4. NEVER flatten multiple files into a single component, and NEVER rewrite modular ESM code into inline or iframe-style code
5. Keep every file as a proper ESM module with its own import/export declarations

Code to fix:
\`\`\`
${code.slice(0, 8000)}
\`\`\`

Return ONLY the fixed code inside a \`\`\`jsx block, no explanation.`;

      console.log('[SelfCorrect] model=', model, 'status will be logged on error');
      const resp = await withOrchestratorTimeout(
        llmFetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type':  'application/json',
            'HTTP-Referer':  window.location.origin,
            'X-Title':       'AIC-RG Studio Self-Correction',
          },
          JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a JSX syntax fixer. Fix ONLY the reported issues (void elements, className). NEVER remove or alter import/export statements. NEVER flatten modules. Return ONLY the fixed code in a ```jsx block. No explanation.' },
              { role: 'user',   content: prompt },
            ],
            temperature: 0.1,
            max_tokens:  10000,
          }),
        ),
        `selfCorrect model=${model}`,
      );

      if (!resp.ok) {
        console.error(`[SelfCorrect] API error: status=${resp.status} statusText=${resp.statusText} model=${model}`);
        return null;
      }
      const data  = await resp.json();
      const raw   = data.choices?.[0]?.message?.content ?? '';
      const match = raw.match(/```(?:jsx?|tsx?)\s*([\s\S]*?)```/);
      const result = match ? match[1].trim() : null;
      metricsService.record({ phase: 'selfcorrect', model, durationMs: Date.now() - _t0, extra: { issueCount: issues.length, fixed: !!result } });
      return result;
    } catch (err) {
      metricsService.recordError('selfcorrect', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  // ---- canAutoFix ----

  /** @deprecated Use Dispatcher.canAttempt / recordAttempt directly */
  static canAutoFix(sessionId: string): boolean {
    const ok = Dispatcher.canAttempt(sessionId);
    if (ok) Dispatcher.recordAttempt(sessionId);
    return ok;
  }

  static resetSession() {
    Orchestrator._sessionId = crypto.randomUUID();
    Orchestrator._sessionRequestCount = 0;
  }

  static getSessionInfo(): { id: string; requests: number } {
    return {
      id:       Orchestrator._sessionId,
      requests: Orchestrator._sessionRequestCount,
    };
  }

  // ---- Self-Correction via iframe postMessage ----

  static async handleIframeError(
    errorMsg:  string,
    files:     Record<string, string>,
    apiKey:    string,
    modelId:   string,
    onFiles:   (ops: FileOperation[]) => void,
    onLog:     (msg: string) => void = () => {}
  ): Promise<boolean> {
    onLog(`[ERROR] Preview error: ${errorMsg.slice(0, 120)}`);

    const appKey = Object.keys(files).find(k =>
      k === '/App.tsx' || k === 'App.tsx' || k === '/App.jsx' || k === 'App.jsx'
    ) ?? Object.keys(files)[0];

    if (!appKey || !files[appKey]) return false;

    let code   = files[appKey];
    const issues = this.heuristicCheck(code);

    // ── Step 1: Local regex fix (zero API cost) ────────────────────────────
    const localFixed = Dispatcher.localFix(code);
    if (localFixed !== null) {
      const remaining = this.heuristicCheck(localFixed);
      if (remaining.length === 0) {
        onFiles([{ op: 'upsert', name: appKey, content: localFixed }]);
        onLog(`[OK] ${appKey}: iframe error fixed locally (0 API cost)`);
        return true;
      }
      code = localFixed;
      onLog(`[LOCAL] ${appKey}: partial local fix applied`);
    }

    // ── Step 2: Budget guard ───────────────────────────────────────────────
    const budget = Dispatcher.checkBudget();
    if (!budget.allowed) {
      onLog(`[BUDGET] ${budget.warning}`);
      return false;
    }
    if (budget.warning) onLog(`[BUDGET] ${budget.warning}`);

    // ── Step 3: Lightweight model (always for iframe runtime errors) ───────
    const lightModel = Dispatcher.selectModel('debug', modelId).model;
    const allIssues  = [...issues, `Runtime error: ${errorMsg.slice(0, 300)}`];

    onLog(`[FIX] Auto-correcting ${appKey} via lightweight model (${lightModel})...`);
    const fixed = await this.selfCorrect(code, allIssues, apiKey, lightModel);
    if (fixed) {
      onFiles([{ op: 'upsert', name: appKey, content: fixed }]);
      onLog(`[OK] ${appKey}: auto-corrected (lightweight model)`);
      return true;
    }
    onLog(`[FAIL] ${appKey}: lightweight fix failed`);
    return false;
  }

  // ---- Planning agent ----

  static async planTask(
    intent:  string,
    files:   Record<string, string>,
    apiKey:  string,
    modelId: string
  ): Promise<{ steps: string[]; batches: string[][] }> {

    const fileList = Object.keys(files)
      .filter(n => n !== 'PROJECT_MEMORY.md' && n !== '_figma_theme.css')
      .join('\n');

    const prompt = `You are a planning agent. Analyze this task and return ONLY a JSON object.

Task: ${intent}

Existing files:
${fileList || '(new project)'}

Return ONLY this JSON structure, no explanation, no markdown:
{
  "steps": [
    "step 1 description",
    "step 2 description"
  ],
  "batches": [
    ["file1.tsx", "file2.ts"],
    ["file3.tsx"]
  ]
}

Rules:
- steps: 2-5 concrete actions to complete the task
- batches: group files that can be created in parallel
- files with no dependencies go in batch 1
- files that depend on batch 1 go in batch 2
- keep it minimal and practical`;

    try {
      const resp = await withOrchestratorTimeout(
        llmFetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type':  'application/json',
            'HTTP-Referer':  window.location.origin,
            'X-Title':       'AIC-RG Studio Planner',
          },
          JSON.stringify({
            model:       modelId,
            messages:    [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens:  1000,
          }),
        ),
        `planTask model=${modelId}`,
      );

      if (!resp.ok) return { steps: [intent], batches: [[]] };

      const data   = await resp.json();
      const raw    = data.choices?.[0]?.message?.content ?? '';
      const clean  = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      return {
        steps:   Array.isArray(parsed.steps)   ? parsed.steps   : [intent],
        batches: Array.isArray(parsed.batches) ? parsed.batches : [[]],
      };
    } catch {
      return { steps: [intent], batches: [[]] };
    }
  }

  // ---- Main chat ----

  static async chat(
    history:         LLMMessage[],
    files:           Record<string, string>,
    apiKey:          string,
    modelId:         string,
    onStream:        (text: string) => void,
    onFiles:         (ops: FileOperation[]) => void,
    onPhase:         (e: PhaseEvent) => void = () => {},
    onLog:           (msg: string) => void   = () => {},
    signal?:         AbortSignal,
    onUsage?:        (data: UsageData) => void,
    language?:       string,
    manifest?:       import('../shared/projectModel').ProductManifest,
    relevantFiles?:  string[],
    scopeConstraint?: string,
    /** Override the OpenAI-compatible endpoint. Must support streaming SSE. Ignored for anthropic provider (not OAI-compatible). */
    endpoint?:       string,
  ): Promise<OrchestratorResult> {

    onLog('[START] Generation started...');
    onPhase({ phase: 'think', progress: 10, detail: 'Analyzing task...' });

    // Filter files to relevant set when hydration provided a selection
    const contextFiles = (relevantFiles && relevantFiles.length > 0)
      ? Object.fromEntries(
          Object.entries(files).filter(([k]) =>
            k.startsWith('_') || relevantFiles.includes(k)
          )
        )
      : files;

    if (relevantFiles && relevantFiles.length > 0) {
      const excluded = Object.keys(files).filter(k => !k.startsWith('_') && !relevantFiles.includes(k));
      onLog(`[HydrationService] context narrowed: ${relevantFiles.length} files (excluded ${excluded.length})`);
    }

    const messages: any[] = [
      { role: 'system', content: buildSystemPrompt(
        { ...contextFiles, '_intent': history[history.length - 1]?.content?.toString() ?? '' },
        language,
        manifest,
        scopeConstraint,
      ) },
      ...history,
    ];

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      onLog('[ERROR] API key empty');
      onPhase({ phase: 'idle', progress: 0 });
      return {
        message:    'API key is empty — save your OpenRouter key in Settings.',
        operations: [],
        graph:      fileMapToProjectGraph(files, '', ''),
      };
    }

    const chatEndpoint = endpoint ?? 'https://openrouter.ai/api/v1/chat/completions';
    // Normalize model string for the target endpoint:
    // - OpenRouter expects "provider/model" format (e.g. "anthropic/claude-3-5-sonnet-20241022")
    // - Native provider APIs expect bare model IDs (e.g. "claude-3-5-sonnet-20241022")
    const isOpenRouter = chatEndpoint.includes('openrouter.ai');
    let effectiveModelId = modelId;
    if (!isOpenRouter && modelId.includes('/')) {
      // Strip provider prefix for native APIs: "anthropic/claude-3-5-sonnet" → "claude-3-5-sonnet"
      effectiveModelId = modelId.split('/').slice(1).join('/');
    } else if (isOpenRouter && !modelId.includes('/')) {
      // Add provider prefix heuristic for OpenRouter bare model IDs
      if      (modelId.startsWith('claude-'))   effectiveModelId = `anthropic/${modelId}`;
      else if (modelId.startsWith('gpt-'))      effectiveModelId = `openai/${modelId}`;
      else if (modelId.startsWith('gemini-'))   effectiveModelId = `google/${modelId}`;
      else if (modelId.startsWith('mistral-'))  effectiveModelId = `mistralai/${modelId}`;
    }
    onLog(`[API] Model: ${effectiveModelId} | Endpoint: ${chatEndpoint.replace(/^https?:\/\/([^/]+).*/, '$1')} | Key: ...${trimmedKey.slice(-6)}`);

    let resp: Response;
    try {
      resp = await withOrchestratorTimeout(
        llmFetchStream(
          chatEndpoint,
          {
            'Authorization': `Bearer ${trimmedKey}`,
            'Content-Type':  'application/json',
            'HTTP-Referer':  window.location.origin,
            'X-Title':       'AIC-RG Studio',
          },
          JSON.stringify({
            model:       effectiveModelId,
            messages,
            stream:      true,
            temperature: 0.4,
            max_tokens:  12000,
          }),
          signal,
        ),
        `chat stream model=${modelId}`,
      );
    } catch (networkErr: any) {
      // User-initiated abort — propagate cleanly, no noise in console
      if (networkErr?.name === 'AbortError') throw networkErr;

      const msg: string = networkErr?.message ?? 'Network request failed';
      console.error('╔══ FETCH FAILED ══════════════════════════════╗');
      console.error('║ Error:    ', msg);
      console.error('║ URL:       https://openrouter.ai/api/v1/chat/completions');
      console.error('║ Origin:   ', window.location.origin);
      console.error('║ Model:    ', modelId);
      console.error('║ Key tail: ', trimmedKey ? `...${trimmedKey.slice(-6)}` : 'EMPTY');
      console.error('╠══ LIKELY CAUSES ═════════════════════════════╣');
      console.error('║ 1. Ad-blocker / browser extension blocking openrouter.ai');
      console.error('║ 2. No internet connection');
      console.error('║ 3. DNS cannot resolve openrouter.ai');
      console.error('╚══════════════════════════════════════════════╝');
      onLog(`[NETWORK ERROR] ${msg} — check browser console for details`);
      const endpointLabel = chatEndpoint.replace(/^https?:\/\/([^/]+).*/, '$1');
      throw new Error(
        `Failed to reach ${endpointLabel}: "${msg}". ` +
        'Check: (1) disable ad-blocker for this page, (2) internet connection, (3) try reloading.'
      );
    }

    if (!resp.ok) {
      let errBody = '';
      try { errBody = await resp.text(); } catch { errBody = '(could not read body)'; }
      console.error('API Error Details:', { status: resp.status, body: errBody, model: effectiveModelId });
      onLog(`[API ERROR] ${resp.status}: ${errBody.slice(0, 200)}`);
      const endpointLabel = chatEndpoint.replace(/^https?:\/\/([^/]+).*/, '$1');
      const hint = resp.status === 401
        ? ' — API key is invalid or expired. Check Settings → Engine → Agents.'
        : resp.status === 402
        ? ' — insufficient credits or quota exceeded.'
        : resp.status === 429
        ? ' — rate limit hit, wait a moment.'
        : resp.status === 404
        ? ` — model "${effectiveModelId}" not found on ${endpointLabel}. Check model ID in Settings.`
        : '';
      throw new Error(`${endpointLabel} ${resp.status}${hint}: ${errBody.slice(0, 300)}`);
    }

    const reader  = resp.body!.getReader();
    const decoder = new TextDecoder();
    let full      = '';
    let buffer    = '';
    let applied   = false;
    let phase: AgentPhase = 'think';

    onLog('[STREAM] Streaming response...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the incomplete line in the buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);

          // ---- Usage data (OpenRouter sends in final chunks) ----
          if (parsed.usage) {
            onUsage?.({
              promptTokens:     parsed.usage.prompt_tokens     ?? 0,
              completionTokens: parsed.usage.completion_tokens ?? 0,
            });
          }

          const delta = parsed.choices?.[0]?.delta?.content;
          if (!delta) continue;
          full += delta;

          // ---- Phase: think → plan ----
          if (phase === 'think' && (
            full.includes('</think>') ||
            full.includes('## 📋') ||
            full.includes('## Plan')
          )) {
            phase = 'plan';
            onPhase({ phase: 'plan', progress: 30, detail: 'Creating plan...' });
            onLog('[PLAN] Phase: Planning');
          }

          // ---- Phase: plan → code ----
          if (phase === 'plan' && full.includes('<!--FILE:')) {
            phase = 'code';
            onPhase({ phase: 'code', progress: 55, detail: 'Generating code...' });
            onLog('[CODE] Phase: Code Generation');
          }

          // ---- Optimistic file apply ----
          const _openCount  = (full.match(/<!--FILE:/g)    || []).length;
          const _closeCount = (full.match(/<!--\/FILE-->/g) || []).length;
          if (!applied && _closeCount > 0 && _openCount === _closeCount) {
            const ops = parseOperations(full);
            if (ops.length > 0) {
              applied = true;
              onFiles(ops);
              onLog(`[FILES] Optimistically applied ${ops.length} files`);
              if (phase === 'code' || phase === 'plan') {
                phase = 'verify';
                onPhase({ phase: 'verify', progress: 85, detail: 'Verifying...' });
                onLog('[VERIFY] Phase: Verification');
              }
            }
          }

          // ---- Emit display: strip think/file/code blocks ----
          const display = full
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/<!--FILE:[^>]+-->[\s\S]*?<!--\/FILE-->/g, '')
            .replace(/<!--FILE:[\s\S]*$/, '')          // incomplete file block → cut to end
            .replace(/```[\w\-]*\n[\s\S]*?```/g, '')  // complete fenced code blocks
            .trim();
          onStream(display);

        } catch { /* ignore malformed SSE */ }
      }
    }

    // ---- Final parse + emit if not applied ----
    const finalOps = parseOperations(full);
    if (finalOps.length > 0 && !applied) {
      onFiles(finalOps);
      onLog(`[FILES] Applied ${finalOps.length} files`);
    }

    // ── Detect structured parse failure ──────────────────────────────────
    // Model returned substantial code in a fenced block instead of FILE markers.
    // When detectMultiFileSignals blocked the collapse, finalOps is empty despite
    // the response containing code. Flag this so run() can retry with format instructions.
    let parseFailure = false;
    if (!applied && finalOps.length === 0) {
      const hasSubstantialCode = /```(?:tsx?|jsx?|typescript)\s*[\s\S]{100,}?```/.test(full);
      if (hasSubstantialCode) {
        parseFailure = true;
        onLog('[PARSE FAILURE] Model returned fenced code block instead of <!--FILE:--> markers — structured parse failure');
      }
    }

    // ── Update PROJECT_MEMORY with what was built ────────────────────────
    const builtFiles = finalOps
      .filter(op => op.op !== 'delete' && 'name' in op)
      .map(op => (op as any).name as string);

    if (builtFiles.length > 0) {
      const lastUserMsg  = history[history.length - 1]?.content?.toString() ?? '';
      const updatedFiles = updateProjectMemory(files, lastUserMsg, builtFiles);
      if (updatedFiles['PROJECT_MEMORY.md'] !== files['PROJECT_MEMORY.md']) {
        const memoryContent = updatedFiles['PROJECT_MEMORY.md'];
        onFiles([{ op: 'upsert', name: 'PROJECT_MEMORY.md', content: memoryContent }]);
        onLog('[MEMORY] PROJECT_MEMORY.md updated');

        // Persist to Supabase in background (non-blocking)
        const projectId = files['_projectId'] ?? null;
        persistMemoryToSupabase(memoryContent, projectId, onLog).then(() => {
          onLog('[MEMORY] Persisted to Supabase');
        }).catch(() => {
          onLog('[MEMORY] Supabase persist skipped');
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────

    // ---- Self-correction loop (Economic Intelligence Layer) ----
    Orchestrator._sessionRequestCount += 1;
    const sessionId = `${Orchestrator._sessionId}_${Orchestrator._sessionRequestCount}`;
    onLog(`[SESSION] ${sessionId}`);

    for (const op of finalOps) {
      if (!(op.op === 'upsert' && /\.(tsx?|jsx?)$/.test(op.name))) continue;

      const issues = this.heuristicCheck(op.content);
      if (issues.length === 0) {
        onLog(`[OK] ${op.name}: heuristics passed`);
        continue;
      }

      onLog(`[WARN] ${op.name}: ${issues.join(', ')}`);
      onPhase({ phase: 'verify', progress: 88, detail: `Fixing ${op.name}...` });

      // ── Step 1: Local regex fix (free, no API call) ──────────────────────
      const localFixed = Dispatcher.localFix(op.content);
      if (localFixed !== null) {
        const remaining = this.heuristicCheck(localFixed);
        if (remaining.length === 0) {
          onFiles([{ op: 'upsert', name: op.name, content: localFixed }]);
          op.content = localFixed;
          onLog(`[OK] ${op.name}: fixed locally (0 API cost)`);
          continue;
        }
        op.content = localFixed; // carry partial fix into API attempt
        onLog(`[LOCAL] ${op.name}: partial fix, remaining: ${remaining.join(', ')}`);
      }

      // ── Step 2: API correction — lightweight → main (max 2 attempts) ─────
      let fixed: string | null = null;

      for (let attempt = 1; attempt <= Dispatcher.maxAttempts; attempt++) {
        if (!Dispatcher.canAttempt(sessionId)) break;

        const budget = Dispatcher.checkBudget();
        if (!budget.allowed) { onLog(`[BUDGET] ${budget.warning}`); break; }
        if (budget.warning)    onLog(`[BUDGET] ${budget.warning}`);

        // Attempt 1 → lightweight;  Attempt 2 → escalate to main model
        const routeModel = attempt === 1
          ? Dispatcher.selectModel('syntax_fix', modelId).model
          : modelId;
        const tier = attempt === 1 ? 'lightweight' : 'main';

        onLog(`[FIX] Attempt ${attempt}/${Dispatcher.maxAttempts}: ${tier} (${routeModel})`);
        Dispatcher.recordAttempt(sessionId);

        fixed = await this.selfCorrect(op.content, issues, apiKey, routeModel);
        if (fixed) {
          onFiles([{ op: 'upsert', name: op.name, content: fixed }]);
          op.content = fixed;
          onLog(`[OK] ${op.name}: fixed (attempt ${attempt}/${Dispatcher.maxAttempts}, ${tier})`);
          break;
        }
        onLog(`[WARN] Attempt ${attempt}/${Dispatcher.maxAttempts} failed for ${op.name}`);
      }

      // ── Step 3: Both attempts exhausted — surface error to user ──────────
      if (!fixed) {
        const used = Dispatcher.attemptsUsed(sessionId);
        onLog(`[BLOCKED] ${op.name}: max auto-fix attempts (${used}/${Dispatcher.maxAttempts}) reached`);
        onLog(`[ACTION] Issues: ${issues.join('; ')}`);
        onStream(
          `\n\n⛔ **Auto-fix limit reached** (${used}/${Dispatcher.maxAttempts} attempts).\n` +
          `**Issues found:** \`${issues.join(', ')}\`\n` +
          '**Tried:** local regex → lightweight model → main model\n' +
          '**Next step:** Paste the error you see in the preview, or rephrase your request.'
        );
      }
    }

    onPhase({ phase: 'idle', progress: 100 });
    onLog('[DONE] Generation finished');

    const clean = full
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<!--FILE:[^>]+-->[\s\S]*?<!--\/FILE-->/g, '')
      .replace(/```[\w]*\s*[\s\S]*?```/g, '')
      .trim();

    return {
      message:    clean || '[DONE]',
      operations: finalOps,
      graph:      applyOperationsToGraph(fileMapToProjectGraph(files, '', ''), finalOps),
      parseFailure,
    };
  }

  // ---- Agentic run loop ----

  static async run(config: {
    intent:         string;
    history:        LLMMessage[];
    files:          Record<string, string>;
    apiKey:         string;
    modelId:        string;
    fixModelId?:    string;
    onStream:       (text: string) => void;
    onFiles:        (ops: FileOperation[]) => void;
    onPhase:        (e: PhaseEvent) => void;
    onLog:          (msg: string) => void;
    onPlan:         (steps: string[]) => void;
    signal?:        AbortSignal;
    onUsage?:       (data: UsageData) => void;
    language?:      string;
    maxIterations?: number;
    /** Inferred manifest from ProductArchitect (multi-page info, capabilities, etc.) */
    manifest?:       import('../shared/projectModel').ProductManifest;
    /** From HydrationService — files to include in context. Empty = include all. */
    relevantFiles?:  string[];
    /** From HydrationService — scope instruction appended to system prompt. */
    scopeConstraint?: string;
    /** Override API key used for the streaming chat call (build agent key). Falls back to apiKey. */
    chatApiKey?: string;
    /** Override endpoint for the streaming chat call. Must be OpenAI-compatible SSE. Falls back to OpenRouter. */
    chatEndpoint?: string;
  }): Promise<OrchestratorResult> {
    const maxIter = config.maxIterations ?? 2;
    let currentFiles = { ...config.files };
    let lastResult: OrchestratorResult = {
      message:    '',
      operations: [],
      graph:      fileMapToProjectGraph(currentFiles, '', ''),
    };

    for (let iter = 1; iter <= maxIter; iter++) {
      config.onLog(`[AGENT] Iteration ${iter}/${maxIter}`);
      config.onPhase({ phase: 'think', progress: 10 * iter, detail: `Iteration ${iter}` });

      lastResult = await Orchestrator.chat(
        config.history,
        { ...currentFiles, '_intent': config.intent },
        config.chatApiKey || config.apiKey,
        config.modelId,
        config.onStream,
        (ops) => {
          currentFiles = applyOperations(currentFiles, ops);
          config.onFiles(ops);
        },
        config.onPhase,
        config.onLog,
        config.signal,
        config.onUsage,
        config.language,
        config.manifest,
        config.relevantFiles,
        config.scopeConstraint,
        config.chatEndpoint,
      );

      const codeOps = lastResult.operations.filter(
        op => op.op === 'upsert' && /\.(tsx?|jsx?)$/.test((op as any).name)
      );

      const allClean = codeOps.every(op => {
        const issues = Orchestrator.heuristicCheck((op as any).content);
        if (issues.length > 0) {
          config.onLog(`[AGENT] Issues in ${(op as any).name}: ${issues.join(', ')}`);
          return false;
        }
        return true;
      });

      // ── Parse failure → targeted retry requesting FILE markers ──────────
      if (lastResult.parseFailure) {
        config.onLog('[AGENT] ⚠ Structured parse failure — model used fenced code block instead of FILE markers');
        if (iter < maxIter) {
          currentFiles = {
            ...currentFiles,
            '_agent_error':
              'CRITICAL FORMAT ERROR: Your previous response used a ```code block``` instead of ' +
              '<!--FILE:/path-->...<!--/FILE--> markers. You MUST wrap EVERY file in FILE markers. ' +
              'Do NOT use fenced code blocks. Re-generate the complete output using ' +
              '<!--FILE:/path-->...<!--/FILE--> for each file.',
          };
          config.onLog('[AGENT] Retrying with explicit FILE marker instruction');
          continue;
        }
        config.onLog('[AGENT] ❌ Parse failure persisted after all iterations — no files produced');
        break;
      }

      if (allClean || codeOps.length === 0) {
        config.onLog(`[AGENT] ✅ Clean on iteration ${iter}`);
        break;
      }

      if (iter < maxIter) {
        const issuesSummary = codeOps
          .flatMap(op => Orchestrator.heuristicCheck((op as any).content)
            .map(i => `${(op as any).name}: ${i}`))
          .join('\n');
        config.onLog(`[AGENT] Re-running with error context`);
        currentFiles = {
          ...currentFiles,
          '_agent_error': `Previous attempt had issues:\n${issuesSummary}\nFix these in the next response.`,
        };
      }
    }

    delete currentFiles['_agent_error'];
    // Rebuild graph from the final accumulated file state — all iterations applied
    return {
      ...lastResult,
      graph: fileMapToProjectGraph(currentFiles, '', ''),
    };
  }

  // ---- Low-level non-streaming completer ----

  /**
   * Single non-streaming LLM call — OpenAI-compatible endpoint.
   * Throws on non-ok HTTP or network error.
   */
  private static async _rawComplete(
    messages: { role: string; content: string }[],
    model:    string,
    apiKey:   string,
    endpoint: string,
  ): Promise<string> {
    const resp = await llmFetch(
      endpoint,
      {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  window.location.origin,
        'X-Title':       'AIC-RG Studio',
      },
      JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens:  10000,
      }),
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`${resp.status} ${resp.statusText}: ${body.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Single non-streaming LLM call — Anthropic Messages API.
   * Separates system messages, uses x-api-key header + anthropic-version.
   * Prompt caching: system prompt is split into stable (cacheable) + dynamic parts.
   * Cache hit/miss is logged via metricsService.
   */
  private static async _rawCompleteAnthropic(
    messages: { role: string; content: string }[],
    model:    string,
    apiKey:   string,
    baseUrl:  string,  // e.g. https://api.anthropic.com/v1
  ): Promise<string> {
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const userMsgs    = messages.filter(m => m.role !== 'system');
    const endpoint    = baseUrl.replace(/\/$/, '') + '/messages';

    // ── Prompt caching: mark stable system prompt as cacheable ──────────────
    // The system prompt is typically large and stable — mark it for server-side
    // caching so repeated calls in the same session don't re-tokenize it.
    // Anthropic charges for the cache write once, then 10% of read cost on hits.
    const systemBlock = systemParts
      ? [{ type: 'text', text: systemParts, cache_control: { type: 'ephemeral' } }]
      : undefined;

    const bodyObj: Record<string, unknown> = {
      model,
      messages:    userMsgs,
      max_tokens:  10000,
      temperature: 0.2,
    };
    if (systemBlock) bodyObj.system = systemBlock;

    const resp = await llmFetch(
      endpoint,
      {
        'x-api-key':         apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
        'content-type':      'application/json',
      },
      JSON.stringify(bodyObj),
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`${resp.status} ${resp.statusText}: ${body.slice(0, 200)}`);
    }
    const data = await resp.json();

    // ── Cache metrics: log hit/miss from Anthropic usage response ───────────
    const usage = data.usage as Record<string, number> | undefined;
    if (usage) {
      const cacheRead    = usage.cache_read_input_tokens    ?? 0;
      const cacheWrite   = usage.cache_creation_input_tokens ?? 0;
      const cacheStatus  = cacheRead > 0 ? 'HIT' : cacheWrite > 0 ? 'MISS(write)' : 'MISS';
      console.info(`[Anthropic cache] ${cacheStatus} | read=${cacheRead} write=${cacheWrite} input=${usage.input_tokens ?? 0} output=${usage.output_tokens ?? 0}`);
      metricsService.record({
        phase:        'orchestrator',
        model,
        inputTokens:  usage.input_tokens  ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        extra: {
          event:      'anthropic_cache',
          cacheStatus,
          cacheRead,
          cacheWrite,
        },
      });
    }

    return (data.content as Array<{ type: string; text?: string }> | undefined)
      ?.find(c => c.type === 'text')?.text ?? '';
  }

  /**
   * Single non-streaming LLM call — local Claude bridge at :3000.
   * Bridge accepts { message: string, model: string } and returns
   * { content: [{ type: 'text', text: string }] }.
   */
  private static async _rawCompleteBridge(
    messages: { role: string; content: string }[],
    model:    string,
    endpoint: string,
  ): Promise<string> {
    const systemParts = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n');
    const userParts = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const text = typeof m.content === 'string'
          ? m.content
          : (m.content as Array<{ type: string; text?: string }>)
              .filter(b => b.type === 'text')
              .map(b => b.text ?? '')
              .join('\n');
        return `[${m.role === 'assistant' ? 'Assistant' : 'User'}]\n${text}`;
      })
      .join('\n\n');

    const message = systemParts
      ? `[System]\n${systemParts}\n\n${userParts}`
      : userParts;

    const resp = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, model: model || 'claude-sonnet-4-6' }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Claude bridge ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = await resp.json();
    return (data.content as Array<{ type: string; text?: string }> | undefined)
      ?.find(c => c.type === 'text')?.text ?? '';
  }

  // ---- Fallback-chain completer ----

  /**
   * Calls the LLM for the given agent slot with a 3-attempt fallback chain:
   *   Attempt 1 — primary model of the slot (OpenRouter / provider)
   *   Attempt 2 — fallback1ModelId  (same OpenRouter key, reserve model)
   *   Attempt 3 — fallback2ModelId  (native API, own key + baseUrl)
   *
   * Retries only on retryable errors: 404 / 429 / 5xx / network failures.
   * Non-retryable errors (401, AbortError, etc.) are thrown immediately.
   */
  static async callWithFallback(
    messages:      { role: string; content: string }[],
    systemPrompt:  string,
    agentSlot:     AgentSlot,
    fallbackApiKey?: string,
  ): Promise<string> {
    const SLOT_TO_AGENT: Partial<Record<AgentSlot, string>> = {
      primary: 'agent_primary',
      fix:     'agent_fix',
      spec:    'agent_spec',
      build:   'agent_build',
      qa:      'agent_qa',
    };
    const agentId = SLOT_TO_AGENT[agentSlot] ?? 'agent_primary';
    const cfg     = ConfigService.getAgentConfig(agentId);
    const apiKey  = (ConfigService.getKeyForAgent(agentSlot) || fallbackApiKey || ConfigService.getApiKey()).trim();
    const modelId = cfg.modelId || ConfigService.resolveModel(agentSlot);

    const allMessages: { role: string; content: string }[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const isRetryable = (err: Error) =>
      /404|429|5\d\d|network|fetch/i.test(err.message) || err.name === 'TypeError';

    // ── Attempt 1: primary ───────────────────────────────────────────────────
    let lastError: Error;
    try {
      if ((cfg.provider as string) === 'claude-bridge') {
        return await withOrchestratorTimeout(
          this._rawCompleteBridge(allMessages, modelId, this.getEndpoint('claude-bridge')),
          `callWithFallback slot=${agentSlot} model=${modelId}`,
        );
      }
      return await withOrchestratorTimeout(
        this._rawComplete(allMessages, modelId, apiKey, this.getEndpoint(cfg.provider)),
        `callWithFallback slot=${agentSlot} model=${modelId}`,
      );
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryable(lastError)) throw lastError;
      console.warn(`[Fallback1] primary (${modelId}) failed → trying fallback1`, lastError.message);
    }

    // ── Attempt 2: fallback1 (OpenRouter reserve) ────────────────────────────
    if (cfg.fallback1ModelId) {
      const f1Provider = (cfg.fallback1Provider as ApiProvider | undefined) ?? 'openrouter';
      try {
        return await withOrchestratorTimeout(
          this._rawComplete(allMessages, cfg.fallback1ModelId, apiKey, this.getEndpoint(f1Provider)),
          `callWithFallback slot=${agentSlot} model=${cfg.fallback1ModelId}`,
        );
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[Fallback2] fallback1 (${cfg.fallback1ModelId}) failed → trying fallback2 (native API)`, lastError.message);
      }
    }

    // ── Attempt 3: fallback2 (native API) ────────────────────────────────────
    if (cfg.fallback2ModelId) {
      const f2Key     = (cfg.fallback2Provider ? ConfigService.getProviderKeyByLabel(cfg.fallback2Provider) : '').trim() || apiKey;
      const f2BaseUrl = (cfg.fallback2BaseUrl ?? '').replace(/\/$/, '');
      const isAnthropic = f2BaseUrl.includes('anthropic.com');
      try {
        if (isAnthropic) {
          return await withOrchestratorTimeout(
            this._rawCompleteAnthropic(allMessages, cfg.fallback2ModelId, f2Key, f2BaseUrl),
            `callWithFallback slot=${agentSlot} model=${cfg.fallback2ModelId}`,
          );
        } else {
          const f2Endpoint = f2BaseUrl
            ? f2BaseUrl + '/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions';
          return await withOrchestratorTimeout(
            this._rawComplete(allMessages, cfg.fallback2ModelId, f2Key, f2Endpoint),
            `callWithFallback slot=${agentSlot} model=${cfg.fallback2ModelId}`,
          );
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(
      `All fallback attempts exhausted for slot "${agentSlot}". Last error: ${lastError!.message}`,
    );
  }

  // ---- complete (single-turn helper) ----

  static async complete(
    prompt: string,
    files:  Record<string, string>,
    apiKey: string
  ): Promise<string> {
    const r = await this.chat(
      [{ role: 'user', content: prompt }],
      files, apiKey,
      ConfigService.resolveModel('chat'),
      () => {}, () => {}
    );
    return r.message;
  }
}

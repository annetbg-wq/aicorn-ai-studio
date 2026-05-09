/**
 * ProtoPipeline — clean 6-step generation pipeline.
 *
 * Each step tells the user exactly what's happening
 * while the underlying work runs as a deterministic linear flow.
 *
 *   1. clarify   — 1 LLM call (agent_spec)        : confirm / clarify intent
 *   2. skeleton  — 1 backend call (no LLM)        : wipe src/, copy skeleton, validate build
 *   3. architect — 1 LLM call (agent_primary)     : delta plan over the skeleton
 *   4. coder     — 1 LLM call (agent_build)       : FILE/END blocks for delta files only
 *   5. apply     — pure JS                        : parse markers, filter protected paths
 *   6. build     — 1 backend call (no LLM)        : compile delta + emit /preview/<id>
 *
 *   On build failure: at most 2 repair passes (1 LLM call each).
 *
 * Models are resolved STRICTLY from user Settings via ConfigService. There are
 * no hardcoded model fallbacks. If a slot is unconfigured, the pipeline fails
 * fast with a clear "configure your model in Settings" error.
 *
 * The coder runs exactly once. If finish_reason === 'length', a single targeted
 * retry asks the model for the missing files only — never the whole project.
 */

import { llmFetchStream } from './LLMProxy';
import { ConfigService, type AgentSlot } from './ConfigService';
import { Orchestrator } from './Orchestrator';
import {
  type SkeletonId,
  SKELETON_REGISTRY,
  isProtectedSkeletonFile,
} from './SkeletonRegistry';
import { previewController } from './PreviewController';

// ── Public types ──────────────────────────────────────────────────────────────

export type StepId =
  | 'clarify'
  | 'skeleton'
  | 'architect'
  | 'coder'
  | 'apply'
  | 'build'
  | 'preview';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface StepEvent {
  step:    StepId;
  status:  StepStatus;
  /** Human-readable label shown to the user (RU). */
  label:   string;
  /** Optional secondary detail (e.g. "8 файлов"). */
  detail?: string;
}

export interface PipelineAttachment {
  type:        'image' | 'text' | 'code' | 'pdf';
  name:        string;
  data:        string;
  mimeType:    string;
  textContent?: string;
}

export interface ProtoPipelineConfig {
  prompt:       string;
  skeletonId:   SkeletonId;
  buildId:      string;
  attachments?: PipelineAttachment[];
  signal?:      AbortSignal;
  /** Step lifecycle events for the progress UI. */
  onStep:       (e: StepEvent) => void;
  /** Free-form log output (debug pane, telemetry). */
  onLog?:       (msg: string, level?: 'info' | 'warn' | 'error') => void;
  /** Streaming coder token deltas (for the live "Пишу код…" preview). */
  onCoderStream?: (delta: string) => void;
  /** Fired exactly once after a successful build. */
  onPreviewReady?: (url: string, buildId: string) => void;
}

export interface ProtoPipelineResult {
  success:  boolean;
  buildId:  string;
  url?:     string;
  files?:   Record<string, string>;
  plan?:    ArchitectPlan;
  error?:   string;
}

export interface ArchitectPlan {
  appName:     string;
  summary:     string;
  /**
   * Delta files the coder MUST produce (relative to preview-workspace/src/).
   * Skeleton-provided files MUST NOT appear here.
   */
  deltaFiles:  Array<{ path: string; purpose: string }>;
  /** Optional pages the coder should wire into the router. */
  pages?:      Array<{ path: string; name: string; file: string; purpose: string }>;
  /** Free-form notes routed into the coder system prompt. */
  notes?:      string[];
}

// ── Step labels (RU) ───────────────────────────────────────────

const STEP_LABEL: Record<StepId, string> = {
  clarify:   'Понимаю задачу...',
  skeleton:  'Устанавливаю основу...',
  architect: 'Проектирую архитектуру...',
  coder:     'Пишу код...',
  apply:     'Применяю изменения...',
  build:     'Собираю приложение...',
  preview:   'Готово',
};

// ── Token / timeout budgets per step ──────────────────────────────────────────

const STEP_BUDGET = {
  clarify:   { maxTokens:  600,  timeoutMs:  20_000 },
  architect: { maxTokens: 4_000, timeoutMs:  60_000 },
  coder:     { maxTokens: 35_000, timeoutMs: 360_000 },
  repair:    { maxTokens: 12_000, timeoutMs: 120_000 },
} as const;

const MAX_REPAIR_PASSES = 2;

// ── Implementation ────────────────────────────────────────────────────────────

export class ProtoPipeline {
  /**
   * Optional Step 1 helper — callers may invoke this BEFORE run() to ask the
   * user clarifying questions. Returns null when the prompt is already clear
   * or when the LLM call fails (treated as "skip").
   */
  static async clarify(config: {
    prompt:  string;
    signal?: AbortSignal;
  }): Promise<{ questions: string[] } | null> {
    const route = resolveRoute('spec');
    if (!route.modelId || !route.apiKey) return null;

    const system = `You are a product advisor. The user wants to build an app.
If their request is clear and specific, respond with: {"clear": true}
Otherwise respond with: {"clear": false, "questions": ["q1", "q2"]}
Maximum 2 short questions. Ask about WHAT, not HOW. JSON only — no prose, no markdown.`;

    let raw: string;
    try {
      raw = await callOnce({
        slot:        'spec',
        system,
        user:        config.prompt,
        maxTokens:   STEP_BUDGET.clarify.maxTokens,
        timeoutMs:   STEP_BUDGET.clarify.timeoutMs,
        signal:      config.signal,
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      return null;
    }

    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.clear === true) return null;
    const qs = Array.isArray(obj.questions)
      ? obj.questions.filter((q): q is string => typeof q === 'string')
      : [];
    return qs.length > 0 ? { questions: qs } : null;
  }

  /**
   * Run the full 6-step pipeline. Always emits step events even on failure
   * so the UI can surface the exact phase that broke.
   */
  static async run(config: ProtoPipelineConfig): Promise<ProtoPipelineResult> {
    const log = config.onLog ?? (() => {});
    const emit = (step: StepId, status: StepStatus, detail?: string) =>
      config.onStep({ step, status, label: STEP_LABEL[step], detail });
    const fail = (step: StepId, error: string): ProtoPipelineResult => {
      log(`[ProtoPipeline] ${step} failed: ${error}`, 'error');
      emit(step, 'error', error);
      return { success: false, buildId: config.buildId, error };
    };

    if (!SKELETON_REGISTRY[config.skeletonId]) {
      return fail('skeleton', `Unknown skeletonId: ${config.skeletonId}`);
    }

    // ── Step 1 — Clarifier (advisory; never blocks) ───────────────────────
    emit('clarify', 'active');
    let clarifiedPrompt = config.prompt;
    try {
      const enrichment = await summarizeIntent(config.prompt, config.signal);
      if (enrichment) {
        clarifiedPrompt = enrichment;
        log(`[clarify] intent normalised`);
      }
    } catch (err) {
      if (isAbort(err)) return fail('clarify', 'aborted');
      log(`[clarify] non-fatal: ${(err as Error).message}`, 'warn');
    }
    emit('clarify', 'done');

    // ── Step 2 — Skeleton install (validates clean build) ─────────────────
    emit('skeleton', 'active');
    try {
      await compile(config.buildId, {}, config.skeletonId, config.signal);
    } catch (err) {
      if (isAbort(err)) return fail('skeleton', 'aborted');
      return fail('skeleton', `Clean skeleton build failed: ${(err as Error).message}`);
    }
    emit('skeleton', 'done');

    // ── Step 3 — Architect (delta plan only) ──────────────────────────────
    emit('architect', 'active');
    let plan: ArchitectPlan;
    try {
      plan = await runArchitect({
        prompt:     clarifiedPrompt,
        skeletonId: config.skeletonId,
        signal:     config.signal,
        onLog:      log,
      });
    } catch (err) {
      if (isAbort(err)) return fail('architect', 'aborted');
      return fail('architect', (err as Error).message);
    }
    if (plan.deltaFiles.length === 0) {
      return fail('architect', 'Architect returned an empty delta plan');
    }
    emit('architect', 'done', `${plan.deltaFiles.length} файлов`);

    // ── Step 4 — Coder (one shot + at most one targeted retry) ────────────
    emit('coder', 'active');
    let deltaFiles: Record<string, string>;
    try {
      deltaFiles = await runCoder({
        prompt:     clarifiedPrompt,
        plan,
        skeletonId: config.skeletonId,
        signal:     config.signal,
        onLog:      log,
        onStream:   config.onCoderStream,
      });
    } catch (err) {
      if (isAbort(err)) return fail('coder', 'aborted');
      return fail('coder', (err as Error).message);
    }
    emit('coder', 'done', `${Object.keys(deltaFiles).length} файлов`);

    // ── Step 5 — Apply (filter protected, defend STORAGE_KEYS) ────────────
    emit('apply', 'active');
    const filteredFiles: Record<string, string> = {};
    let droppedProtected = 0;
    for (const [path, content] of Object.entries(deltaFiles)) {
      if (isProtectedSkeletonFile(config.skeletonId, path)) {
        droppedProtected += 1;
        log(`[apply] dropped protected: ${path}`, 'warn');
        continue;
      }
      filteredFiles[path] = content;
    }
    if (droppedProtected > 0) {
      log(`[apply] ${droppedProtected} protected file(s) ignored`, 'warn');
    }
    if (Object.keys(filteredFiles).length === 0) {
      return fail('apply', 'All produced files are skeleton-protected — nothing to write');
    }
    emit('apply', 'done', `${Object.keys(filteredFiles).length} файлов`);

    // ── Step 6 — Build (with at most 2 repair passes) ─────────────────────
    emit('build', 'active');
    let lastBuildErr: string | null = null;
    let currentFiles = filteredFiles;
    let buildOk = false;
    for (let attempt = 0; attempt <= MAX_REPAIR_PASSES; attempt++) {
      try {
        await compile(config.buildId, currentFiles, config.skeletonId, config.signal);
        buildOk = true;
        break;
      } catch (err) {
        if (isAbort(err)) return fail('build', 'aborted');
        lastBuildErr = (err as Error).message;
        log(`[build] attempt ${attempt + 1} failed: ${lastBuildErr}`, 'warn');
        if (attempt === MAX_REPAIR_PASSES) break;
        try {
          const repaired = await runRepair({
            prompt:      clarifiedPrompt,
            plan,
            skeletonId:  config.skeletonId,
            currentFiles,
            errorLog:    lastBuildErr,
            signal:      config.signal,
            onLog:       log,
          });
          currentFiles = { ...currentFiles, ...repaired };
        } catch (repairErr) {
          if (isAbort(repairErr)) return fail('build', 'aborted');
          log(`[repair] LLM call failed: ${(repairErr as Error).message}`, 'warn');
          break;
        }
      }
    }
    if (!buildOk) {
      return fail('build', `Build failed after ${MAX_REPAIR_PASSES + 1} attempts: ${lastBuildErr ?? 'unknown'}`);
    }
    emit('build', 'done');

    // ── Step 7 — Preview ready ────────────────────────────────────────────
    const url = `/preview/${config.buildId}`;
    emit('preview', 'done', url);
    config.onPreviewReady?.(url, config.buildId);

    return { success: true, buildId: config.buildId, url, files: currentFiles, plan };
  }

  /**
   * Stand-alone repair entry point (used by the in-app "Fix it" affordance).
   */
  static async repair(config: {
    buildId:     string;
    skeletonId:  SkeletonId;
    prompt:      string;
    errorLog:    string;
    currentFiles: Record<string, string>;
    signal?:     AbortSignal;
    onLog?:      (msg: string, level?: 'info' | 'warn' | 'error') => void;
  }): Promise<{ success: boolean; error?: string }> {
    const log = config.onLog ?? (() => {});
    try {
      const repaired = await runRepair({
        prompt:      config.prompt,
        plan:        { appName: 'app', summary: '', deltaFiles: Object.keys(config.currentFiles).map(p => ({ path: p, purpose: '' })) },
        skeletonId:  config.skeletonId,
        currentFiles: config.currentFiles,
        errorLog:    config.errorLog,
        signal:      config.signal,
        onLog:       log,
      });
      const merged = { ...config.currentFiles, ...repaired };
      await compile(config.buildId, merged, config.skeletonId, config.signal);
      return { success: true };
    } catch (err) {
      if (isAbort(err)) return { success: false, error: 'aborted' };
      return { success: false, error: (err as Error).message };
    }
  }
}

// ── Step 1 helper: light-touch normalisation ─────────────────────────────────
//
// The full clarify() above asks the user questions. summarizeIntent() instead
// silently rewrites the prompt into a clean one-paragraph form, which is what
// the run() pipeline uses internally so the architect always sees high-signal
// input regardless of how the user phrased the request.

async function summarizeIntent(prompt: string, signal?: AbortSignal): Promise<string | null> {
  const route = resolveRouteOrSkip('spec');
  if (!route) return null;

  const system = `Rewrite the user's product idea as a single dense paragraph.
Keep it under 400 characters.
Preserve every concrete feature, page, and constraint they mentioned.
Do not add new features. Do not ask questions. Output the paragraph only.`;
  try {
    const out = await callOnce({
      slot:      'spec',
      system,
      user:      prompt,
      maxTokens: STEP_BUDGET.clarify.maxTokens,
      timeoutMs: STEP_BUDGET.clarify.timeoutMs,
      signal,
    });
    const cleaned = out.trim().replace(/^["']|["']$/g, '');
    return cleaned.length > 20 ? cleaned : null;
  } catch (err) {
    if (isAbort(err)) throw err;
    return null;
  }
}

// ── Step 3 — Architect ───────────────────────────────────────────────────────

async function runArchitect(input: {
  prompt:     string;
  skeletonId: SkeletonId;
  signal?:    AbortSignal;
  onLog:      (msg: string, level?: 'info' | 'warn' | 'error') => void;
}): Promise<ArchitectPlan> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  const lockedList = skeleton.lockedPrefixes.map(p => `  - ${p}`).join('\n');
  const providedList = [
    ...skeleton.providedComponents.map(c => `component:${c}`),
    ...skeleton.providedHooks.map(h => `hook:${h}`),
    ...skeleton.uiPrimitives.map(u => `ui:${u}`),
  ].join(', ');

  const system = `You are a senior product architect. The user wants a React + Tailwind app built on top of an EXISTING SKELETON.

SKELETON: ${skeleton.label} (${skeleton.id})
NAVIGATION: ${skeleton.navigation}
ALREADY PROVIDED (do not recreate): ${providedList || '(none listed)'}
LOCKED PATHS (do not write to these):
${lockedList || '  (none)'}

Your job: produce a JSON plan listing ONLY the DELTA files the coder must create or rewrite on top of the skeleton. Skeleton files (router, providers, layout shell, theme tokens, base UI primitives) MUST NOT appear in deltaFiles.

Return ONLY valid JSON matching this schema:
{
  "appName":  "<short name>",
  "summary":  "<one-sentence elevator pitch>",
  "deltaFiles": [
    { "path": "pages/<Page>.tsx",  "purpose": "<what this file owns>" }
  ],
  "pages": [
    { "path": "/dashboard", "name": "Dashboard", "file": "pages/Dashboard.tsx", "purpose": "..." }
  ],
  "notes": ["any cross-cutting requirement worth telling the coder"]
}

RULES
- All paths are relative to preview-workspace/src/ — no leading "src/" or "/".
- 4 to 12 deltaFiles. Bias to fewer larger files.
- Wire pages through the skeleton router only — do not invent a new App.tsx unless the skeleton has none.
- Use only the components/hooks/UI primitives listed above. Do not invent imports.
- Output JSON only. No markdown fences. No prose.`;

  const raw = await callOnce({
    slot:      'primary',
    system,
    user:      input.prompt,
    maxTokens: STEP_BUDGET.architect.maxTokens,
    timeoutMs: STEP_BUDGET.architect.timeoutMs,
    signal:    input.signal,
  });

  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Architect returned non-JSON output');
  }
  const obj = parsed as Record<string, unknown>;
  const deltaRaw = Array.isArray(obj.deltaFiles) ? obj.deltaFiles : [];
  const deltaFiles = deltaRaw
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const dx = d as Record<string, unknown>;
      const path = typeof dx.path === 'string' ? normaliseDeltaPath(dx.path) : '';
      if (!path) return null;
      const purpose = typeof dx.purpose === 'string' ? dx.purpose : '';
      return { path, purpose };
    })
    .filter((d): d is { path: string; purpose: string } => d !== null);

  if (deltaFiles.length === 0) {
    throw new Error('Architect plan contains no usable deltaFiles');
  }

  const pagesRaw = Array.isArray(obj.pages) ? obj.pages : [];
  const pages = pagesRaw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const px = p as Record<string, unknown>;
      const path = typeof px.path === 'string' ? px.path : '';
      const name = typeof px.name === 'string' ? px.name : '';
      const file = typeof px.file === 'string' ? normaliseDeltaPath(px.file) : '';
      const purpose = typeof px.purpose === 'string' ? px.purpose : '';
      return path && name && file ? { path, name, file, purpose } : null;
    })
    .filter((p): p is { path: string; name: string; file: string; purpose: string } => p !== null);

  return {
    appName:  typeof obj.appName === 'string' ? obj.appName : 'App',
    summary:  typeof obj.summary === 'string' ? obj.summary : '',
    deltaFiles,
    pages,
    notes: Array.isArray(obj.notes)
      ? obj.notes.filter((n): n is string => typeof n === 'string')
      : [],
  };
}

// ── Step 4 — Coder ───────────────────────────────────────────────────────────

async function runCoder(input: {
  prompt:     string;
  plan:       ArchitectPlan;
  skeletonId: SkeletonId;
  signal?:    AbortSignal;
  onLog:      (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onStream?:  (delta: string) => void;
}): Promise<Record<string, string>> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  const fileList = input.plan.deltaFiles
    .map(d => `  - ${d.path}${d.purpose ? `  // ${d.purpose}` : ''}`)
    .join('\n');
  const pageList = input.plan.pages && input.plan.pages.length > 0
    ? input.plan.pages.map(p => `  - ${p.path}  → ${p.file}  (${p.purpose})`).join('\n')
    : '  (none — single-screen app)';
  const notesBlock = input.plan.notes && input.plan.notes.length > 0
    ? `\nADDITIONAL REQUIREMENTS\n${input.plan.notes.map(n => `  • ${n}`).join('\n')}\n`
    : '';

  const system = `You are a senior React + TypeScript + Tailwind engineer. You are completing an app on top of an existing skeleton.

SKELETON: ${skeleton.label} (${skeleton.id})
PROVIDED COMPONENTS: ${skeleton.providedComponents.join(', ') || '(see registry)'}
PROVIDED HOOKS: ${skeleton.providedHooks.join(', ') || '(see registry)'}
UI PRIMITIVES: ${skeleton.uiPrimitives.join(', ') || '(see registry)'}

YOU MUST write EXACTLY these files and only these files:
${fileList}

PAGES TO WIRE INTO THE ROUTER:
${pageList}
${notesBlock}
OUTPUT FORMAT — CRITICAL
Emit each file enclosed in plain-text markers, nothing else around them:

<<<FILE: pages/Dashboard.tsx>>>
// full file contents here
<<<END>>>

<<<FILE: components/StatCard.tsx>>>
// full file contents here
<<<END>>>

RULES
- Paths relative to preview-workspace/src/. No leading "src/" or "/".
- Each file must be a complete, compilable .tsx/.ts file. No diffs, no patches.
- Only import from skeleton-provided modules, "@/components/ui/*", "lucide-react", "react", and files you yourself emit.
- Do not modify any skeleton-locked path.
- No commentary outside the markers. No markdown. No code fences.
- Quality over verbosity: real content, no lorem ipsum, no TODOs.`;

  let firstReason = '';
  let body = '';
  await streamCall({
    slot:      'build',
    system,
    user:      input.prompt + '\n\nSummary: ' + input.plan.summary,
    maxTokens: STEP_BUDGET.coder.maxTokens,
    timeoutMs: STEP_BUDGET.coder.timeoutMs,
    signal:    input.signal,
    onChunk:   (delta) => { body += delta; input.onStream?.(delta); },
    onFinishReason: (r) => { firstReason = r; },
  });

  let parsed = parseFileMarkers(body);
  let missing = input.plan.deltaFiles
    .map(d => d.path)
    .filter(p => !(p in parsed));

  // Targeted retry for length truncation — ask only for the missing files.
  if ((firstReason === 'length' || missing.length > 0) && missing.length > 0) {
    input.onLog(`[coder] retry for ${missing.length} missing file(s) (finish_reason=${firstReason || 'incomplete'})`, 'warn');
    const retrySystem = `Same task as before. Emit ONLY the files listed below, in the same FILE/END marker format. Do not repeat already-produced files.

MISSING FILES:
${missing.map(p => `  - ${p}`).join('\n')}`;
    let retryBody = '';
    try {
      await streamCall({
        slot:      'build',
        system:    retrySystem,
        user:      'Re-emit ONLY the missing files for the previous task.',
        maxTokens: STEP_BUDGET.coder.maxTokens,
        timeoutMs: STEP_BUDGET.coder.timeoutMs,
        signal:    input.signal,
        onChunk:   (delta) => { retryBody += delta; input.onStream?.(delta); },
      });
      const retryParsed = parseFileMarkers(retryBody);
      parsed = { ...parsed, ...retryParsed };
      missing = input.plan.deltaFiles
        .map(d => d.path)
        .filter(p => !(p in parsed));
    } catch (err) {
      if (isAbort(err)) throw err;
      input.onLog(`[coder] retry failed: ${(err as Error).message}`, 'warn');
    }
  }

  if (Object.keys(parsed).length === 0) {
    throw new Error('Coder produced no FILE/END blocks — output was unparsable');
  }
  if (missing.length > 0) {
    input.onLog(`[coder] still missing after retry: ${missing.join(', ')}`, 'warn');
  }
  return parsed;
}

// ── Repair pass ──────────────────────────────────────────────────────────────

async function runRepair(input: {
  prompt:       string;
  plan:         ArchitectPlan;
  skeletonId:   SkeletonId;
  currentFiles: Record<string, string>;
  errorLog:     string;
  signal?:      AbortSignal;
  onLog:        (msg: string, level?: 'info' | 'warn' | 'error') => void;
}): Promise<Record<string, string>> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  // Heuristic: pull file paths the error log references; fall back to all files.
  const referenced = Array.from(input.errorLog.matchAll(/(?:src\/)?([\w./@-]+\.(?:tsx?|css|json))/g))
    .map(m => normaliseDeltaPath(m[1]))
    .filter(p => p in input.currentFiles);
  const targetPaths = referenced.length > 0
    ? Array.from(new Set(referenced))
    : Object.keys(input.currentFiles);

  const targets = targetPaths
    .map(p => `<<<FILE: ${p}>>>\n${input.currentFiles[p]}\n<<<END>>>`)
    .join('\n\n');

  const system = `You are fixing build errors. Re-emit the files below with the bugs fixed.
Same FILE/END marker format. Only emit files you actually changed. Do not modify any skeleton-locked path.
SKELETON: ${skeleton.label} (${skeleton.id})

BUILD ERROR LOG (truncated):
${input.errorLog.slice(0, 4000)}`;

  let body = '';
  await streamCall({
    slot:      'fix',
    system,
    user:      `Original task: ${input.prompt}\n\nFiles to repair:\n\n${targets}`,
    maxTokens: STEP_BUDGET.repair.maxTokens,
    timeoutMs: STEP_BUDGET.repair.timeoutMs,
    signal:    input.signal,
    onChunk:   () => { /* repair output is not streamed to UI */ },
  });
  void body;
  const parsed = parseFileMarkers(body);
  if (Object.keys(parsed).length === 0) {
    throw new Error('Repair produced no FILE/END blocks');
  }
  return parsed;
}

// ── Backend compile call ─────────────────────────────────────────────────────

async function compile(
  buildId:    string,
  files:      Record<string, string>,
  skeletonId: SkeletonId,
  signal?:    AbortSignal,
): Promise<void> {
  // 1. Notify UI that compile is starting (sets previewState.expectingBuildId → iframe gets URL)
  previewController.notifyCompiling(buildId);

  // 2. Call backend compile endpoint
  const resp = await fetch(`/api/preview/${encodeURIComponent(buildId)}/compile`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ files, skeletonId }),
    signal,
  });
  const text = await resp.text();
  let json: { success?: boolean; error?: string } = {};
  try { json = JSON.parse(text); } catch { /* keep raw text */ }
  if (!resp.ok || json.success === false) {
    const errMsg = json.error || text || `compile failed (${resp.status})`;
    previewController.notifyFailed(errMsg, buildId);
    throw new Error(errMsg);
  }

  // 3. Force-reload the iframe so MountReporter fires (iframe may have gotten 404 during build)
  const iframe = typeof document !== 'undefined'
    ? document.querySelector<HTMLIFrameElement>('iframe[data-testid="preview-iframe"]')
    : null;
  const nextPreviewUrl = `/preview/${buildId}`;
  if (iframe) {
    const absoluteNextUrl = new URL(nextPreviewUrl, window.location.origin).toString();
    if (iframe.src === absoluteNextUrl) {
      iframe.src = 'about:blank';
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    iframe.src = nextPreviewUrl;
  }

  // 4. Wait for preview-mounted postMessage from MountReporter (timeout: 45s)
  const ready = await waitForIframeMounted(buildId, signal);
  if (!ready) {
    // Don't throw — preview might still load; just log and continue
    console.warn(`[ProtoPipeline] compile: preview-mounted not received for ${buildId} — iframe may load later`);
  }

  // 5. Mark preview as ready in PreviewController
  previewController.notifyReady(buildId, 'proto_pipeline_complete');
}

function waitForIframeMounted(buildId: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutMs = 45_000;
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'preview-mounted' && e.data.buildId === buildId) settle(true);
      if (e.data.type === 'iframe-error') settle(false);
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => settle(false), timeoutMs);
    signal?.addEventListener('abort', () => settle(false), { once: true });
  });
}

// ── LLM helpers ──────────────────────────────────────────────────────────────

interface ResolvedRoute {
  modelId:  string;
  apiKey:   string;
  endpoint: string;
  provider: string;
}

function resolveRoute(slot: AgentSlot): ResolvedRoute {
  const modelId = ConfigService.resolveModel(slot);
  if (!modelId) {
    throw new Error(
      `Model not configured for slot "${slot}". Open Settings → Agents and pick a model for AGENT_CONFIG_agent_${slot}.`,
    );
  }
  const apiKey = ConfigService.getKeyForAgent(slot);
  if (!apiKey) {
    throw new Error(
      `API key missing for slot "${slot}". Open Settings → Providers and set the key.`,
    );
  }
  const provider = ConfigService.getAgentConfig(`agent_${slot}`).provider || 'openrouter';
  const endpoint = Orchestrator.getEndpoint(provider);
  return { modelId, apiKey, endpoint, provider };
}

function resolveRouteOrSkip(slot: AgentSlot): ResolvedRoute | null {
  try { return resolveRoute(slot); } catch { return null; }
}

async function callOnce(input: {
  slot:      AgentSlot;
  system:    string;
  user:      string;
  maxTokens: number;
  timeoutMs: number;
  signal?:   AbortSignal;
}): Promise<string> {
  let out = '';
  await streamCall({
    ...input,
    onChunk: (delta) => { out += delta; },
  });
  return out;
}

async function streamCall(input: {
  slot:           AgentSlot;
  system:         string;
  user:           string;
  maxTokens:      number;
  timeoutMs:      number;
  signal?:        AbortSignal;
  onChunk:        (delta: string) => void;
  onFinishReason?: (reason: string) => void;
}): Promise<void> {
  const route = resolveRoute(input.slot);
  const body = JSON.stringify({
    model:       Orchestrator.normalizeModelId(route.modelId, route.endpoint),
    messages:    [
      { role: 'system', content: input.system },
      { role: 'user',   content: input.user },
    ],
    stream:      true,
    temperature: 0.3,
    max_tokens:  input.maxTokens,
  });
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${route.apiKey}`,
    'Content-Type':  'application/json',
    'HTTP-Referer':  typeof window !== 'undefined' ? window.location.origin : '',
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs);
  const onCallerAbort = () => ctrl.abort();
  input.signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const resp = await llmFetchStream(route.endpoint, headers, body, ctrl.signal);
    await readSSE(resp, input.onChunk, input.onFinishReason);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onCallerAbort);
  }
}

async function readSSE(
  resp: Response,
  onChunk: (delta: string) => void,
  onFinishReason?: (reason: string) => void,
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  let lastReason = '';

  const handleLine = (line: string): void => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6);
    if (payload === '[DONE]') return;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content ?? '';
      if (delta) onChunk(delta);
      const fr = parsed.choices?.[0]?.finish_reason;
      if (fr) lastReason = fr;
    } catch { /* skip malformed JSON */ }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) handleLine(line);
  }
  if (buffer) handleLine(buffer);
  onFinishReason?.(lastReason);
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function parseFileMarkers(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Tolerate variations: <<<FILE: path>>> ... <<<END>>>, with or without spaces.
  const re = /<<<\s*FILE\s*:\s*([^>\n]+?)\s*>>>([\s\S]*?)<<<\s*END\s*>>>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const path = normaliseDeltaPath(match[1].trim());
    if (!path) continue;
    let body = match[2];
    // Strip leading newline and any markdown fences the model might have wrapped around.
    body = body.replace(/^\s*```[\w-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    body = body.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '\n');
    out[path] = body;
  }
  return out;
}

function normaliseDeltaPath(p: string): string {
  return p
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/^src\/+/, '')
    .replace(/^preview-workspace\/(?:src\/)?/, '')
    .replace(/\\/g, '/');
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  // Salvage the first {...} block.
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ── Public step-label helper for UI consumers ────────────────────────────────

export function stepLabel(step: StepId): string {
  return STEP_LABEL[step];
}


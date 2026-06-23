/**
 * LVPipeline — blank_canvas fast path.
 *
 * Lovable-like single-shot generation without skeleton/architect stages.
 * Uses ProductDocumentSet, CompletenessGate, and Pass 2 quality loop.
 *
 * Route: generationPath === 'blank_canvas' → LVPipeline.run()
 * Does NOT call ProtoPipeline or GenerationEngine internally.
 *
 *   1. Build ProductDocumentSet deterministically (no LLM)
 *   2. Single streaming coder LLM call (build slot)
 *   3. Parse <<<FILE:>>>/<<<END>>> markers + merge with neutral scaffold
 *   4. CompletenessGate evaluation
 *   5. Pass 2 if coverageRatioMust < 0.8 (up to 2 iterations)
 *   6. Compile via /api/preview/:buildId/compile
 *   7. Return GenerationResult
 */

import { llmFetchStream, llmFetch } from './LLMProxy';
import { previewController } from './PreviewController';
import {
  buildProductDocumentSet,
  resolveProductDocumentSet,
  buildCoderContractBrief,
  type ProductDocumentSetInput,
  type FeatureChecklistItem,
} from './ProductDocumentSet';
import { evaluateCompletenessGate } from './CompletenessGate';
import {
  buildDeterministicGaps,
  parseGapArray,
  isPass2SafeTargetFile,
  materializeUploadedAssetFusion,
  type Gap,
  type Pass2Telemetry,
  type StepId,
  type StepStatus,
  type StepEvent,
} from './ProtoPipeline';
import {
  buildDesignFusionPromptBlock,
  buildUploadedAssetFusionEntries,
} from './DesignFusionService';
import {
  appendPreviewSessionToUrl,
  getPreviewSessionToken,
} from './PreviewSessionService';
import { metricsService } from './MetricsService';
import { Orchestrator } from './Orchestrator';
import type {
  FileOperation,
  GenerationResult,
  ProjectGraph,
  ProductManifest,
  ChangePackage,
  GenerationRunTelemetry,
} from '../shared/projectModel';
import type { PipelineRunConfig } from './GenerationEngine';
import type { AgentExecutionRoute } from './buildAgentRouting';
import type { SkeletonId } from './SkeletonRegistry';

// ── Re-export public ProtoPipeline helpers usable by tests ────────────────────

export type { Gap, Pass2Telemetry };
export { buildDeterministicGaps, parseGapArray, isPass2SafeTargetFile };

// ── Public types ──────────────────────────────────────────────────────────────

export interface LVPipelineEligibilityInput {
  generationPath?: string | null;
  /** Retained for caller compatibility. NOT used to gate routing. */
  existingCodeCount?: number;
}

// ── Internal constants ────────────────────────────────────────────────────────

// Used only in ProductDocumentSet + telemetry labelling — NOT passed to the compile endpoint.
// The compile call intentionally omits skeletonId (legacy/no-skeleton mode) so the backend
// does not wipe src/, install landing-page files, or force-restore skeleton index.css.
const LV_NEUTRAL_SKELETON_ID: SkeletonId = 'landing-page';

/** Minimal scaffold emitted when the coder doesn't produce these files. */
const NEUTRAL_SCAFFOLD: Record<string, string> = {
  'App.tsx': `import React from 'react';
import './index.css';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Generated content */}
    </div>
  );
}
`,
  'main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
  'index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --card: 0 0% 100%;
  --border: 214.3 31.8% 91.4%;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
`,
};

// ── Private helpers ───────────────────────────────────────────────────────────

function lvIsAbort(err: unknown): boolean {
  return (
    (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) ||
    (err instanceof DOMException && err.name === 'AbortError')
  );
}

function normaliseLvDeltaPath(p: string): string {
  return p
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/^src\/+/, '')
    .replace(/^preview-workspace\/(?:src\/)?/, '')
    .replace(/\\/g, '/');
}

// ── Parse FILE/END markers ────────────────────────────────────────────────────

function parseLvFileMarkers(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<<<\s*FILE\s*:\s*([^>\n]+?)\s*>>>([\s\S]*?)<<<\s*END\s*>>>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const path = normaliseLvDeltaPath(match[1].trim());
    if (!path) continue;
    let body = match[2];
    body = body.replace(/^\s*```[\w-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    body = body.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '\n');
    out[path] = body;
  }
  return out;
}

// ── Coder LLM call ────────────────────────────────────────────────────────────

function buildLvCoderSystemPrompt(
  prompt: string,
  featureChecklist: FeatureChecklistItem[],
  designFusionBlock?: string,
): string {
  const mustFeatures = featureChecklist.filter(f => f.priority === 'must');
  const shouldFeatures = featureChecklist.filter(f => f.priority === 'should');

  const mustBlock = mustFeatures.length > 0
    ? mustFeatures
      .map(f => `- ${f.briefPoint}${f.targetFiles.length ? ` (${f.targetFiles.join(', ')})` : ''}`)
      .join('\n')
    : '- Implement all features from the brief';

  const shouldBlock = shouldFeatures.length > 0
    ? shouldFeatures.map(f => `- ${f.briefPoint}`).join('\n')
    : '';

  return [
    'You are an expert React + TypeScript developer. Generate a complete working application.',
    '',
    'TECH STACK:',
    '- React 18 + TypeScript + Vite',
    '- Tailwind CSS with semantic tokens only (bg-background, text-foreground, bg-primary, bg-card, bg-muted, text-muted-foreground, border)',
    '- lucide-react for icons',
    '- shadcn/ui primitives via @/components/ui/* (Button, Card, Input, Dialog, Alert, AlertDialog, Tabs, etc.)',
    '',
    'MUST IMPLEMENT (all required):',
    mustBlock,
    ...(shouldBlock ? ['', 'SHOULD IMPLEMENT:', shouldBlock] : []),
    '',
    // WI-7: Design Fusion Contract — injected when available
    ...(designFusionBlock ? [designFusionBlock, ''] : []),
    'OUTPUT FORMAT — CRITICAL:',
    'Emit EACH file using these exact plain-text markers:',
    '',
    '<<<FILE: App.tsx>>>',
    '// full file content here',
    '<<<END>>>',
    '',
    '<<<FILE: components/MyComponent.tsx>>>',
    '// full file content here',
    '<<<END>>>',
    '',
    'RULES:',
    '- Always emit App.tsx as the entry point',
    '- Always emit index.css with @tailwind directives',
    '- Use ONLY semantic Tailwind tokens: bg-background, text-foreground, bg-primary, etc.',
    '- Do NOT use hardcoded hex colours or bg-blue-500 / text-gray-700 etc.',
    '- Use shadcn primitives from @/components/ui/* — NEVER from @radix-ui/react-* directly.',
    '- Imports: from lucide-react, react, @/components/ui/*. No skeleton dependencies.',
    '- Complete working code — no TODOs, no placeholder comments',
    '- TypeScript with proper type annotations',
  ].join('\n');
}

interface LvCoderCallResult {
  raw: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
}

async function lvStreamCoder(
  route: AgentExecutionRoute,
  prompt: string,
  featureChecklist: FeatureChecklistItem[],
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
  designFusionBlock?: string,
  coderContractBrief?: string,
): Promise<LvCoderCallResult> {
  const startMs = Date.now();
  const system = buildLvCoderSystemPrompt(prompt, featureChecklist, designFusionBlock)
    + (coderContractBrief ? `\n\n${coderContractBrief}` : '');
  const provider = (route as { provider?: string }).provider || 'openrouter';
  const endpoint = Orchestrator.getEndpoint(provider);
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${route.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
  };
  const bodyStr = JSON.stringify({
    model: route.modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: `Build this application:\n\n${prompt}` },
    ],
    stream: true,
    temperature: 0.4,
    max_tokens: 35_000,
  });

  let raw = '';
  let promptTokens = 0;
  let completionTokens = 0;

  const resp = await llmFetchStream(endpoint, headers, bodyStr, signal);
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('[LVPipeline] coder: no response body reader');

  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const choice = parsed?.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta?.content ?? '';
        if (typeof delta === 'string' && delta) {
          raw += delta;
          onChunk(delta);
        }
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
          completionTokens = parsed.usage.completion_tokens ?? completionTokens;
        }
      } catch { /* skip malformed SSE line */ }
    }
  }

  return { raw, durationMs: Date.now() - startMs, promptTokens, completionTokens };
}

async function lvCallOnce(
  route: AgentExecutionRoute,
  system: string,
  user: string,
  maxTokens = 4_000,
  signal?: AbortSignal,
): Promise<string> {
  const provider = (route as { provider?: string }).provider || 'openrouter';
  const endpoint = Orchestrator.getEndpoint(provider);
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${route.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
  };
  const bodyStr = JSON.stringify({
    model: route.modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    stream: false,
    temperature: 0.2,
    max_tokens: maxTokens,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const resp = await llmFetch(endpoint, headers, bodyStr);
    const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// ── Pass 2 ────────────────────────────────────────────────────────────────────

interface LvPass2Result {
  mergedFiles: Record<string, string>;
  touchedFiles: string[];
  rejectedFiles: string[];
  telemetry: Pass2Telemetry;
}

async function runLvPass2(
  prompt: string,
  currentFiles: Record<string, string>,
  featureChecklist: FeatureChecklistItem[],
  qaRoute: AgentExecutionRoute | undefined,
  fixRoute: AgentExecutionRoute | undefined,
  log: (msg: string) => void,
  signal?: AbortSignal,
): Promise<LvPass2Result> {
  const initGate = evaluateCompletenessGate({ featureChecklist, generatedFiles: currentFiles });
  const coverageBefore = initGate.coverage.coverageRatioMust;

  const telemetry: Pass2Telemetry = {
    pass2_ran: false,
    pass2_available: false,
    pass2_iterations: 0,
    critic_gap_count: 0,
    critic_schema: 'Gap[]',
    critic_parse_status: 'unavailable',
    implementer_touched_files: [],
    implementer_rejected_files: [],
    coverage_before: coverageBefore,
    coverage_after: coverageBefore,
    pass2_build_ok: true,
    outcome: 'pass2_unavailable',
    factoryGatePassed: initGate.ok,
  };

  if (initGate.ok) {
    telemetry.outcome = 'done';
    return { mergedFiles: currentFiles, touchedFiles: [], rejectedFiles: [], telemetry };
  }

  if (!fixRoute?.apiKey || !fixRoute?.modelId) {
    log('[LVPipeline] pass2: fix route not configured — skipping');
    telemetry.pass2_unavailable_reason = 'fix_route_not_configured';
    telemetry.outcome = 'route_unresolved';
    return { mergedFiles: currentFiles, touchedFiles: [], rejectedFiles: [], telemetry };
  }

  telemetry.pass2_available = true;

  let mergedFiles = { ...currentFiles };
  const allTouched: string[] = [];
  const allRejected: string[] = [];
  const PASS2_MAX_ITERATIONS = 2;

  for (let iter = 0; iter < PASS2_MAX_ITERATIONS; iter++) {
    if (signal?.aborted) break;

    const gate = evaluateCompletenessGate({ featureChecklist, generatedFiles: mergedFiles });
    if (gate.ok) break;

    telemetry.pass2_ran = true;
    telemetry.pass2_iterations = iter + 1;

    const uncoveredMust = gate.coverage.uncoveredMust;
    log(`[LVPipeline] pass2 iter ${iter + 1}: ${uncoveredMust.length} uncovered must features (coverage=${(gate.coverage.coverageRatioMust * 100).toFixed(0)}%)`);

    // Deterministic gaps — always available
    let gaps: Gap[] = buildDeterministicGaps(featureChecklist, uncoveredMust);
    telemetry.critic_gap_count = gaps.length;
    telemetry.critic_parse_status = 'unavailable';

    // Optionally enrich with LLM critic
    if (qaRoute?.apiKey && qaRoute?.modelId) {
      const criticSystem = [
        'You are the Pass 2 critic. Identify gaps between the brief and the generated code.',
        'Return ONLY a JSON array of Gap objects:',
        '[{"id":"gap-001","briefPoint":"...","status":"missing","evidence":"...","targetFile":"App.tsx","requiredAction":"...","priority":"must","source":"critic"}]',
        'GapStatus: "missing"|"partial"|"fake"|"broken"|"visual"',
        'GapPriority: "must"|"should"|"nice"',
        'GapSource: "completeness"|"build"|"critic"|"visual"',
        'Return ONLY the JSON array — no markdown, no explanation.',
      ].join('\n');

      const filesSample = Object.entries(mergedFiles)
        .slice(0, 6)
        .map(([p, c]) => `${p}:\n${c.slice(0, 500)}`)
        .join('\n\n---\n\n');

      const criticUser = [
        `Brief: ${prompt}`,
        '',
        `Uncovered must-have features: ${uncoveredMust.join(', ')}`,
        '',
        `Current files (sample):\n${filesSample}`,
      ].join('\n');

      try {
        const raw = await lvCallOnce(qaRoute, criticSystem, criticUser, 4_000, signal);
        const result = parseGapArray(raw);
        if (result.gaps && result.gaps.length > 0) {
          gaps = result.gaps;
          telemetry.critic_parse_status = 'ok';
        } else {
          telemetry.critic_parse_status = 'parse_error';
          log(`[LVPipeline] pass2 critic parse failed (${result.parseError ?? 'empty'}) — using deterministic gaps`);
        }
      } catch (err) {
        if (lvIsAbort(err)) throw err;
        log(`[LVPipeline] pass2 critic error: ${(err as Error).message} — using deterministic gaps`);
        telemetry.critic_parse_status = 'parse_error';
      }
    }

    // Scope guard: only allow safe gap target files
    const allowedNormalized = new Set<string>(
      gaps
        .map(g => normaliseLvDeltaPath(g.targetFile))
        .filter(Boolean)
        .filter(isPass2SafeTargetFile),
    );
    for (const key of Object.keys(mergedFiles)) {
      const norm = normaliseLvDeltaPath(key);
      if (gaps.some(g => normaliseLvDeltaPath(g.targetFile) === norm)) {
        allowedNormalized.add(norm);
      }
    }

    const gapSummary = gaps
      .map(g =>
        `${g.id} [${g.priority}] "${g.briefPoint}"\n  status=${g.status} targetFile=${g.targetFile}\n  action: ${g.requiredAction}`,
      )
      .join('\n\n');

    const allowedList = [...allowedNormalized].sort();
    const implSystem = [
      'You are the Pass 2 implementer. Patch the code to address the identified gaps.',
      'Emit ONLY changed files using this exact format:',
      '<<<FILE: App.tsx>>>',
      '// full file content',
      '<<<END>>>',
      '',
      'SCOPE RULES:',
      '- Only emit files listed in ALLOWED FILES below.',
      '- Do NOT modify: package.json, tsconfig.json, vite.config.*, tailwind.config.*, .env',
      '- Preserve all working code — only patch what the gaps require.',
      `- ALLOWED FILES:\n${allowedList.map(p => `  ${p}`).join('\n')}`,
    ].join('\n');

    const relevantFiles = Object.entries(mergedFiles)
      .filter(([path]) => allowedNormalized.has(normaliseLvDeltaPath(path)))
      .slice(0, 10)
      .map(([path, content]) => `<<<FILE: ${path}>>>\n${content.slice(0, 1200)}\n<<<END>>>`)
      .join('\n\n');

    const implUser = [
      `Brief: ${prompt}`,
      '',
      'Gaps to implement:',
      gapSummary,
      '',
      'Relevant current files:',
      relevantFiles || '(none in allowed set)',
    ].join('\n');

    let implBody = '';
    try {
      const provider = (fixRoute as { provider?: string }).provider || 'openrouter';
      const endpoint = Orchestrator.getEndpoint(provider);
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${fixRoute.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      };
      const implReqBody = JSON.stringify({
        model: fixRoute.modelId,
        messages: [
          { role: 'system', content: implSystem },
          { role: 'user',   content: implUser },
        ],
        stream: true,
        temperature: 0.2,
        max_tokens: 16_000,
      });

      const ctrl = new AbortController();
      signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
      const implResp = await llmFetchStream(endpoint, headers, implReqBody, ctrl.signal);
      const implReader = implResp.body?.getReader();
      if (implReader) {
        const dec = new TextDecoder();
        let implBuf = '';
        for (;;) {
          const { done, value } = await implReader.read();
          if (done) break;
          implBuf += dec.decode(value, { stream: true });
          const lines = implBuf.split('\n');
          implBuf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const pl = line.slice(6).trim();
            if (!pl || pl === '[DONE]') continue;
            try {
              const p = JSON.parse(pl) as { choices?: Array<{ delta?: { content?: string } }> };
              const d = p?.choices?.[0]?.delta?.content ?? '';
              if (typeof d === 'string') implBody += d;
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      if (lvIsAbort(err)) throw err;
      log(`[LVPipeline] pass2 implementer failed: ${(err as Error).message}`);
      break;
    }

    const patches = parseLvFileMarkers(implBody);
    if (Object.keys(patches).length === 0) {
      log('[LVPipeline] pass2 implementer produced no FILE/END blocks');
      break;
    }

    const iterTouched: string[] = [];
    const iterRejected: string[] = [];
    for (const [patchPath, patchContent] of Object.entries(patches)) {
      const normalized = normaliseLvDeltaPath(patchPath);
      if (!isPass2SafeTargetFile(normalized)) {
        iterRejected.push(normalized);
        log(`[LVPipeline] pass2 implementer: rejected unsafe path: ${normalized}`);
        continue;
      }
      mergedFiles[normalized] = patchContent;
      iterTouched.push(normalized);
    }

    allTouched.push(...iterTouched);
    allRejected.push(...iterRejected);
    log(`[LVPipeline] pass2 iter ${iter + 1}: patched ${iterTouched.length} file(s)`);
  }

  const finalGate = evaluateCompletenessGate({ featureChecklist, generatedFiles: mergedFiles });
  telemetry.implementer_touched_files = allTouched;
  telemetry.implementer_rejected_files = allRejected;
  telemetry.coverage_after = finalGate.coverage.coverageRatioMust;
  telemetry.factoryGatePassed = finalGate.ok;
  telemetry.outcome = finalGate.ok ? 'done' : 'partial';

  return { mergedFiles, touchedFiles: allTouched, rejectedFiles: allRejected, telemetry };
}

// ── Compile ───────────────────────────────────────────────────────────────────

interface LvCompileResult {
  compileMs: number;
  previewMounted: boolean;
}

async function lvCompile(
  buildId: string,
  files: Record<string, string>,
  signal?: AbortSignal,
): Promise<LvCompileResult> {
  previewController.notifyCompiling(buildId, 'unknown');

  const sessionId = getPreviewSessionToken();
  const compileStartedAt = Date.now();
  const resp = await fetch(`/api/preview/${encodeURIComponent(buildId)}/compile`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Preview-Session': sessionId },
    // No skeletonId — legacy/no-skeleton mode prevents skeleton file install and CSS force-restore.
    body:    JSON.stringify({ files, sessionId }),
    signal,
  });
  const text = await resp.text();
  let json: { success?: boolean; error?: string } = {};
  try { json = JSON.parse(text); } catch { /* keep raw */ }

  if (!resp.ok || json.success === false) {
    const errMsg = json.error || text || `compile failed (${resp.status})`;
    previewController.notifyFailed(errMsg, buildId);
    throw new Error(errMsg);
  }
  const compileMs = Date.now() - compileStartedAt;

  // Reload iframe so MountReporter fires
  const iframe =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLIFrameElement>('iframe[data-testid="preview-iframe"]')
      : null;
  const nextPreviewUrl = appendPreviewSessionToUrl(`/preview/${buildId}`);
  let previewMounted = false;

  if (iframe) {
    const absoluteNextUrl = new URL(nextPreviewUrl, window.location.origin).toString();
    if (iframe.src === absoluteNextUrl) {
      iframe.src = 'about:blank';
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    iframe.src = nextPreviewUrl;

    previewMounted = await new Promise<boolean>((resolve) => {
      const timeoutMs = 45_000;
      const expectedOrigin = new URL(nextPreviewUrl, window.location.origin).origin;
      let settled = false;
      const settle = (result: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        clearTimeout(timer);
        resolve(result);
      };
      const onMsg = (e: MessageEvent) => {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.origin !== expectedOrigin) return;
        if (e.data.type === 'preview-mounted' && e.data.buildId === buildId) settle(true);
        if (e.data.type === 'iframe-error') settle(false);
      };
      window.addEventListener('message', onMsg);
      const timer = setTimeout(() => settle(false), timeoutMs);
      signal?.addEventListener('abort', () => settle(false), { once: true });
    });
  }

  previewController.notifyReady(buildId, 'proto_pipeline_complete', 'unknown');
  return { compileMs, previewMounted };
}

// ── Private result builders ───────────────────────────────────────────────────

function lvEmptyManifest(intent: string): ProductManifest {
  const now = new Date().toISOString();
  return {
    version: 1 as const,
    id: crypto.randomUUID(),
    name: intent.slice(0, 60) || 'app',
    description: intent,
    intent,
    targetPlatforms: ['web'],
    techStack: {
      framework: 'react',
      language: 'typescript',
      styling: 'tailwind',
      bundler: 'vite',
      backend: null,
      stateManagement: null,
    },
    createdAt: now,
    updatedAt: now,
  } as ProductManifest;
}

function lvInferRole(path: string): ProjectGraph['files'][number]['role'] {
  if (/\/App\.tsx$/i.test(path)) return 'entry';
  if (/\/(?:pages|screens)\//.test(path)) return 'page';
  if (/\/components\//.test(path)) return 'component';
  if (/\/hooks\//.test(path)) return 'hook';
  if (/\/(?:services|lib|utils|data|context)\//.test(path)) return 'service';
  if (/\.css$/.test(path)) return 'style';
  return 'component';
}

function lvSynthesiseGraph(
  buildId: string,
  intent: string,
  projectId: string | undefined,
  files: Array<[string, string]>,
  createdAt: string,
  updatedAt: string,
  appName: string,
): ProjectGraph {
  const fileBlueprints = files.map(([path, content], i) => {
    const normalizedPath = path.startsWith('src/') ? path : `src/${path}`;
    return {
      id: normalizedPath,
      path: normalizedPath,
      content,
      kind: 'component' as const,
      role: lvInferRole(normalizedPath),
      language: normalizedPath.endsWith('.css') ? 'css' as const
        : normalizedPath.endsWith('.ts') ? 'ts' as const
        : 'tsx' as const,
      exports: [],
      dependencies: [],
      hash: `${buildId}:${i}`,
      generatedAt: updatedAt,
      generatedBy: 'ai' as const,
      isProtected: false,
      userZones: [],
    };
  }) as unknown as ProjectGraph['files'];

  return {
    version: 1 as const,
    id: crypto.randomUUID(),
    projectId: projectId ?? '',
    revisionId: buildId,
    manifest: {
      ...lvEmptyManifest(intent),
      name: appName || intent.slice(0, 60) || 'app',
      description: intent,
      isMultiPage: false,
    } as ProductManifest,
    files: fileBlueprints,
    routes: [],
    features: [],
    externalDependencies: [],
    entryFileId: fileBlueprints.find(f => /\/App\.tsx$/i.test(f.path))?.id ?? '',
    createdAt,
    updatedAt,
  };
}

function lvEmptyChangePackage(graph: ProjectGraph, ops: FileOperation[]): ChangePackage {
  return {
    plan: [],
    graph,
    fileOperations: ops,
    routeManifest: { routes: [], isMultiPage: false },
    dependencies: [],
    previewMeta: { entryFile: 'src/App.tsx', capabilities: [] },
    guardResults: {
      integration: {
        isHealthy: true, totalIssues: 0, fixedCount: 0,
        reportedCount: 0, unresolvedIssues: [], durationMs: 0,
      },
      integrity: {
        passed: true, errorCount: 0, warnCount: 0,
        errors: [], warnings: [], durationMs: 0,
      },
      runtime: {
        passed: true, failingFiles: [], reasons: [], durationMs: 0,
      },
    },
    warnings: [],
    repairHints: [],
  };
}

function lvMakeFailedResult(input: {
  intent: string;
  modelId: string;
  message: string;
  startMs: number;
  startedAt: string;
  runTelemetry?: GenerationRunTelemetry;
}): GenerationResult {
  const failedId = crypto.randomUUID();
  const now = new Date().toISOString();
  const graph: ProjectGraph = {
    version: 1 as const,
    id: '',
    projectId: '',
    revisionId: '',
    manifest: lvEmptyManifest(input.intent),
    files: [],
    routes: [],
    features: [],
    externalDependencies: [],
    entryFileId: '',
    createdAt: input.startedAt,
    updatedAt: now,
  };
  metricsService.logGeneration({
    generation_id:   failedId,
    intent:          input.intent.slice(0, 200),
    model_id:        input.modelId || 'unknown',
    duration_ms:     Date.now() - input.startMs,
    file_count:      0,
    parse_success:   false,
    fallback_used:   false,
    compile_success: false,
    autofix_needed:  false,
    autofix_success: false,
    error_message:   input.message.slice(0, 500),
  });
  return {
    id:            failedId,
    status:        'failed',
    graph,
    operations:    [],
    message:       input.message,
    phase:         'idle',
    usedModel:     input.modelId || 'unknown',
    selfCorrected: false,
    iterations:    1,
    durationMs:    Date.now() - input.startMs,
    createdAt:     now,
    error:         input.message,
    changePackage: lvEmptyChangePackage(graph, []),
    runTelemetry:  input.runTelemetry,
  } as unknown as GenerationResult;
}

// ── Routing predicate ─────────────────────────────────────────────────────────

export function isBlankCanvasFastPathEligible(input: LVPipelineEligibilityInput): boolean {
  return input.generationPath === 'blank_canvas';
}

// ── Main pipeline class ───────────────────────────────────────────────────────

export class LVPipeline {
  static isBlankCanvasFastPathEligible = isBlankCanvasFastPathEligible;

  static async run(config: PipelineRunConfig): Promise<GenerationResult> {
    const startMs = Date.now();
    const startedAt = new Date().toISOString();

    const log = (msg: string) => { try { config.onLog(msg); } catch { /* ignore */ } };
    const emitPhase = (p: string, progress: number) => {
      try { config.onPhase({ phase: p as import('../shared/projectModel').AgentPhase, progress }); } catch { /* ignore */ }
    };
    const emitStep = (s: StepId, status: StepStatus, label: string) => {
      try {
        config.onStepTrack?.({ step: s, status, label } satisfies Pick<StepEvent, 'step' | 'status' | 'label'>);
      } catch { /* ignore */ }
    };

    const buildId = config.revisionId
      || `rev_lv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    log('[LVPipeline] blank_canvas fast path started');
    emitPhase('think', 10);
    emitStep('product-docs', 'active', 'Building product docs...');

    // ── 1. Materialize ProductDocumentSet deterministically (no LLM) ─────────
    const pdsInput: ProductDocumentSetInput = {
      prompt:     config.intent,
      topicPrompt: config.intent, // raw user intent — stable topic identity for dedup
      skeletonId: LV_NEUTRAL_SKELETON_ID,
      generationPath: 'blank_canvas',
      projectId:  config.projectId,
      revisionId: buildId,
      architectPlan: {
        appName:  config.intent.slice(0, 40) || 'My App',
        summary:  config.intent.slice(0, 120),
        fileTree: {
          'App.tsx':   'entry point',
          'index.css': 'global styles',
        },
      },
    };

    let pdsBuilt = false;
    let featureChecklist: FeatureChecklistItem[] = [];
    let pdsResult: ReturnType<typeof resolveProductDocumentSet> | null = null;
    try {
      pdsResult = resolveProductDocumentSet(pdsInput);
      featureChecklist = pdsResult.productDocs.featureChecklist ?? [];
      pdsBuilt = true;
      log(`[LVPipeline] PDS ${pdsResult.reused ? 'reused' : 'materialized'} for topic "${pdsResult.topicMarker.label}": ${featureChecklist.length} checklist item(s), ${pdsResult.materializedFiles.length} doc file(s)`);
    } catch (err) {
      log(`[LVPipeline] PDS build failed (${(err as Error).message}) — continuing without checklist`);
    }
    emitStep('product-docs', pdsBuilt ? 'done' : 'error', pdsBuilt ? `${featureChecklist.length} features` : 'PDS unavailable');
    emitStep('coder', 'active', 'Generating application...');

    // Emit step plan to UI
    try {
      config.onPlan(['Generate', 'Quality check', 'Compile'], config.intent.slice(0, 40) || 'My App');
    } catch { /* ignore */ }

    // ── WI-7: Materialize uploaded assets + build Design Fusion block ─────────
    const lvUploadedAssetFusion = materializeUploadedAssetFusion(
      (config.attachments ?? []).map(a => ({
        type: (a.type as 'image' | 'text' | 'code' | 'pdf'),
        name: a.name,
        data: a.data,
        mimeType: a.mimeType,
        textContent: a.textContent,
      })),
    );
    const lvFusionEntries = buildUploadedAssetFusionEntries(lvUploadedAssetFusion.entries);
    const lvDesignFusionBlock = buildDesignFusionPromptBlock({
      uploadedAssets: lvFusionEntries,
      premiumComponents: [], // blank_canvas does not use premium components
    });
    if (lvUploadedAssetFusion.entries.length > 0) {
      log(`[LVPipeline] design fusion: ${lvUploadedAssetFusion.entries.length} uploaded asset(s) materialized`);
    }

    // ── 2. Single streaming coder LLM call ───────────────────────────────────
    emitPhase('code', 40);

    const buildRoute = config.buildRoute;
    if (!buildRoute?.modelId || !buildRoute?.apiKey) {
      return lvMakeFailedResult({
        intent:    config.intent,
        modelId:   config.modelId,
        message:   '[LVPipeline] build agent not configured — set model in Settings',
        startMs,
        startedAt,
      });
    }

    let coderResult: LvCoderCallResult;
    try {
      coderResult = await lvStreamCoder(
        buildRoute,
        config.intent,
        featureChecklist,
        (delta) => { try { config.onStream(delta); } catch { /* ignore */ } },
        config.signal,
        lvDesignFusionBlock,
        pdsResult ? buildCoderContractBrief(pdsResult.productDocs) : undefined,
      );
    } catch (err) {
      if (lvIsAbort(err)) {
        return lvMakeFailedResult({
          intent: config.intent, modelId: buildRoute.modelId,
          message: 'Generation cancelled', startMs, startedAt,
        });
      }
      return lvMakeFailedResult({
        intent: config.intent, modelId: buildRoute.modelId,
        message: `[LVPipeline] coder failed: ${(err as Error).message}`, startMs, startedAt,
      });
    }

    emitStep('coder', 'done', `Generated ${Object.keys(parseLvFileMarkers(coderResult.raw)).length} file(s)`);
    log(`[LVPipeline] coder done in ${coderResult.durationMs}ms`);
    emitPhase('verify', 70);

    // ── 3. Parse FILE/END markers + merge with neutral scaffold ──────────────
    emitStep('apply', 'active', 'Applying files...');

    const parsed = parseLvFileMarkers(coderResult.raw);
    const parsedCount = Object.keys(parsed).length;
    log(`[LVPipeline] parsed ${parsedCount} file(s) from coder output`);

    // Overlay AI output on neutral scaffold; normalise all keys to strip src/
    // Also overlay materialized uploaded asset modules so generated imports resolve.
    const merged: Record<string, string> = {
      ...NEUTRAL_SCAFFOLD,
      ...lvUploadedAssetFusion.files,
      ...parsed,
    };
    const normalisedFiles: Record<string, string> = {};
    for (const [key, value] of Object.entries(merged)) {
      const normed = normaliseLvDeltaPath(key);
      if (normed) normalisedFiles[normed] = value;
    }

    // Initial onFiles delivery
    const initialOps: FileOperation[] = Object.entries(normalisedFiles).map(([name, content]) => ({
      op: 'upsert' as const,
      name: `src/${name}`,
      content,
    }));
    if (initialOps.length > 0) {
      try { config.onFiles(initialOps); } catch (err) {
        return lvMakeFailedResult({
          intent: config.intent, modelId: buildRoute.modelId,
          message: `[LVPipeline] onFiles failed: ${(err as Error).message}`, startMs, startedAt,
        });
      }
    }
    emitStep('apply', 'done', `${initialOps.length} file(s) applied`);

    // ── 4 & 5. CompletenessGate + Pass 2 ─────────────────────────────────────
    let pass2Telemetry: Pass2Telemetry | undefined;
    let finalFiles = { ...normalisedFiles };

    if (featureChecklist.length > 0) {
      const cgResult = evaluateCompletenessGate({
        featureChecklist,
        generatedFiles: normalisedFiles,
      });
      log(`[LVPipeline] CompletenessGate: coverage=${(cgResult.coverage.coverageRatioMust * 100).toFixed(0)}% ok=${cgResult.ok}`);

      if (!cgResult.ok) {
        log(`[LVPipeline] running Pass 2 (${cgResult.blockingReasons.join('; ')})`);
        emitPhase('verify', 80);

        const p2 = await runLvPass2(
          config.intent,
          normalisedFiles,
          featureChecklist,
          config.qaRoute,
          config.fixRoute,
          log,
          config.signal,
        );
        finalFiles = p2.mergedFiles;
        pass2Telemetry = p2.telemetry;

        if (p2.touchedFiles.length > 0) {
          const patchOps: FileOperation[] = p2.touchedFiles
            .map(name => ({
              op: 'upsert' as const,
              name: `src/${name}`,
              content: finalFiles[name] ?? '',
            }))
            .filter(op => op.content);
          if (patchOps.length > 0) {
            try { config.onFiles(patchOps); } catch { /* best effort */ }
          }
        }
      } else {
        pass2Telemetry = {
          pass2_ran: false,
          pass2_available: true,
          pass2_iterations: 0,
          critic_gap_count: 0,
          critic_schema: 'Gap[]',
          critic_parse_status: 'unavailable',
          implementer_touched_files: [],
          implementer_rejected_files: [],
          coverage_before: cgResult.coverage.coverageRatioMust,
          coverage_after:  cgResult.coverage.coverageRatioMust,
          pass2_build_ok:  true,
          outcome:         'done',
          factoryGatePassed: true,
        };
      }
    }

    emitPhase('verify', 90);
    emitStep('build', 'active', 'Compiling...');

    // ── 6. Compile ────────────────────────────────────────────────────────────
    const compileFiles: Record<string, string> = {};
    for (const [key, value] of Object.entries(finalFiles)) {
      compileFiles[key.startsWith('src/') ? key : `src/${key}`] = value;
    }

    let compileMs = 0;
    let previewMounted = false;
    let compileFailed = false;
    let compileError = '';

    try {
      const cr = await lvCompile(buildId, compileFiles, config.signal);
      compileMs = cr.compileMs;
      previewMounted = cr.previewMounted;
      log(`[LVPipeline] compile ok in ${compileMs}ms, previewMounted=${previewMounted}`);
    } catch (err) {
      if (lvIsAbort(err)) {
        return lvMakeFailedResult({
          intent: config.intent, modelId: buildRoute.modelId,
          message: 'Generation cancelled', startMs, startedAt,
        });
      }
      compileFailed = true;
      compileError = (err as Error).message;
      log(`[LVPipeline] compile failed: ${compileError}`);
    }

    emitStep('build', compileFailed ? 'error' : 'done', compileFailed ? 'Build failed' : 'Compiled');
    emitStep('preview', 'done', 'Ready');
    emitPhase('idle', 100);

    // ── 7. Build GenerationResult ─────────────────────────────────────────────
    const finished = new Date().toISOString();
    const filesArray = Object.entries(finalFiles);
    const appName = config.intent.slice(0, 40) || 'My App';

    // onPlanReady — synthetic plan card
    if (config.onPlanReady) {
      try {
        config.onPlanReady({
          plan: { appName, summary: config.intent.slice(0, 120) } as object,
          blueprintText: config.intent.slice(0, 120),
          appName,
          theme: 'default',
          pages: ['Home'],
        });
      } catch { /* ignore */ }
    }

    const runTelemetry: GenerationRunTelemetry = {
      brief:        config.intent,
      appName,
      planSummary:  `blank_canvas: ${config.intent.slice(0, 80)}`,
      skeletonId:   LV_NEUTRAL_SKELETON_ID,
      skeletonLabel: 'Blank Canvas',
      skeletonFiles: [],
      deltaFiles:   Object.keys(finalFiles),
      designIntent: ['blank_canvas'],
      ...(pdsBuilt && pdsResult ? {
        productDocs: {
          built: pdsResult.telemetry.built,
          saved: pdsResult.telemetry.saved,
          id: pdsResult.productDocs.id,
          status: pdsResult.productDocs.status,
          generationPath: 'blank_canvas' as const,
          persistenceTarget: pdsResult.telemetry.persistenceTarget,
          featureChecklistItemCount: pdsResult.telemetry.featureChecklistItemCount,
          featureChecklistMustCount: pdsResult.telemetry.featureChecklistMustCount,
          markdownBundleFiles: pdsResult.telemetry.markdownBundleFiles,
        },
      } : {}),
      steps: [
        {
          id: 'coder' as const,
          label: 'Generated application',
          status: 'done' as const,
          durationMs: coderResult.durationMs,
          llm: {
            model: buildRoute.modelId,
            prompt_tokens: coderResult.promptTokens,
            completion_tokens: coderResult.completionTokens,
            total_tokens: coderResult.promptTokens + coderResult.completionTokens,
          },
        },
        {
          id: 'build' as const,
          label: compileFailed ? 'Build failed' : 'Compiled',
          status: compileFailed ? ('error' as const) : ('done' as const),
          durationMs: compileMs,
          ...(pass2Telemetry ? {
            output: { pass2_telemetry: pass2Telemetry } as unknown as Record<string, unknown>,
          } : {}),
        },
      ],
      compileCount: compileFailed ? 0 : 1,
      finalPreviewMounted: previewMounted,
      // Existing-project safety telemetry
      blankCanvasExistingProjectMode: Object.keys(config.files).length > 0 ? 'overwrite' : 'fresh',
      existingFileCount: Object.keys(config.files).length,
      overwriteExplicit: true,
    };

    const graph = lvSynthesiseGraph(
      buildId, config.intent, config.projectId,
      filesArray, startedAt, finished, appName,
    );

    const finalOps: FileOperation[] = Object.entries(finalFiles).map(([name, content]) => ({
      op: 'upsert' as const,
      name: name.startsWith('src/') ? name : `src/${name}`,
      content,
    }));

    // Deliver PDS doc files (docs/architect/...) — no src/ prefix, separate from src ops
    if (pdsBuilt && pdsResult) {
      const pdsOps: FileOperation[] = Object.entries(pdsResult.files).map(([name, content]) => ({
        op: 'upsert' as const,
        name,
        content,
      }));
      if (pdsOps.length > 0) {
        try { config.onFiles(pdsOps); } catch { /* best effort */ }
        finalOps.push(...pdsOps);
      }
    }

    const changePackage = lvEmptyChangePackage(graph, finalOps);
    const totalMs = Date.now() - startMs;

    log(`[LVPipeline] done in ${totalMs}ms — ${filesArray.length} file(s), compile=${!compileFailed}`);

    metricsService.logGeneration({
      generation_id:   buildId,
      intent:          config.intent.slice(0, 200),
      model_id:        buildRoute.modelId,
      duration_ms:     totalMs,
      file_count:      filesArray.length,
      parse_success:   parsedCount > 0,
      fallback_used:   false,
      compile_success: !compileFailed,
      autofix_needed:  pass2Telemetry?.pass2_ran ?? false,
      autofix_success: pass2Telemetry?.factoryGatePassed ?? false,
      error_message:   compileFailed ? compileError.slice(0, 500) : null,
    });

    if (compileFailed) {
      return lvMakeFailedResult({
        intent: config.intent, modelId: buildRoute.modelId,
        message: `[LVPipeline] compile failed: ${compileError}`,
        startMs, startedAt, runTelemetry,
      });
    }

    return {
      id:            crypto.randomUUID(),
      status:        'completed',
      graph,
      operations:    finalOps,
      message:       `✅ ${appName}`,
      phase:         'idle',
      usedModel:     buildRoute.modelId,
      selfCorrected: pass2Telemetry?.pass2_ran ?? false,
      iterations:    1 + (pass2Telemetry?.pass2_iterations ?? 0),
      durationMs:    totalMs,
      createdAt:     finished,
      changePackage,
      runTelemetry,
    } as unknown as GenerationResult;
  }
}

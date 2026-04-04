/**
 * AIEngineService — Isolated background AI pipeline for Figma geometry validation.
 *
 * Design rules (anti-interference contract):
 *   1. Reads ONLY from ConfigService.getEngineApiKey() and ConfigService.getEngineModel().
 *      It NEVER touches apiKey / selectedModel from the main chat state.
 *   2. ENGINE_SYSTEM_PROMPT is a private constant — it never appears in chatHistory.
 *   3. No message history accumulates here — every validate() call is stateless.
 *   4. If engineApiKey is empty the service runs heuristic-only (zero network calls).
 *   5. A module-level lock (_busy) prevents concurrent validation runs.
 *
 * Pipeline:
 *   Step 1 — Synchronous heuristic filter (zero-size, huge VECTORs, duplicates).
 *   Step 2 — If engineApiKey configured: POST to OpenRouter with engineModelId,
 *             ask for geometry issues + a clean node list.
 *   Step 3 — Merge AI issues with heuristic issues, return ValidationResult.
 */

import type { FigmaVisualNode, ProjectTheme } from './FigmaService';
import { ConfigService } from './ConfigService';
import { llmFetch } from './LLMProxy';

// ── Public types ──────────────────────────────────────────────────────────────

export type EngineStatus =
  | 'idle'
  | 'validating'
  | 'done'
  | 'error'
  | 'skipped';

export type NodeIssueType =
  | 'oversized'
  | 'off-canvas'
  | 'duplicate-position'
  | 'noise'
  | 'zero-size';

export interface NodeIssue {
  nodeId:   string;
  nodeName: string;
  issue:    NodeIssueType;
  severity: 'high' | 'medium' | 'low';
  detail:   string;
}

export interface ValidationResult {
  ok:           boolean;
  timestamp:    number;
  /** 'heuristic-only' when no engineApiKey configured. */
  modelId:      string;
  nodeCount:    number;
  cleanCount:   number;
  issues:       NodeIssue[];
  /** Nodes that passed validation — use these for MirrorCanvas render. */
  cleanedNodes: FigmaVisualNode[];
  /** Short summary line produced by the AI (or heuristic engine). */
  summary:      string;
}

/**
 * A mapping from a Figma visual node to a known project component.
 * Produced by analyzeNodes() when a ComponentRegistry context is provided.
 */
export interface ComponentMapping {
  nodeId:        string;    // Figma node ID
  nodeName:      string;    // Human-readable node name
  componentName: string;    // Matched component, e.g. "Button"
  variant?:      string;    // Detected variant, e.g. "primary"
  confidence:    number;    // 0.0–1.0
}

/** Full result returned by analyzeNodes(). */
export interface AnalyzeResult {
  excludeIds:        string[];
  mainFrameId:       string | null;
  summary:           string;
  componentMappings: ComponentMapping[];
  layoutHints:       Array<{ nodeId: string; direction: 'row' | 'column' | 'grid' }>;
}

// ── Isolated system prompt ────────────────────────────────────────────────────
// This constant is NEVER injected into the main chat history.

const ENGINE_SYSTEM_PROMPT = `You are a Figma geometry validator for a design-to-code studio tool.
Analyze the provided FigmaVisualNode JSON array and return ONLY a valid JSON object.

Detect these issues:
1. NOISE — VECTOR or ELLIPSE nodes where width > 1500px or height > 1500px.
2. OFF-CANVAS — nodes where x < -500 or y < -500 (significantly off visible canvas).
3. DUPLICATE-POSITION — two or more non-FRAME nodes with identical x/y/w/h (flag the lower z-index one).
4. OVERSIZED — any single non-FRAME node whose area exceeds 80% of the bounding canvas area (likely a background blob — flag but keep).
5. ZERO-SIZE — nodes where w ≤ 0 or h ≤ 0.

Return ONLY this JSON (no markdown, no explanation, no code fences):
{
  "issues": [
    {
      "nodeId":   "<id>",
      "nodeName": "<name>",
      "issue":    "noise | off-canvas | duplicate-position | oversized | zero-size",
      "severity": "high | medium | low",
      "detail":   "<1-sentence explanation>"
    }
  ],
  "cleanNodeIds": ["<id1>", "<id2>", ...],
  "summary": "<short sentence: N nodes clean, M issues found>"
}

cleanNodeIds must list the IDs of nodes that PASS validation (should be rendered).
If all nodes are clean, return empty issues array and all node IDs in cleanNodeIds.
Return at most 15 issues. Be precise — only flag real problems.`;

// ── Pro-Audit system prompt (analyzeNodes — never in chatHistory) ─────────────

const ANALYZE_SYSTEM_PROMPT = `You are a Senior Figma-to-Code Architect (2026 standard) embedded in a design-to-code studio.
Your mission: analyse the FigmaVisualNode JSON and return ONLY valid JSON — no markdown, no code fences.

═══ NOISE DETECTION ═══════════════════════════════════════════════════
Flag these nodes for EXCLUSION (add their IDs to excludeIds):
1. OVERSIZED DECORATIVE — w > 2500 OR h > 2500, AND depth > 0 (keep Root Frame at depth 0).
2. NAMED NOISE       — name matches /Background|Blob|Noise|Decor|Mask|Overlay|Shadow/i at depth <= 2.
3. INVISIBLE NODES   — visible === false.
4. ZERO-SIZE NODES   — w <= 0 OR h <= 0.
5. PURE VECTOR BLOBS — type === "VECTOR" or "ELLIPSE", area > 4,000,000 px² (> ~2000×2000).
6. DUPLICATE CLONES  — two+ non-FRAME nodes with identical x, y, w, h — flag the one with lower depth index.

═══ MAIN FRAME IDENTIFICATION ══════════════════════════════════════════
Find the single "Primary Application Screen" — the FRAME at depth 1 that:
• Represents the main UI content area (not a splash, overlay, tooltip, or component sheet).
• Is the largest FRAME by area among depth-1 nodes, OR has a name containing App/Screen/Main/Home/Dashboard.
• Is NOT a component definition or variant frame.
Set mainFrameId to its ID. Use null only if no clear candidate exists.

═══ AUTO-LAYOUT INFERENCE ══════════════════════════════════════════════
For each node in the top 20 by area, if you can infer Auto-layout direction from x/y positions
of its children, add a layoutHint:
  "row"    — children share similar Y, increasing X
  "column" — children share similar X, increasing Y
  "grid"   — children arranged in both axes
Include up to 10 layout hints total. Omit if not inferable.

Return ONLY this JSON:
{
  "excludeIds":   ["<id1>", "<id2>"],
  "mainFrameId":  "<id or null>",
  "layoutHints":  [{ "nodeId": "<id>", "direction": "row|column|grid" }],
  "summary":      "<1-sentence: excluded N noise nodes, main frame is X, layout hints for Y nodes>"
}`;

// ── Heuristic pre-filter (synchronous, no network) ────────────────────────────

function heuristicFilter(nodes: FigmaVisualNode[]): {
  filtered: FigmaVisualNode[];
  issues:   NodeIssue[];
} {
  const issues:   NodeIssue[]       = [];
  const filtered: FigmaVisualNode[] = [];
  /** posKey → node, for duplicate detection */
  const seenPos = new Map<string, FigmaVisualNode>();

  for (const n of nodes) {
    // ── Zero-size ─────────────────────────────────────────────────────────
    if (n.width <= 0 || n.height <= 0) {
      issues.push({
        nodeId:   n.id,
        nodeName: n.name,
        issue:    'zero-size',
        severity: 'high',
        detail:   `${Math.round(n.width)}×${Math.round(n.height)}px`,
      });
      continue;
    }

    // ── Huge VECTOR / ELLIPSE (noise) ─────────────────────────────────────
    if ((n.type === 'VECTOR' || n.type === 'ELLIPSE') &&
        (n.width > 1500 || n.height > 1500)) {
      issues.push({
        nodeId:   n.id,
        nodeName: n.name,
        issue:    'noise',
        severity: 'high',
        detail:   `${Math.round(n.width)}×${Math.round(n.height)}px decorative vector`,
      });
      continue;
    }

    // ── Off-canvas (significantly negative coordinates) ───────────────────
    if (n.x < -500 || n.y < -500) {
      issues.push({
        nodeId:   n.id,
        nodeName: n.name,
        issue:    'off-canvas',
        severity: 'medium',
        detail:   `x=${Math.round(n.x)}, y=${Math.round(n.y)}`,
      });
      continue;
    }

    // ── Duplicate position (non-FRAME nodes only) ─────────────────────────
    const isFrame = n.type === 'FRAME' || n.type === 'SECTION';
    if (!isFrame) {
      const posKey = `${Math.round(n.x)}_${Math.round(n.y)}_${Math.round(n.width)}_${Math.round(n.height)}`;
      const existing = seenPos.get(posKey);
      if (existing) {
        // Keep the one with higher depth (higher z-index), flag the other
        const keepNew = n.depth >= existing.depth;
        const flagged = keepNew ? existing : n;
        const kept    = keepNew ? n : existing;
        issues.push({
          nodeId:   flagged.id,
          nodeName: flagged.name,
          issue:    'duplicate-position',
          severity: 'medium',
          detail:   `Same bounds as "${kept.name}" (keeping depth ${kept.depth})`,
        });
        if (keepNew) {
          // Remove the existing one from filtered and replace
          const idx = filtered.indexOf(existing);
          if (idx !== -1) filtered.splice(idx, 1);
          seenPos.set(posKey, n);
        } else {
          continue; // skip the new one
        }
      } else {
        seenPos.set(posKey, n);
      }
    }

    filtered.push(n);
  }

  return { filtered, issues };
}

// ── Module-level concurrency lock ─────────────────────────────────────────────

let _busy = false;

// ── Service ───────────────────────────────────────────────────────────────────

export const AIEngineService = {

  /**
   * Validate a set of visual nodes.
   *
   * Reads engineApiKey and engineModelId DIRECTLY from ConfigService at call
   * time — not from any React state.  This guarantees the engine always uses
   * its own config regardless of what model the user has selected in the chat.
   *
   * @param nodes     Full FigmaVisualNode[] from deepScrapeNodes.
   * @param _theme    ProjectTheme (reserved for future context injection).
   * @param onStatus  Optional callback for progress messages.
   */
  async validate(
    nodes:     FigmaVisualNode[],
    _theme:    ProjectTheme | null,
    onStatus?: (status: EngineStatus, msg: string) => void,
  ): Promise<ValidationResult> {

    // Concurrency guard — skip if already running
    if (_busy) {
      return {
        ok:           true,
        timestamp:    Date.now(),
        modelId:      'skipped',
        nodeCount:    nodes.length,
        cleanCount:   nodes.length,
        issues:       [],
        cleanedNodes: nodes,
        summary:      'Validation skipped — previous run still in progress.',
      };
    }

    // ── Read isolated config — NEVER from React state ─────────────────────
    const engineApiKey  = ConfigService.getEngineApiKey();
    const engineModelId = ConfigService.getEngineModel();

    _busy = true;
    const allIssues: NodeIssue[]       = [];
    let   cleaned:   FigmaVisualNode[] = nodes;

    try {
      // ── Step 1: Heuristic filter (synchronous, no network) ──────────────
      onStatus?.('validating', `Heuristic filter: ${nodes.length} nodes…`);
      const { filtered, issues: hIssues } = heuristicFilter(nodes);
      allIssues.push(...hIssues);
      cleaned = filtered;

      // ── Step 2: AI validation (only if engine key is configured) ────────
      let aiSummary = `Heuristic: ${hIssues.length} issue(s) removed, ${cleaned.length} clean nodes.`;

      if (engineApiKey) {
        onStatus?.('validating', `AI validation via ${engineModelId} (${cleaned.length} nodes)…`);

        // Condense to 100 nodes max to keep token count reasonable
        const condensed = cleaned.slice(0, 100).map(n => ({
          id:    n.id,
          name:  n.name,
          type:  n.type,
          x:     Math.round(n.x),
          y:     Math.round(n.y),
          w:     Math.round(n.width),
          h:     Math.round(n.height),
          depth: n.depth,
        }));

        let aiRes: Response;
        try {
          aiRes = await llmFetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              'Authorization': `Bearer ${engineApiKey}`,
              'Content-Type':  'application/json',
              'X-Title':       'AIC-RG Studio - Geometry Engine',
            },
            JSON.stringify({
              model:       engineModelId,   // ← ISOLATED model, never chat model
              messages: [
                { role: 'system', content: ENGINE_SYSTEM_PROMPT },  // ← private prompt
                { role: 'user',   content: JSON.stringify(condensed) },
              ],
              max_tokens:  1500,
              temperature: 0,   // deterministic — geometry is not creative
            }),
          );
        } catch (netErr: any) {
          // Network error — fall back to heuristic result gracefully
          onStatus?.('done', `AI call failed (${netErr.message}), using heuristic result`);
          return buildResult(true, engineModelId + ' (fallback)', nodes.length, cleaned, allIssues, aiSummary);
        }

        if (aiRes.ok) {
          const data = await aiRes.json();
          const text = (data.choices?.[0]?.message?.content ?? '').trim();

          try {
            const bare   = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(bare) as {
              issues?:       Array<{ nodeId: string; nodeName?: string; issue: string; severity: string; detail: string }>;
              cleanNodeIds?: string[];
              summary?:      string;
            };

            // Merge AI issues (deduplicate by nodeId + issue)
            for (const iss of (parsed.issues ?? [])) {
              if (!allIssues.find(i => i.nodeId === iss.nodeId && i.issue === iss.issue)) {
                allIssues.push({
                  nodeId:   iss.nodeId,
                  nodeName: iss.nodeName ?? iss.nodeId,
                  issue:    (iss.issue  as NodeIssueType) ?? 'noise',
                  severity: (iss.severity as NodeIssue['severity']) ?? 'low',
                  detail:   iss.detail ?? '',
                });
              }
            }

            // Apply AI's cleanNodeIds if returned
            if (Array.isArray(parsed.cleanNodeIds) && parsed.cleanNodeIds.length > 0) {
              const cleanSet = new Set<string>(parsed.cleanNodeIds);
              cleaned = cleaned.filter(n => cleanSet.has(n.id));
            }

            if (parsed.summary) aiSummary = parsed.summary;

          } catch {
            // AI response not parseable as JSON — keep heuristic result
            aiSummary += ' (AI response unparseable — heuristic result used)';
          }
        } else {
          aiSummary += ` (AI HTTP ${aiRes.status} — heuristic result used)`;
        }
      }

      onStatus?.('done', `Engine done: ${cleaned.length}/${nodes.length} nodes passed`);
      return buildResult(true, engineApiKey ? engineModelId : 'heuristic-only', nodes.length, cleaned, allIssues, aiSummary);

    } catch (err: any) {
      const msg = err?.message ?? 'Unknown engine error';
      onStatus?.('error', msg);
      // On unexpected error, return original nodes (non-destructive)
      return buildResult(false, engineApiKey ? engineModelId : 'heuristic-only', nodes.length, nodes, allIssues, `Error: ${msg}`);

    } finally {
      _busy = false;
    }
  },

  /** True if a validation run is currently in progress. */
  get isBusy(): boolean { return _busy; },

  /**
   * analyzeNodes — Pro-Audit layout analysis.
   *
   * Sends a condensed node list to the engine model and asks it to:
   *   1. Identify "design noise" (oversized decorative / hidden nodes).
   *   2. Identify the "Main UI Container" frame (mainFrameId).
   *
   * Reads engineApiKey + engineModelId from ConfigService — NEVER from React state.
   * If no engineApiKey: falls back to heuristic rules (no network, no cost).
   *
   * Performance Guard: call ONLY on user-initiated "Sync" or "Optimize View".
   */
  async analyzeNodes(
    nodes:           FigmaVisualNode[],
    onStatus?:       (msg: string) => void,
    /** Optional: output of ScannerService.buildPromptContext() for component mapping. */
    registryContext?: string,
  ): Promise<AnalyzeResult> {
    const EMPTY: AnalyzeResult = {
      excludeIds: [], mainFrameId: null, summary: '',
      componentMappings: [], layoutHints: [],
    };

    const engineApiKey  = ConfigService.getEngineApiKey();
    const engineModelId = ConfigService.getEngineModel();

    // ── Heuristic fallback (no API key configured) ──────────────────────
    if (!engineApiKey) {
      const rootFrame  = nodes.find(n => n.depth === 0 && (n.type === 'FRAME' || n.type === 'SECTION'));
      const excludeIds = nodes
        .filter(n => n.id !== rootFrame?.id && (n.width > 2500 || n.height > 2500))
        .map(n => n.id);
      const mainFrame  = nodes.find(
        n => (n.type === 'FRAME' || n.type === 'SECTION') && n.depth === 1,
      ) ?? rootFrame ?? null;
      return {
        ...EMPTY,
        excludeIds,
        mainFrameId: mainFrame?.id ?? null,
        summary:     `Heuristic: removed ${excludeIds.length} oversized node(s).`,
      };
    }

    // ── Build dynamic prompt ──────────────────────────────────────────────
    // Append component mapping section when registry is provided
    const mappingSection = registryContext
      ? `\n\n═══ COMPONENT MAPPING ════════════════════════════════════════════\n` +
        `The project has the following reusable components in its registry:\n\n` +
        registryContext + `\n\n` +
        `For each Figma node that CLEARLY corresponds to a registry component, add a mapping.\n` +
        `Matching rules:\n` +
        `  • Node name contains "Button", "Btn" → map to Button component\n` +
        `  • Node name contains "Card", "Item", "Tile" → map to Card\n` +
        `  • Node name contains "Input", "Field", "Search" → map to Input\n` +
        `  • Node name contains "Badge", "Tag", "Chip" → map to Badge\n` +
        `  • Node name contains "Avatar", "Profile" → map to Avatar\n` +
        `  • Use visual context (small rect at bottom = button, content box = card)\n` +
        `  • confidence: 1.0 = obvious match, 0.6 = likely, below 0.6 = skip\n\n` +
        `Add "componentMappings" array to your JSON:\n` +
        `  [{ "nodeId": "...", "nodeName": "...", "componentName": "Button", "variant": "primary", "confidence": 0.9 }]`
      : '';

    const fullPrompt = ANALYZE_SYSTEM_PROMPT + mappingSection;

    // ── AI analysis ───────────────────────────────────────────────────────
    const label = registryContext ? 'Pro-Audit + Component Mapping' : 'Pro-Audit';
    onStatus?.(`${label}: analyzing ${nodes.length} nodes…`);

    const condensed = nodes.slice(0, 150).map(n => ({
      id:      n.id,
      name:    n.name,
      type:    n.type,
      x:       Math.round(n.x),
      y:       Math.round(n.y),
      w:       Math.round(n.width),
      h:       Math.round(n.height),
      depth:   n.depth,
      visible: n.opacity !== 0,
    }));

    try {
      const res = await llmFetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          'Authorization': `Bearer ${engineApiKey}`,
          'Content-Type':  'application/json',
          'X-Title':       'AIC-RG Studio - Pro Audit',
        },
        JSON.stringify({
          model:       engineModelId,
          messages: [
            { role: 'system', content: fullPrompt },
            { role: 'user',   content: JSON.stringify(condensed) },
          ],
          max_tokens:  registryContext ? 1400 : 800,
          temperature: 0,
        }),
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data   = await res.json();
      const text   = (data.choices?.[0]?.message?.content ?? '').trim();
      const bare   = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(bare) as {
        excludeIds?:        string[];
        mainFrameId?:       string | null;
        summary?:           string;
        componentMappings?: ComponentMapping[];
        layoutHints?:       Array<{ nodeId: string; direction: 'row' | 'column' | 'grid' }>;
      };

      // Filter mappings below confidence threshold
      const mappings = (parsed.componentMappings ?? []).filter(m => m.confidence >= 0.6);
      if (mappings.length > 0) {
        onStatus?.(`${label}: mapped ${mappings.length} node(s) to registry components ✓`);
        console.log('[AIEngineService] Component mappings:', mappings);
      }

      return {
        excludeIds:        parsed.excludeIds   ?? [],
        mainFrameId:       parsed.mainFrameId  ?? null,
        summary:           parsed.summary      ?? '',
        componentMappings: mappings,
        layoutHints:       parsed.layoutHints  ?? [],
      };
    } catch (err: any) {
      console.warn('[AIEngineService.analyzeNodes] Error:', err.message);
      return { ...EMPTY, summary: `Analysis failed: ${err.message}` };
    }
  },
};

// ── Internal result builder ───────────────────────────────────────────────────

function buildResult(
  ok:           boolean,
  modelId:      string,
  nodeCount:    number,
  cleanedNodes: FigmaVisualNode[],
  issues:       NodeIssue[],
  summary:      string,
): ValidationResult {
  return { ok, timestamp: Date.now(), modelId, nodeCount, cleanCount: cleanedNodes.length, issues, cleanedNodes, summary };
}

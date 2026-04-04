/**
 * DesignDiffService — Design diff + AI Audit utilities.
 *
 *  calculateDesignDiff(original, modified)
 *    Compares two FigmaVisualNode[] snapshots (matched by node id),
 *    returns an array of DesignChange describing every changed field.
 *
 *  buildAuditPrompt(nodes, theme)
 *    Builds the OpenRouter prompt asking the LLM to find spacing /
 *    typography / color violations against the project Design DNA.
 *
 *  parseAuditResponse(text)
 *    Extracts a DesignChange[] from the LLM response (may contain
 *    markdown fences around the JSON).
 *
 *  AUDIT_SYSTEM_PROMPT — exported for use in the API call.
 */

import type { FigmaVisualNode, ProjectTheme } from './FigmaService';

// ── Types ────────────────────────────────────────────────────────────────────

export type ChangeField =
  | 'fillColor' | 'fillGradient' | 'opacity'
  | 'fontSize'  | 'fontFamily'   | 'fontWeight'
  | 'cornerRadius' | 'strokeColor' | 'strokeWidth'
  | 'width' | 'height' | 'x' | 'y';

export type ChangeType = 'color' | 'typography' | 'geometry' | 'layout' | 'effect';

export interface DesignChange {
  nodeId:      string;
  nodeName:    string;
  field:       ChangeField;
  from:        unknown;
  to:          unknown;
  changeType:  ChangeType;
  figmaVar?:   string;   // matching Figma CSS variable name, if known
  rationale?:  string;   // AI-provided reason (1 sentence)
}

// ── Field → type mapping ─────────────────────────────────────────────────────

const FIELD_TYPE: Record<ChangeField, ChangeType> = {
  fillColor:    'color',
  fillGradient: 'color',
  strokeColor:  'color',
  opacity:      'effect',
  fontSize:     'typography',
  fontFamily:   'typography',
  fontWeight:   'typography',
  cornerRadius: 'geometry',
  strokeWidth:  'geometry',
  width:        'layout',
  height:       'layout',
  x:            'layout',
  y:            'layout',
};

const COMPARABLE: ChangeField[] = Object.keys(FIELD_TYPE) as ChangeField[];

// ── Diff engine ──────────────────────────────────────────────────────────────

/**
 * Finds changed fields between two snapshots of a Figma node list.
 * Nodes are matched by their `id`; new or removed nodes are ignored.
 */
export function calculateDesignDiff(
  original: FigmaVisualNode[],
  modified:  FigmaVisualNode[],
): DesignChange[] {
  const origMap = new Map(original.map(n => [n.id, n]));
  const changes: DesignChange[] = [];

  for (const mod of modified) {
    const orig = origMap.get(mod.id);
    if (!orig) continue;

    for (const field of COMPARABLE) {
      const from = orig[field as keyof FigmaVisualNode];
      const to   = mod[field  as keyof FigmaVisualNode];
      if (from === to) continue;
      if (from === undefined && to === undefined) continue;

      changes.push({
        nodeId:     mod.id,
        nodeName:   mod.name,
        field,
        from,
        to,
        changeType: FIELD_TYPE[field],
      });
    }
  }
  return changes;
}

// ── AI Audit ─────────────────────────────────────────────────────────────────

export const AUDIT_SYSTEM_PROMPT = `You are a senior UI/UX design auditor specializing in design systems.
Analyze the Figma node data provided and return ONLY a valid JSON array of design issues.

Each issue must be an object with EXACTLY these fields:
{
  "nodeId":     "<id>",
  "nodeName":   "<name>",
  "field":      "<fillColor|fontSize|fontFamily|fontWeight|cornerRadius|opacity|strokeColor|x|y|width|height>",
  "from":       <current value as the same type — string for colors, number for sizes>,
  "to":         <suggested corrected value — same type as "from">,
  "changeType": "<color|typography|geometry|layout|effect>",
  "rationale":  "<1 sentence explaining the design system violation>"
}

Rules:
1. Only flag REAL violations:
   - Colors not in the approved DNA palette (ignore white, black, transparent)
   - Font families not in the approved DNA list
   - Positions (x, y) not on the 4px grid
   - Font sizes that deviate from DNA text style sizes by more than 2px
2. For color fixes: suggest the closest color from the DNA palette.
3. For font fixes: suggest the closest font from the DNA list.
4. For grid fixes: round to the nearest 4px multiple.
5. Return max 20 issues, sorted by severity (color > typography > layout).
6. Return ONLY the JSON array — no markdown, no explanation, no code fences.`;

/**
 * Builds the user prompt for the AI audit, condensing node data to
 * avoid excessive token usage while keeping all relevant properties.
 */
export function buildAuditPrompt(
  nodes: FigmaVisualNode[],
  theme: ProjectTheme,
): string {
  const condensed = nodes.slice(0, 150).map(n => ({
    id:   n.id,
    name: n.name,
    type: n.type,
    x:    Math.round(n.x),
    y:    Math.round(n.y),
    w:    Math.round(n.width),
    h:    Math.round(n.height),
    ...(n.fillColor    && { fillColor:    n.fillColor }),
    ...(n.fillGradient && { fillGradient: '(gradient — skip)' }),
    ...(n.fontSize     != null && { fontSize:     n.fontSize }),
    ...(n.fontFamily             && { fontFamily:   n.fontFamily }),
    ...(n.fontWeight   != null && { fontWeight:   n.fontWeight }),
    ...(n.cornerRadius != null && n.cornerRadius > 0 && { cornerRadius: n.cornerRadius }),
    ...(n.opacity      != null && n.opacity < 1       && { opacity:      n.opacity }),
    ...(n.strokeColor            && { strokeColor:  n.strokeColor }),
  }));

  const dnaColors = [
    ...theme.colors,
    ...(theme.rawColors ?? []),
  ].filter((c, i, arr) => arr.findIndex(x => x.hex === c.hex) === i)
    .slice(0, 24)
    .map(c => c.hex);

  const dnaFonts = [
    ...new Set([
      ...theme.textStyles.map(t => t.fontFamily),
      ...(theme.rawFonts ?? []).map(t => t.fontFamily),
    ]),
  ].slice(0, 10);

  const dnaSizes = [...new Set(
    theme.textStyles.map(t => t.fontSize),
  )].sort((a, b) => a - b).slice(0, 12);

  return [
    `Design DNA — approved colors: ${dnaColors.join(', ')}`,
    `Design DNA — approved fonts: ${dnaFonts.join(', ')}`,
    `Design DNA — approved font sizes: ${dnaSizes.join(', ')}px`,
    '',
    'Figma node tree (JSON — analyze for violations):',
    JSON.stringify(condensed),
  ].join('\n');
}

/**
 * Parses the LLM response text into a DesignChange[].
 * Strips markdown code fences if present.
 */
export function parseAuditResponse(text: string): DesignChange[] {
  try {
    const clean = text
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    const arr = JSON.parse(clean);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (item): item is DesignChange =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.nodeId === 'string' &&
        typeof item.field  === 'string',
    );
  } catch {
    return [];
  }
}

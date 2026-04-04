/**
 * FigmaService — Phase 3.3 "Deep Scrape + Cultural Audit"
 *
 * Sync strategy (waterfall):
 *   1. checkPermissions   — REST: GET /v1/files/:key?depth=1 → role
 *   2. scrapeStyles       — REST: /styles → /nodes batch → parse fills/text
 *   3. deepScrapeNodes    — fallback when published styles = 0:
 *                           GET /v1/files/:key?depth=4, walk document tree
 *   4. duplicateFile      — best-effort POST /v1/files/:key/duplicate
 *   5. buildProjectTheme  — CSS vars + Tailwind extend + cultural audit comment
 *
 * injectFigmaContext()    — builds the _figma_theme.css string injected into
 *                           the AI's context on every generate call.
 *                           Accepts targetMarket + auditStrictness for regional
 *                           design-norm comparison.
 */

import { FigmaClient }  from './FigmaClient';
import { proxyPost }    from './proxyConfig';
import { IdentityService } from './IdentityService';

const BASE = 'https://api.figma.com/v1';

// ── Public types ─────────────────────────────────────────────────────────────

export type SyncStep =
  | 'idle'
  | 'checking'
  | 'scraping'
  | 'deep-scraping'   // fallback when /styles returns 0 results
  | 'duplicating'
  | 'injecting'
  | 'done'
  | 'error';

export type TargetMarket    = 'USA' | 'EU' | 'GLOBAL';
export type AuditStrictness = 'strict' | 'normal' | 'loose';

export interface SyncProgress {
  step:    SyncStep;
  message: string;
  pct:     number;
}

export interface FigmaColorToken {
  styleId:  string;
  name:     string;
  cssVar:   string;
  hex:      string;
  r: number; g: number; b: number; a: number;
}

export interface FigmaTextStyle {
  styleId:    string;
  name:       string;
  fontFamily: string;
  fontSize:   number;
  fontWeight: number;
  lineHeight: number | 'auto';
}

/** Renderable node for the Platinum Mirror View canvas. */
export interface FigmaVisualNode {
  id:            string;
  name:          string;
  type:          string;
  depth:         number;
  x:             number;
  y:             number;
  width:         number;
  height:        number;
  // Fill
  fillColor?:    string;    // hex (first SOLID, or dominant gradient color)
  fillGradient?: string;    // CSS gradient string (linear-gradient / radial-gradient)
  fillOpacity?:  number;
  // Border / stroke
  cornerRadius?: number;
  strokeColor?:  string;
  strokeWidth?:  number;
  // Visibility
  opacity?:      number;
  isFrame?:      boolean;
  // Effects
  shadowCss?:    string;    // CSS box-shadow value
  blurPx?:       number;    // filter: blur() radius
  // TEXT node
  text?:         string;
  fontSize?:     number;
  fontFamily?:   string;
  fontWeight?:   number;
  // Image fill resolved from Figma /files/:key/images API
  imageUrl?:     string;
  // Auto Layout direction (HORIZONTAL → flex-row, VERTICAL → flex-col)
  autoLayout?:   'HORIZONTAL' | 'VERTICAL';
  // Hierarchical tree (used by exportFigmaTree, optional in flat list)
  children?:     FigmaVisualNode[];
}

export interface ProjectTheme {
  figmaFileKey:      string;
  syncedAt:          number;
  colors:            FigmaColorToken[];
  textStyles:        FigmaTextStyle[];
  tailwindExtend:    string;
  cssVars:           string;
  /** Present only when deep scan was used (no published styles). */
  rawColors?:        FigmaColorToken[];
  rawFonts?:         FigmaTextStyle[];
  isDeepScraped?:    boolean;
  targetMarket?:     TargetMarket;
  auditStrictness?:  AuditStrictness;
  /** Visual nodes for Mirror View — geometry-based render. */
  visualNodes?:      FigmaVisualNode[];
}

export type SyncResult =
  | { ok: true;  theme: ProjectTheme; figmaUrl?: string; syncSource?: 'proxy' | 'direct' }
  | { ok: false; error: string; step: SyncStep };

/**
 * Response shape from the Figma Proxy Edge Function (action: 'scrape').
 * Matches the UniversalJSON type in the Edge Function.
 */
export interface ProxyUniversalResponse {
  fileName:    string;
  colors:      FigmaColorToken[];
  textStyles:  FigmaTextStyle[];
  visualNodes: FigmaVisualNode[];
  imageRefs:   Record<string, string>;
  fromCache:   boolean;
  source:      'user_token' | 'master_token';
}

export interface SyncOptions {
  targetMarket?:    TargetMarket;
  auditStrictness?: AuditStrictness;
}

// ── Figma API shapes (partial) ───────────────────────────────────────────────

interface FigmaStyleDescriptor {
  node_id:    string;
  name:       string;
  style_type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
}

interface RgbaColor { r: number; g: number; b: number; a: number }

interface FigmaPaint {
  type:           string;   // 'SOLID' | 'LINEAR_GRADIENT' | 'RADIAL_GRADIENT' | 'IMAGE' …
  color?:         RgbaColor;
  opacity?:       number;   // paint-level opacity (separate from node opacity)
  visible?:       boolean;
  gradientStops?: Array<{ position: number; color: RgbaColor }>;
  imageRef?:      string;   // present when type === 'IMAGE' — maps to /files/:key/images
}

interface FigmaEffect {
  type:     string;         // 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  visible?: boolean;
  radius?:  number;
  color?:   RgbaColor;
  offset?:  { x: number; y: number };
  spread?:  number;
}

interface FigmaNode {
  id:            string;
  type:          string;
  name?:         string;
  fills?:        FigmaPaint[];
  strokes?:      FigmaPaint[];
  strokeWeight?: number;
  effects?:      FigmaEffect[];
  style?:   {
    fontFamily?:     string;
    fontSize?:       number;
    fontWeight?:     number;
    lineHeightPx?:   number;
    lineHeightUnit?: string;
  };
  children?:            FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  opacity?:             number;
  characters?:          string;
  cornerRadius?:        number;
  layoutMode?:          string;  // 'HORIZONTAL' | 'VERTICAL' | 'NONE' — Figma Auto Layout
  itemSpacing?:         number;  // gap between auto-layout children
}

// ── Cultural palette data ─────────────────────────────────────────────────────

interface MarketPalette {
  notes:            string;
  /** [hueMin, hueMax, label] — hue 0-360 */
  trustedHues:      Array<[number, number, string]>;
  riskyHues:        Array<[number, number, string]>;
  recommendedFonts: string[];
  contrastStandard: string;
}

const CULTURAL_PALETTES: Record<TargetMarket, MarketPalette> = {
  USA: {
    notes:
      'US fintech: trust-blues (#1a56db–#3b82f6), growth-greens (#16a34a–#22c55e), ' +
      'high contrast, WCAG AA minimum. Preferred fonts: Inter, Roboto, DM Sans, Plus Jakarta Sans.',
    trustedHues: [
      [210, 260, 'Trust Blue — primary US fintech anchor'],
      [120, 165, 'Growth Green — CTA / positive metrics'],
    ],
    riskyHues: [
      [0,  25,  'Aggressive Red — restrict to error/danger states'],
      [30, 70,  'Orange/Yellow — avoid as primary in financial UI'],
    ],
    recommendedFonts:  ['Inter', 'Roboto', 'DM Sans', 'Plus Jakarta Sans', 'Geist'],
    contrastStandard:  'WCAG AA (4.5:1 body text, 3:1 large text)',
  },
  EU: {
    notes:
      'EU fintech: conservative deep blues (#1e3a5f–#264d73), muted greens, formal grays. ' +
      'WCAG AAA recommended for financial data. Preferred fonts: Lato, Source Sans 3, Nunito.',
    trustedHues: [
      [200, 240, 'Conservative Blue — regulatory trust signal'],
      [100, 150, 'Muted Green — confirmations / success only'],
    ],
    riskyHues: [
      [0,   30,  'Bright Red — too aggressive for EU financial UX'],
      [260, 310, 'Purple — uncommon in EU formal finance'],
      [30,  80,  'Warm Orange/Yellow — low trust signal in EU markets'],
    ],
    recommendedFonts:  ['Lato', 'Source Sans 3', 'Nunito', 'Open Sans', 'Figtree'],
    contrastStandard:  'WCAG AAA (7:1 body) recommended for financial content',
  },
  GLOBAL: {
    notes:
      'Global: culturally neutral palette (blues, greens), high contrast. ' +
      'Avoid pure red as primary. Preferred fonts: Inter, Noto Sans, IBM Plex Sans.',
    trustedHues: [
      [195, 265, 'Blue family — globally trusted in finance'],
      [100, 170, 'Green family — universally positive'],
    ],
    riskyHues: [
      [0,  20,  'Red — conflicting signals (danger in West / luck in East)'],
      [270, 310, 'Purple — mixed cultural connotations'],
    ],
    recommendedFonts:  ['Inter', 'Noto Sans', 'IBM Plex Sans', 'Open Sans'],
    contrastStandard:  'WCAG AA minimum across all locales',
  },
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function toCssVar(name: string): string {
  return '--color-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function toFontVar(name: string): string {
  return '--font-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function rgbToHex({ r, g, b }: RgbaColor): string {
  const toB = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toB(r)}${toB(g)}${toB(b)}`;
}

function nestByPath(entries: Array<{ path: string[]; value: string }>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const { path, value } of entries) {
    let node = root;
    path.forEach((seg, i) => {
      if (i === path.length - 1) { node[seg] = value; }
      else {
        if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = {};
        node = node[seg] as Record<string, unknown>;
      }
    });
  }
  return root;
}

function namePath(name: string): string[] {
  return name.split('/')
    .map(s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6;               break;
      case b: h = ((r - g) / d + 4) / 6;               break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function auditColor(hex: string, market: TargetMarket, strictness: AuditStrictness): string {
  const p = CULTURAL_PALETTES[market];
  const [h, s, l] = hexToHsl(hex);
  for (const [min, max, label] of p.trustedHues) {
    if (h >= min && h <= max) {
      if (strictness === 'strict' && (s < 35 || l < 12 || l > 88))
        return `⚠️  ${hex} (h:${h}°) → "${label}" but weak saturation/contrast`;
      return `✅ ${hex} (h:${h}°) → ${label}`;
    }
  }
  for (const [min, max, label] of p.riskyHues) {
    if (h >= min && h <= max)
      return strictness === 'loose'
        ? `ℹ️  ${hex} (h:${h}°) → "${label}" — use with caution`
        : `⚠️  ${hex} (h:${h}°) → "${label}" — verify intent`;
  }
  return `◦  ${hex} (h:${h}° s:${s}% l:${l}%) — neutral`;
}

// ── Apply-changes types (kept here to avoid circular import) ────────────────

/** Minimal change descriptor consumed by applyChanges(). */
export interface DesignChangeInput {
  nodeId:     string;
  nodeName:   string;
  field:      string;
  from?:      unknown;
  to:         unknown;
  changeType: 'color' | 'typography' | 'geometry' | 'layout' | 'effect';
}

export interface ApplyBatchResult {
  applied:      number;
  skipped:      number;
  errors:       string[];
  pluginSpec?:  object;   // changes that need Figma Plugin (not REST)
}

// ── Recursive node mapper ────────────────────────────────────────────────────

const RENDERABLE_TYPES = new Set([
  'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE',
  'RECTANGLE', 'ELLIPSE', 'VECTOR', 'TEXT', 'SECTION', 'GROUP',
]);

/**
 * Maps a raw Figma API node to a FigmaVisualNode, recursing into children.
 * Extracts fills (solid + gradient), strokes, effects (shadow / blur).
 * Returns null for non-renderable or zero-size nodes.
 */
function mapFigmaNode(node: FigmaNode, depth = 0, imageRefMap?: Map<string, string>): FigmaVisualNode | null {
  if (!RENDERABLE_TYPES.has(node.type)) return null;
  const bbox = node.absoluteBoundingBox;
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

  // ── Fill ─────────────────────────────────────────────────────────────────
  let fillColor:    string | undefined;
  let fillGradient: string | undefined;
  let fillOpacity:  number | undefined;

  const visibleFills = (node.fills ?? []).filter(f => f.visible !== false);
  const solidFill    = visibleFills.find(f => f.type === 'SOLID'  && f.color);
  const gradFill     = visibleFills.find(f =>
    (f.type === 'LINEAR_GRADIENT' || f.type === 'RADIAL_GRADIENT') &&
    f.gradientStops && f.gradientStops.length >= 2,
  );

  if (solidFill?.color) {
    fillColor   = rgbToHex(solidFill.color);
    fillOpacity = solidFill.opacity;
  } else if (gradFill?.gradientStops) {
    const stops = [...gradFill.gradientStops]
      .sort((a, b) => a.position - b.position)
      .map(s => `${rgbToHex(s.color)} ${Math.round(s.position * 100)}%`)
      .join(', ');
    fillGradient = gradFill.type === 'RADIAL_GRADIENT'
      ? `radial-gradient(ellipse at center, ${stops})`
      : `linear-gradient(135deg, ${stops})`;
    fillColor = rgbToHex(gradFill.gradientStops[0].color); // dominant for DNA
  }

  // ── Image fill ───────────────────────────────────────────────────────────
  let imageUrl: string | undefined;
  const imageFill = visibleFills.find(f => f.type === 'IMAGE' && f.imageRef);
  if (imageFill?.imageRef && imageRefMap) {
    imageUrl = imageRefMap.get(imageFill.imageRef);
  }

  // ── Stroke ───────────────────────────────────────────────────────────────
  let strokeColor: string | undefined;
  let strokeWidth: number | undefined;
  const solidStroke = (node.strokes ?? [])
    .find(s => s.type === 'SOLID' && s.color && s.visible !== false);
  if (solidStroke?.color) {
    strokeColor = rgbToHex(solidStroke.color);
    strokeWidth = node.strokeWeight;
  }

  // ── Effects ──────────────────────────────────────────────────────────────
  let shadowCss: string | undefined;
  let blurPx:    number | undefined;
  const shadowParts: string[] = [];
  for (const eff of (node.effects ?? []).filter(e => e.visible !== false)) {
    if ((eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') && eff.color && eff.offset) {
      const { r, g, b, a } = eff.color;
      const inset = eff.type === 'INNER_SHADOW' ? 'inset ' : '';
      shadowParts.push(
        `${inset}${eff.offset.x}px ${eff.offset.y}px ${eff.radius ?? 0}px ${eff.spread ?? 0}px ` +
        `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${(a ?? 1).toFixed(2)})`,
      );
    }
    if (eff.type === 'LAYER_BLUR' && eff.radius) blurPx = eff.radius;
  }
  if (shadowParts.length) shadowCss = shadowParts.join(', ');

  // ── Children (full recursion — pass imageRefMap through) ────────────────
  const children: FigmaVisualNode[] = [];
  for (const child of (node.children ?? [])) {
    const mapped = mapFigmaNode(child, depth + 1, imageRefMap);
    if (mapped) children.push(mapped);
  }

  return {
    id:           node.id,
    name:         node.name ?? node.type,
    type:         node.type,
    depth,
    x:            bbox.x,
    y:            bbox.y,
    width:        bbox.width,
    height:       bbox.height,
    fillColor,
    fillGradient,
    fillOpacity,
    cornerRadius: node.cornerRadius,
    strokeColor,
    strokeWidth,
    opacity:      node.opacity,
    shadowCss,
    blurPx,
    imageUrl,
    autoLayout:   (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL')
      ? node.layoutMode as 'HORIZONTAL' | 'VERTICAL'
      : undefined,
    isFrame:      node.type === 'FRAME' || node.type === 'SECTION',
    text:         node.type === 'TEXT' ? node.characters : undefined,
    fontSize:     node.style?.fontSize,
    fontFamily:   node.style?.fontFamily,
    fontWeight:   node.style?.fontWeight,
    children:     children.length > 0 ? children : undefined,
  };
}

/** Flatten a visual node tree into a depth-sorted array for absolute CSS layout. */
function flattenVisualTree(roots: FigmaVisualNode[]): FigmaVisualNode[] {
  const flat: FigmaVisualNode[] = [];
  const visit = (n: FigmaVisualNode) => {
    flat.push(n);
    if (n.children) n.children.forEach(visit);
  };
  roots.forEach(visit);
  return flat.sort((a, b) => a.depth - b.depth);
}

// ── Anti-429 Deep Scrape Cache ────────────────────────────────────────────────
// Saves last successful /files/:key?depth=10 response + image refs to localStorage.
// On 429 / 403 / network failure, loads stale cache automatically.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface _DeepCache {
  fileKey:    string;
  data:       unknown;            // raw Figma /files/:key response
  imageRefs:  Record<string, string>;
  savedAt:    string;             // ISO timestamp
}

function _cacheKey(fileKey: string) { return `FGM_DEEP_${fileKey}`; }

function _saveDeepCache(fileKey: string, data: unknown, imageRefs: Record<string, string>): void {
  try {
    const entry: _DeepCache = { fileKey, data, imageRefs, savedAt: new Date().toISOString() };
    localStorage.setItem(_cacheKey(fileKey), JSON.stringify(entry));
    console.log(`[FigmaService] Deep cache saved for ${fileKey}`);
  } catch { /* quota exceeded — ignore */ }
}

function _loadDeepCache(fileKey: string): _DeepCache | null {
  try {
    const raw = localStorage.getItem(_cacheKey(fileKey));
    if (!raw) return null;
    const entry = JSON.parse(raw) as _DeepCache;
    const age = Date.now() - new Date(entry.savedAt).getTime();
    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(_cacheKey(fileKey));
      return null;
    }
    return entry;
  } catch { return null; }
}

/** Shared processing: walk raw Figma document → typed colors/fonts/visualNodes. */
function _buildScrapeResult(
  data:        Record<string, unknown>,
  imageRefMap: Map<string, string>,
): { colors: FigmaColorToken[]; textStyles: FigmaTextStyle[]; visualNodes: FigmaVisualNode[] } {
  const EMPTY = { colors: [], textStyles: [], visualNodes: [] };
  const doc = data.document as FigmaNode | undefined;
  if (!doc) return EMPTY;

  const colorMap = new Map<string, FigmaColorToken>();
  const fontMap  = new Map<string, FigmaTextStyle>();

  const walkDNA = (node: FigmaNode, depth = 0) => {
    if (depth > 14) return;
    for (const fill of (node.fills ?? []).filter(f => f.visible !== false)) {
      if (fill.type === 'SOLID' && fill.color && colorMap.size < 60) {
        const hex = rgbToHex(fill.color);
        if (!colorMap.has(hex)) {
          const rawName = `raw/${(node.name ?? hex).slice(0, 40).replace(/[^a-zA-Z0-9 /_-]/g, '')}`;
          colorMap.set(hex, {
            styleId: `raw-${colorMap.size}`, name: rawName, cssVar: toCssVar(rawName),
            hex, r: fill.color.r, g: fill.color.g, b: fill.color.b,
            a: fill.opacity ?? fill.color.a ?? 1,
          });
        }
      }
      if ((fill.type === 'LINEAR_GRADIENT' || fill.type === 'RADIAL_GRADIENT') && fill.gradientStops) {
        for (const stop of fill.gradientStops) {
          if (colorMap.size >= 60) break;
          const hex = rgbToHex(stop.color);
          if (!colorMap.has(hex)) {
            const rawName = `raw/gradient-${colorMap.size}`;
            colorMap.set(hex, {
              styleId: `raw-${colorMap.size}`, name: rawName, cssVar: toCssVar(rawName),
              hex, r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a ?? 1,
            });
          }
        }
      }
    }
    if (node.type === 'TEXT' && node.style && fontMap.size < 25) {
      const s = node.style;
      const fontKey = `${s.fontFamily ?? 'unknown'}-${s.fontSize ?? 0}-${s.fontWeight ?? 400}`;
      if (!fontMap.has(fontKey)) {
        fontMap.set(fontKey, {
          styleId: `raw-${fontMap.size}`, name: `raw/${(node.name ?? fontKey).slice(0, 40)}`,
          fontFamily: s.fontFamily ?? 'sans-serif', fontSize: s.fontSize ?? 16,
          fontWeight: s.fontWeight ?? 400,
          lineHeight: s.lineHeightUnit === 'AUTO' ? 'auto' : (s.lineHeightPx ?? 'auto'),
        });
      }
    }
    for (const child of (node.children ?? [])) walkDNA(child, depth + 1);
  };
  walkDNA(doc);

  const pages = (doc.children ?? []).filter(c => c.type === 'CANVAS');
  const primaryPage = pages[0];
  let visualNodes: FigmaVisualNode[] = [];

  if (primaryPage?.children) {
    const frameRoots: FigmaVisualNode[] = [];
    for (const topNode of primaryPage.children) {
      const mapped = mapFigmaNode(topNode, 0, imageRefMap);
      if (mapped) frameRoots.push(mapped);
    }
    console.group('[FigmaService] Universal JSON — top-level frames');
    console.log(JSON.stringify(
      frameRoots.map(f => ({
        name:       f.name,
        type:       f.type,
        size:       `${Math.round(f.width)}×${Math.round(f.height)}`,
        children:   f.children?.length ?? 0,
        totalNodes: flattenVisualTree([f]).length,
      })),
      null, 2,
    ));
    console.groupEnd();
    const flat = flattenVisualTree(frameRoots);
    console.log(`[FigmaService] Total visual nodes: ${flat.length}${flat.length > 500 ? ' → capped at 500' : ''}`);
    visualNodes = flat.slice(0, 500);
  }

  return { colors: [...colorMap.values()], textStyles: [...fontMap.values()], visualNodes };
}

// ── Service ──────────────────────────────────────────────────────────────────

export const FigmaService = {

  // ── Permission check ────────────────────────────────────────────────────

  async checkPermissions(key: string, token: string): Promise<'editor' | 'viewer' | 'owner' | null> {
    try {
      const res = await fetch(`${BASE}/files/${key}?depth=1`, { headers: { 'X-Figma-Token': token } });
      if (!res.ok) return null;
      const data = await res.json();
      const role = data.role as string | undefined;
      if (role === 'editor' || role === 'viewer' || role === 'owner') return role;
      return null;
    } catch { return null; }
  },

  // ── Published styles scrape ──────────────────────────────────────────────

  async scrapeStyles(key: string, token: string): Promise<{ colors: FigmaColorToken[]; textStyles: FigmaTextStyle[] }> {
    const stylesRes = await fetch(`${BASE}/files/${key}/styles`, { headers: { 'X-Figma-Token': token } });
    if (!stylesRes.ok) return { colors: [], textStyles: [] };
    const stylesData = await stylesRes.json();
    const styles: FigmaStyleDescriptor[] = stylesData.meta?.styles ?? [];

    const fillStyles = styles.filter(s => s.style_type === 'FILL');
    const textStyles = styles.filter(s => s.style_type === 'TEXT');

    const fetchNodes = async (nodeIds: string[]) => {
      if (!nodeIds.length) return {};
      const ids = nodeIds.join(',');
      const res = await fetch(`${BASE}/files/${key}/nodes?ids=${encodeURIComponent(ids)}`, {
        headers: { 'X-Figma-Token': token },
      });
      if (!res.ok) return {};
      return ((await res.json()).nodes ?? {}) as Record<string, { document: FigmaNode }>;
    };

    const [fillNodes, textNodes] = await Promise.all([
      fetchNodes(fillStyles.map(s => s.node_id)),
      fetchNodes(textStyles.map(s => s.node_id)),
    ]);

    const colors: FigmaColorToken[] = [];
    for (const style of fillStyles) {
      const nodeData = fillNodes[style.node_id]?.document;
      if (!nodeData) continue;
      const fills = (nodeData.fills ?? []) as Array<{ type: string; color?: RgbaColor }>;
      const solid = fills.find(f => f.type === 'SOLID' && f.color);
      if (!solid?.color) continue;
      const c = solid.color;
      colors.push({
        styleId: style.node_id, name: style.name,
        cssVar: toCssVar(style.name), hex: rgbToHex(c),
        r: c.r, g: c.g, b: c.b, a: c.a ?? 1,
      });
    }

    const parsedText: FigmaTextStyle[] = [];
    for (const style of textStyles) {
      const nodeData = textNodes[style.node_id]?.document;
      if (!nodeData) continue;
      const s = nodeData.style ?? {};
      parsedText.push({
        styleId: style.node_id, name: style.name,
        fontFamily: s.fontFamily  ?? 'sans-serif',
        fontSize:   s.fontSize    ?? 16,
        fontWeight: s.fontWeight  ?? 400,
        lineHeight: s.lineHeightUnit === 'AUTO' ? 'auto' : (s.lineHeightPx ?? 'auto'),
      });
    }

    return { colors, textStyles: parsedText };
  },

  // ── Deep node scrape — full geometry + Design DNA ───────────────────────

  async deepScrapeNodes(key: string, token: string): Promise<{ colors: FigmaColorToken[]; textStyles: FigmaTextStyle[]; visualNodes: FigmaVisualNode[]; fromCache?: boolean }> {
    const EMPTY = { colors: [], textStyles: [], visualNodes: [] };
    try {
      // depth=10 captures real UI hierarchies (components inside frames inside groups)
      const res = await fetch(`${BASE}/files/${key}?depth=10`, { headers: { 'X-Figma-Token': token } });

      // 429 Too Many Requests / 403 Forbidden → fall back to localStorage cache
      if (res.status === 429 || res.status === 403) {
        console.warn(`[FigmaService] HTTP ${res.status} from Figma — checking local cache…`);
        const cached = _loadDeepCache(key);
        if (cached) {
          console.warn(`[FigmaService] 📦 Использую локальную копию макета (Figma API Limit) — сохранено ${cached.savedAt}`);
          return { ..._buildScrapeResult(cached.data as Record<string, unknown>, new Map(Object.entries(cached.imageRefs))), fromCache: true };
        }
        console.warn('[FigmaService] No cache available — returning empty.');
        return EMPTY;
      }

      if (!res.ok) return EMPTY;
      let data: Record<string, unknown>;
      try { data = await res.json(); } catch { return EMPTY; }

      // ── Image resources: fetch imageRef → CDN URL map ─────────────────────
      let imageRefMap = new Map<string, string>();
      try {
        const imgRes = await fetch(`${BASE}/files/${key}/images`, { headers: { 'X-Figma-Token': token } });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const imgs = imgData.images as Record<string, string> | undefined;
          if (imgs) {
            imageRefMap = new Map(Object.entries(imgs));
            console.log(`[FigmaService] Image refs loaded: ${imageRefMap.size}`);
          }
        }
      } catch { /* Non-fatal — continue without image URLs */ }

      // Save to anti-429 cache before processing (non-blocking, fails silently)
      _saveDeepCache(key, data, Object.fromEntries(imageRefMap));

      return _buildScrapeResult(data, imageRefMap);
    } catch { return EMPTY; }
  },

  // ── Theme builder ────────────────────────────────────────────────────────

  buildProjectTheme(
    colors:     FigmaColorToken[],
    textStyles: FigmaTextStyle[],
    figmaFileKey: string,
    opts?: {
      rawColors?:       FigmaColorToken[];
      rawFonts?:        FigmaTextStyle[];
      isDeepScraped?:   boolean;
      targetMarket?:    TargetMarket;
      auditStrictness?: AuditStrictness;
      visualNodes?:     FigmaVisualNode[];
    },
  ): ProjectTheme {
    const cssVarLines  = colors.map(c => `  ${c.cssVar}: ${c.hex};`);
    const fontVarLines = textStyles.map(t => `  ${toFontVar(t.name)}: '${t.fontFamily}', sans-serif;`);
    const rawVarLines  = (opts?.rawColors ?? []).map(c => `  ${c.cssVar}: ${c.hex}; /* raw */`);
    const cssVars =
      ':root {\n' +
      [...cssVarLines, ...fontVarLines, ...rawVarLines].join('\n') +
      '\n}';

    const colorEntries = colors.map(c => ({ path: namePath(c.name), value: `var(${c.cssVar})` }));
    const fontEntries  = textStyles.map(t => ({ path: namePath(t.name), value: `['${t.fontFamily}', 'sans-serif']` }));
    const tailwindExtend = JSON.stringify(
      { colors: nestByPath(colorEntries), fontFamily: nestByPath(fontEntries) },
      null, 2,
    );

    return {
      figmaFileKey,
      syncedAt:        Date.now(),
      colors,
      textStyles,
      tailwindExtend,
      cssVars,
      rawColors:       opts?.rawColors,
      rawFonts:        opts?.rawFonts,
      isDeepScraped:   opts?.isDeepScraped,
      targetMarket:    opts?.targetMarket,
      auditStrictness: opts?.auditStrictness,
      visualNodes:     opts?.visualNodes,
    };
  },

  // ── AI context injector ──────────────────────────────────────────────────

  /**
   * Builds _figma_theme.css content injected into AI context on every call.
   *
   * Sections:
   *   1. CSS custom properties (published + raw)
   *   2. Tailwind extend reference
   *   3. Cultural palette audit (market × strictness)
   */
  injectFigmaContext(
    theme: ProjectTheme,
    opts?: { targetMarket?: TargetMarket; auditStrictness?: AuditStrictness },
  ): string {
    const market     = opts?.targetMarket    ?? theme.targetMarket    ?? 'GLOBAL';
    const strictness = opts?.auditStrictness ?? theme.auditStrictness ?? 'normal';
    const palette    = CULTURAL_PALETTES[market];
    const date       = new Date(theme.syncedAt).toISOString().slice(0, 10);

    const lines: string[] = [
      '/* ═══════════════════════════════════════════════════════════════',
      ` *  Figma Design Tokens  ·  synced ${date}`,
      ` *  File key: ${theme.figmaFileKey}`,
      theme.isDeepScraped
        ? ' *  ⚡ Source: deep node scan (no published styles found)'
        : ' *  ✦ Source: published Figma styles',
      ` *  Target market: ${market}  ·  Audit: ${strictness}`,
      ' * ═══════════════════════════════════════════════════════════════ */',
      '',
      '/* — CSS Custom Properties — */',
      theme.cssVars,
      '',
    ];

    if (theme.isDeepScraped && (theme.rawColors?.length ?? 0) > 0) {
      lines.push('/* — Note: raw variables were extracted from node fills, not published styles — */');
      lines.push('');
    }

    lines.push('/* — Tailwind extend (paste into tailwind.config.js) — */');
    lines.push('/* ' + theme.tailwindExtend + ' */');
    lines.push('');

    // Cultural audit block
    lines.push(
      '/* ─── Cultural Palette Audit ────────────────────────────────────────',
      ` *  Target: ${market}  ·  Strictness: ${strictness}`,
      ` *  ${palette.notes}`,
      ` *  Contrast standard: ${palette.contrastStandard}`,
      ' *',
    );

    const allColors = [
      ...theme.colors,
      ...(theme.rawColors ?? []),
    ].filter((c, i, arr) => arr.findIndex(x => x.hex === c.hex) === i).slice(0, 32);

    if (allColors.length > 0) {
      lines.push(' *  Color Analysis:');
      for (const col of allColors) {
        lines.push(' *    ' + auditColor(col.hex, market, strictness));
      }
      lines.push(' *');
    } else {
      lines.push(' *  (No colors extracted — palette audit skipped)');
      lines.push(' *');
    }

    const allFonts = [...new Set([
      ...theme.textStyles.map(t => t.fontFamily),
      ...(theme.rawFonts ?? []).map(t => t.fontFamily),
    ])];

    if (allFonts.length > 0) {
      lines.push(' *  Typography Audit:');
      for (const f of allFonts) {
        const match = palette.recommendedFonts.some(rf => f.toLowerCase().includes(rf.toLowerCase()));
        lines.push(match
          ? ` *    ✅ ${f} — aligns with ${market} design norms`
          : ` *    ◦  ${f} — verify cultural fit for ${market}`);
      }
      lines.push(' *');
    }

    lines.push(
      ` *  Recommended fonts for ${market}: ${palette.recommendedFonts.join(', ')}`,
      ' * ─── */',
    );

    return lines.join('\n');
  },

  // ── File duplication (best-effort, undocumented) ─────────────────────────

  async duplicateFile(_key: string, _token: string): Promise<{ ok: boolean; newKey?: string; url?: string }> {
    // POST /files/:key/duplicate is not an official Figma REST endpoint (returns 404).
    // File duplication requires the Figma Plugin API (running inside Figma desktop).
    // Return ok:false immediately to avoid a noisy 404 in the browser console.
    return { ok: false };
  },

  // ── Proxy scrape ─────────────────────────────────────────────────────────

  /**
   * Fetch complete design tokens + geometry from the Figma Proxy Edge Function.
   * Uses the Studio master token when no userToken is provided (public files).
   * Returns { ok: false, errorCode } if proxy is unavailable, rate-limited, or
   * file is truly private (requires user OAuth token).
   */
  async scrapeViaProxy(
    fileKey:    string,
    userToken?: string,
  ): Promise<{ ok: boolean; data?: ProxyUniversalResponse; errorCode?: string }> {
    try {
      const res = await proxyPost({ action: 'scrape', fileKey, userToken });
      if (res.status === 429) return { ok: false, errorCode: 'rate_limited' };
      if (res.status === 403) return { ok: false, errorCode: 'private_file' };
      if (res.status === 401) return { ok: false, errorCode: 'no_access' };
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `http_${res.status}` })) as { error?: string };
        return { ok: false, errorCode: err.error ?? 'proxy_error' };
      }
      const data = await res.json() as ProxyUniversalResponse;
      return { ok: true, data };
    } catch {
      return { ok: false, errorCode: 'proxy_unavailable' };
    }
  },

  // ── Main orchestrator ────────────────────────────────────────────────────

  async startSyncProcess(
    fileUrl:    string,
    onProgress: (p: SyncProgress) => void,
    opts?:      SyncOptions,
  ): Promise<SyncResult> {

    const step = (s: SyncStep, message: string, pct: number) =>
      onProgress({ step: s, message, pct });

    // ── Step 0: Proxy-first fast path ─────────────────────────────────────
    // Try the Studio Proxy Engine before any direct Figma API call.
    // Public files succeed without any user account (uses master token).
    const fileKey = FigmaClient.parseFileKey(fileUrl);
    if (fileKey) {
      step('checking', 'Connecting via Studio Proxy Engine…', 8);
      const userToken = IdentityService.getAll()[0]?.token;
      const proxyRes  = await this.scrapeViaProxy(fileKey, userToken);

      if (proxyRes.ok && proxyRes.data) {
        const { colors, textStyles, visualNodes, fileName, source } = proxyRes.data;
        const srcLabel = source === 'master_token' ? 'Studio Proxy' : 'Proxy';
        step('deep-scraping',
          `${srcLabel}: ${colors.length} color${colors.length !== 1 ? 's' : ''}, ` +
          `${textStyles.length} font${textStyles.length !== 1 ? 's' : ''}, ` +
          `${visualNodes.length} visual nodes`,
          70);

        const theme = this.buildProjectTheme(colors, textStyles, fileKey, {
          visualNodes, isDeepScraped: true,
          targetMarket:    opts?.targetMarket,
          auditStrictness: opts?.auditStrictness,
        });

        step('done',
          `Synced via ${srcLabel}: ${colors.length} colors, ${textStyles.length} fonts from "${fileName}"`,
          100);
        return { ok: true, theme, figmaUrl: fileUrl, syncSource: 'proxy' };
      }

      // Proxy soft-failed — log why and fall through to direct API
      if (proxyRes.errorCode === 'proxy_unavailable') {
        step('checking', 'Proxy unavailable — switching to direct Figma API…', 10);
      } else if (proxyRes.errorCode === 'private_file') {
        step('checking', 'Private file — verifying account access…', 10);
      } else if (proxyRes.errorCode === 'rate_limited') {
        step('checking', 'Proxy rate-limited — falling back to direct API + cache…', 10);
      } else {
        step('checking', 'Checking Figma access…', 10);
      }
    } else {
      step('checking', 'Checking Figma access…', 10);
    }
    // ─────────────────────────────────────────────────────────────────────

    // 1. Validate access (direct API fallback)
    const access = await FigmaClient.validateAccess(fileUrl);
    if (!access.hasAccess) {
      step('error', access.error ?? 'No account has access', 0);
      return { ok: false, error: access.error ?? 'No account has access', step: 'checking' };
    }
    // When usingProxy + no account, we bypass direct scraping steps below
    if (access.usingProxy && !access.account) {
      // The proxy probe succeeded for validation but full scrape is needed
      // Re-run scrapeViaProxy here (probe doesn't return full data)
      if (fileKey) {
        step('deep-scraping', 'Loading full design data via proxy…', 45);
        const fullRes = await this.scrapeViaProxy(fileKey);
        if (fullRes.ok && fullRes.data) {
          const { colors, textStyles, visualNodes, fileName } = fullRes.data;
          const theme = this.buildProjectTheme(colors, textStyles, fileKey, {
            visualNodes, isDeepScraped: true,
            targetMarket: opts?.targetMarket, auditStrictness: opts?.auditStrictness,
          });
          step('done', `Synced via Proxy: ${colors.length} colors, ${textStyles.length} fonts from "${fileName}"`, 100);
          return { ok: true, theme, figmaUrl: fileUrl, syncSource: 'proxy' };
        }
      }
      step('error', 'Proxy access confirmed but full sync failed', 0);
      return { ok: false, error: 'Proxy sync failed', step: 'deep-scraping' };
    }
    if (!access.account || !access.fileInfo) {
      step('error', access.error ?? 'No account has access', 0);
      return { ok: false, error: access.error ?? 'No account has access', step: 'checking' };
    }
    const { account, fileInfo } = access;
    const key = fileInfo.key;

    // 2. Permission check
    step('checking', 'Checking edit permissions…', 20);
    const role = await this.checkPermissions(key, account.token);

    // 3. Try published styles first
    step('scraping', 'Scraping published design tokens…', 35);
    let colors:      FigmaColorToken[] = [];
    let textStyles:  FigmaTextStyle[]  = [];
    let isDeepScraped                  = false;
    let rawColors:   FigmaColorToken[] | undefined;
    let rawFonts:    FigmaTextStyle[]  | undefined;
    let visualNodes: FigmaVisualNode[] = [];

    try {
      const scraped = await this.scrapeStyles(key, account.token);
      colors     = scraped.colors;
      textStyles = scraped.textStyles;
    } catch { /* non-fatal */ }

    // 4. Deep node scan — ALWAYS runs to capture layout geometry for Mirror View.
    //    Also serves as token fallback when published styles = 0.
    {
      const hasPublished = colors.length > 0 || textStyles.length > 0;
      step('deep-scraping',
        hasPublished
          ? 'Scanning Figma layout for Mirror View…'
          : 'No published styles — deep scanning nodes…',
        45);
      try {
        const deep = await this.deepScrapeNodes(key, account.token);
        visualNodes = deep.visualNodes;

        // Notify user when serving from cache (rate-limited)
        if (deep.fromCache) {
          step('deep-scraping', '📦 Использую локальную копию макета (Figma API Limit)', 46);
        }

        if (!hasPublished) {
          // Use deep scrape data as token fallback
          if (deep.colors.length > 0 || deep.textStyles.length > 0) {
            rawColors     = deep.colors;
            rawFonts      = deep.textStyles;
            colors        = deep.colors;
            textStyles    = deep.textStyles;
            isDeepScraped = true;
            step('deep-scraping',
              `Deep scan: ${colors.length} color${colors.length !== 1 ? 's' : ''}, ` +
              `${textStyles.length} text node${textStyles.length !== 1 ? 's' : ''}, ` +
              `${visualNodes.length} visual nodes` + (deep.fromCache ? ' (local cache)' : ''),
              58);
          } else {
            step('deep-scraping',
              `Layout scanned: ${visualNodes.length} visual nodes (no fill/text found)`,
              58);
          }
        } else {
          step('deep-scraping',
            `Mirror View ready: ${visualNodes.length} visual nodes`,
            58);
        }
      } catch { /* non-fatal */ }
    }

    // 5. Duplication / inject path
    let figmaUrl: string | undefined;
    if (role === 'editor' || role === 'owner') {
      step('injecting',
        'Edit access confirmed. Drawing to Figma requires the Plugin API — output page will be created when the Studio Plugin is installed.',
        75);
      figmaUrl = fileUrl;
    } else {
      step('duplicating', 'View-only access — cloning file to your account…', 65);
      const dup = await this.duplicateFile(key, account.token);
      if (dup.ok && dup.url) {
        step('injecting', 'Clone created! Studio will use the duplicate as output target.', 80);
        figmaUrl = dup.url;
      } else {
        step('injecting',
          'Could not duplicate (REST limitation). Tokens extracted; drawing requires the Plugin.',
          80);
      }
    }

    // 6. Build theme
    const theme = this.buildProjectTheme(colors, textStyles, key, {
      rawColors, rawFonts, isDeepScraped,
      targetMarket:    opts?.targetMarket,
      auditStrictness: opts?.auditStrictness,
      visualNodes,
    });

    const src = isDeepScraped ? ' (deep scan)' : '';
    step('done',
      `Synced ${colors.length} color${colors.length !== 1 ? 's' : ''}${src}, ` +
      `${textStyles.length} text style${textStyles.length !== 1 ? 's' : ''} from "${fileInfo.name}"`,
      100);

    return { ok: true, theme, figmaUrl, syncSource: 'direct' };
  },

  // ── applyChanges — push AI-audit fixes to Figma via Variables REST API ───

  /**
   * Applies a list of DesignChangeInput items to the Figma file.
   *
   * Strategy:
   *   1. Fetch local Figma Variables (GET /v1/files/:key/variables/local).
   *   2. For each color change: find the matching variable by hex value comparison.
   *   3. Batch updates (≤50 per request) via POST /v1/files/:key/variables.
   *   4. Sequential batches with 350 ms delay to avoid 429 errors.
   *   5. Non-variable / non-color changes → returned as pluginSpec for
   *      the AIC-RG Studio Figma Plugin.
   *
   * @param changes   Diffs to apply (from DesignDiffService or AI audit).
   * @param fileKey   Figma file key.
   * @param token     Figma PAT with write access.
   * @param onBatch   Progress callback (done, total, message).
   */
  async applyChanges(
    changes:  DesignChangeInput[],
    fileKey:  string,
    token:    string,
    onBatch:  (done: number, total: number, message: string) => void,
  ): Promise<ApplyBatchResult> {
    const result: ApplyBatchResult = { applied: 0, skipped: 0, errors: [] };

    // ── 1. Fetch existing Figma Variables ────────────────────────────────
    /** Map: hex → { variableId, modeId } for fast O(1) lookup */
    const hexToVar = new Map<string, { id: string; modeId: string; name: string }>();

    try {
      const varsRes = await fetch(`${BASE}/files/${fileKey}/variables/local`, {
        headers: { 'X-Figma-Token': token },
      });
      if (varsRes.ok) {
        const vd = await varsRes.json();
        const vars        = (vd.meta?.variables        ?? {}) as Record<string, any>;
        const collections = (vd.meta?.variableCollections ?? {}) as Record<string, any>;

        for (const v of Object.values(vars)) {
          if (v.resolvedType !== 'COLOR') continue;
          const col  = collections[v.variableCollectionId];
          const mode = col?.defaultModeId ?? Object.keys(col?.modes ?? {})[0] ?? '';
          const val  = v.valuesByMode?.[mode];
          if (!val) continue;
          // Convert stored rgb (0-1) back to hex for matching
          const hex = rgbToHex({ r: val.r, g: val.g, b: val.b, a: val.a ?? 1 });
          hexToVar.set(hex.toLowerCase(), { id: v.id, modeId: mode, name: v.name });
        }
        console.log(`[FigmaService] applyChanges: found ${hexToVar.size} color variables`);
      }
    } catch { /* non-fatal — proceed with empty variable map */ }

    // ── 2. Separate: variable-eligible color changes vs. plugin-only ─────
    const colorChanges = changes.filter(
      c => c.changeType === 'color' && c.field === 'fillColor' && typeof c.to === 'string',
    );
    const pluginOnly = changes.filter(
      c => !(c.changeType === 'color' && c.field === 'fillColor' && typeof c.to === 'string'),
    );

    // ── 3. Batch variable updates (50 per request) ────────────────────────
    const BATCH = 50;
    const batches: DesignChangeInput[][] = [];
    for (let i = 0; i < colorChanges.length; i += BATCH) {
      batches.push(colorChanges.slice(i, i + BATCH));
    }
    const totalBatches = batches.length + (pluginOnly.length > 0 ? 1 : 0);

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];

      const variableValues: Array<{
        variableId: string;
        modeId:     string;
        value:      { r: number; g: number; b: number; a: number };
      }> = [];
      const unmatched: DesignChangeInput[] = [];

      for (const ch of batch) {
        const fromHex = (typeof ch.from === 'string' ? ch.from : '').toLowerCase();
        const toHex   = (ch.to as string).toLowerCase();
        const varEntry = hexToVar.get(fromHex);

        if (varEntry) {
          const hex = toHex.replace('#', '').padEnd(6, '0');
          variableValues.push({
            variableId: varEntry.id,
            modeId:     varEntry.modeId,
            value: {
              r: parseInt(hex.slice(0, 2), 16) / 255,
              g: parseInt(hex.slice(2, 4), 16) / 255,
              b: parseInt(hex.slice(4, 6), 16) / 255,
              a: 1,
            },
          });
        } else {
          unmatched.push(ch);
          result.skipped++;
        }
      }

      // Push matched variable updates
      if (variableValues.length > 0) {
        try {
          const pushRes = await fetch(`${BASE}/files/${fileKey}/variables`, {
            method:  'POST',
            headers: { 'X-Figma-Token': token, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ variableValues }),
          });
          if (pushRes.ok) {
            result.applied += variableValues.length;
          } else {
            const errText = await pushRes.text().catch(() => pushRes.status.toString());
            result.errors.push(`Batch ${bi + 1}: HTTP ${pushRes.status} — ${errText.slice(0, 120)}`);
            result.skipped += variableValues.length;
          }
        } catch (err: any) {
          result.errors.push(`Batch ${bi + 1} network error: ${err.message}`);
          result.skipped += variableValues.length;
        }
      }

      onBatch(
        bi + 1,
        totalBatches,
        `Batch ${bi + 1}/${batches.length}: ${variableValues.length} variable update${variableValues.length !== 1 ? 's' : ''}` +
        (unmatched.length ? `, ${unmatched.length} unmatched → plugin spec` : ''),
      );

      // Rate-limit guard between batches
      if (bi < batches.length - 1) await applyDelay(350);
    }

    // ── 4. Build plugin spec for non-variable changes ─────────────────────
    const pluginItems = [
      ...pluginOnly,
      // unmatched color changes (variable not found for from-hex)
      ...colorChanges.filter(c => {
        const fromHex = (typeof c.from === 'string' ? c.from : '').toLowerCase();
        return !hexToVar.has(fromHex);
      }),
    ];

    if (pluginItems.length > 0) {
      result.pluginSpec = {
        version:  '1.0',
        fileKey,
        changes:  pluginItems.map(c => ({
          nodeId:   c.nodeId,
          nodeName: c.nodeName,
          field:    c.field,
          from:     c.from,
          to:       c.to,
          type:     c.changeType,
        })),
        note: 'Install the AIC-RG Studio Figma Plugin to apply these changes directly to nodes.',
      };

      onBatch(
        totalBatches,
        totalBatches,
        `${pluginItems.length} change${pluginItems.length !== 1 ? 's' : ''} require Figma Plugin → plugin spec ready`,
      );
    }

    return result;
  },
};

// ── Module-level helpers used by applyChanges ─────────────────────────────────

const applyDelay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

/**
 * figma-proxy — Supabase Edge Function
 *
 * Server-side Figma API proxy that eliminates:
 *   - Browser 429 rate limits (server IP has higher Figma quota)
 *   - CORS issues (token exchange, image fetching)
 *   - Manual PAT setup (uses FIGMA_MASTER_TOKEN for public files)
 *
 * Routes (dispatched via `action` field in POST body):
 *   scrape         — full design-token + geometry extraction → Universal JSON
 *   probe          — lightweight access check → fileName only
 *   oauth_start    — build Figma OAuth URL (keeps client_id server-side)
 *   oauth_callback — exchange code for access_token (keeps client_secret server-side)
 *
 * Required Supabase secrets (Dashboard → Settings → Edge Functions):
 *   FIGMA_MASTER_TOKEN  — Studio-owned PAT for public/community files
 *   FIGMA_CLIENT_ID     — Figma App client_id  (from developers.figma.com)
 *   FIGMA_CLIENT_SECRET — Figma App secret     (from developers.figma.com)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const FIGMA_BASE = 'https://api.figma.com/v1';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Deno type alias so the file compiles without @types/node ──────────────────
declare const Deno: { env: { get(key: string): string | undefined } };

// ── Figma API types ───────────────────────────────────────────────────────────

interface RgbaColor { r: number; g: number; b: number; a?: number }

interface FigmaPaint {
  type:           string;
  color?:         RgbaColor;
  opacity?:       number;
  visible?:       boolean;
  gradientStops?: Array<{ position: number; color: RgbaColor }>;
  imageRef?:      string;
}

interface FigmaNodeStyle {
  fontFamily?:     string;
  fontSize?:       number;
  fontWeight?:     number;
  lineHeightPx?:   number;
  lineHeightUnit?: string;
}

interface FigmaEffect {
  type:     string;
  visible?: boolean;
  radius?:  number;
  color?:   RgbaColor;
  offset?:  { x: number; y: number };
}

interface FigmaNode {
  id:          string;
  name?:       string;
  type:        string;
  fills?:      FigmaPaint[];
  strokes?:    FigmaPaint[];
  children?:   FigmaNode[];
  style?:      FigmaNodeStyle;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  opacity?:    number;
  cornerRadius?: number;
  effects?:    FigmaEffect[];
  layoutMode?: string;
  characters?: string;
}

// ── Universal JSON types (match frontend FigmaService types exactly) ───────────

interface FigmaColorToken {
  styleId: string; name: string; cssVar: string;
  hex: string; r: number; g: number; b: number; a: number;
}

interface FigmaTextStyle {
  styleId: string; name: string;
  fontFamily: string; fontSize: number; fontWeight: number;
  lineHeight: number | 'auto';
}

interface FigmaVisualNode {
  id: string; name: string; type: string; depth: number;
  x: number; y: number; width: number; height: number;
  fillColor?: string; fillGradient?: string; fillOpacity?: number;
  cornerRadius?: number; strokeColor?: string; strokeWidth?: number;
  opacity?: number; isFrame?: boolean;
  shadowCss?: string; blurPx?: number;
  text?: string; fontSize?: number; fontFamily?: string; fontWeight?: number;
  imageUrl?: string;
  autoLayout?: 'HORIZONTAL' | 'VERTICAL';
  children?: FigmaVisualNode[];
}

interface UniversalJSON {
  fileName:    string;
  colors:      FigmaColorToken[];
  textStyles:  FigmaTextStyle[];
  visualNodes: FigmaVisualNode[];
  imageRefs:   Record<string, string>;
  fromCache:   boolean;
  source:      'user_token' | 'master_token';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rgbToHex({ r, g, b }: RgbaColor): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function toCssVar(name: string): string {
  return '--' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function mapNode(node: FigmaNode, depth = 0, imgMap?: Map<string, string>): FigmaVisualNode | null {
  if (depth > 8) return null;
  const bb = node.absoluteBoundingBox;
  if (!bb || bb.width <= 0 || bb.height <= 0) return null;

  const visibleFills = (node.fills ?? []).filter(f => f.visible !== false);

  let fillColor: string | undefined;
  let fillGradient: string | undefined;
  let fillOpacity: number | undefined;
  let imageUrl: string | undefined;

  const solid = visibleFills.find(f => f.type === 'SOLID' && f.color);
  if (solid?.color) { fillColor = rgbToHex(solid.color); fillOpacity = solid.opacity; }

  if (!fillColor) {
    const linGrad = visibleFills.find(f => f.type === 'LINEAR_GRADIENT' && f.gradientStops?.length);
    if (linGrad?.gradientStops) {
      const stops = linGrad.gradientStops
        .map(s => `${rgbToHex(s.color)}${Math.round((s.color.a ?? 1) * 255).toString(16).padStart(2,'0')} ${Math.round(s.position * 100)}%`)
        .join(', ');
      fillGradient = `linear-gradient(135deg, ${stops})`;
    }
    const radGrad = !fillGradient ? visibleFills.find(f => f.type === 'RADIAL_GRADIENT' && f.gradientStops?.length) : undefined;
    if (radGrad?.gradientStops) {
      const stops = radGrad.gradientStops
        .map(s => `${rgbToHex(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      fillGradient = `radial-gradient(ellipse at center, ${stops})`;
    }
  }

  const imgFill = visibleFills.find(f => f.type === 'IMAGE' && f.imageRef);
  if (imgFill?.imageRef && imgMap) imageUrl = imgMap.get(imgFill.imageRef);

  const visStrokes = (node.strokes ?? []).filter(s => s.visible !== false && s.type === 'SOLID' && s.color);
  const strokeColor = visStrokes[0]?.color ? rgbToHex(visStrokes[0].color) : undefined;

  let shadowCss: string | undefined;
  let blurPx:    number | undefined;
  for (const eff of (node.effects ?? [])) {
    if (eff.visible === false) continue;
    if (eff.type === 'DROP_SHADOW' && eff.color) {
      const { r, g, b, a = 1 } = eff.color;
      const { x = 0, y = 4 } = eff.offset ?? {};
      shadowCss = `${x}px ${y}px ${eff.radius ?? 8}px rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a.toFixed(2)})`;
    }
    if (eff.type === 'LAYER_BLUR') blurPx = eff.radius;
  }

  let text: string | undefined, fontSize: number | undefined, fontFamily: string | undefined, fontWeight: number | undefined;
  if (node.type === 'TEXT' && node.characters) {
    text = node.characters.slice(0, 200);
    fontSize = node.style?.fontSize; fontFamily = node.style?.fontFamily; fontWeight = node.style?.fontWeight;
  }

  const vnode: FigmaVisualNode = {
    id: node.id, name: node.name ?? '', type: node.type, depth,
    x: bb.x, y: bb.y, width: bb.width, height: bb.height,
    fillColor, fillGradient, fillOpacity,
    cornerRadius: node.cornerRadius,
    strokeColor, strokeWidth: strokeColor ? 1 : undefined,
    opacity: (node.opacity !== undefined && node.opacity < 1) ? node.opacity : undefined,
    isFrame: node.type === 'FRAME' || node.type === 'COMPONENT',
    shadowCss, blurPx,
    text, fontSize, fontFamily, fontWeight, imageUrl,
    autoLayout: (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL')
      ? node.layoutMode as 'HORIZONTAL' | 'VERTICAL' : undefined,
  };

  if (node.children?.length && depth < 7) {
    const kids: FigmaVisualNode[] = [];
    for (const child of node.children) {
      const m = mapNode(child, depth + 1, imgMap);
      if (m) kids.push(m);
    }
    if (kids.length) vnode.children = kids;
  }
  return vnode;
}

function flattenTree(roots: FigmaVisualNode[]): FigmaVisualNode[] {
  const out: FigmaVisualNode[] = [];
  const stack = [...roots];
  while (stack.length) {
    const n = stack.shift()!;
    out.push(n);
    if (n.children) stack.unshift(...n.children);
  }
  return out;
}

function buildUniversalJSON(
  fileData:  Record<string, unknown>,
  imgRefs:   Record<string, string>,
  fileName:  string,
  source:    'user_token' | 'master_token',
): UniversalJSON {
  const doc = fileData.document as FigmaNode | undefined;
  const EMPTY: UniversalJSON = { fileName, colors: [], textStyles: [], visualNodes: [], imageRefs: imgRefs, fromCache: false, source };
  if (!doc) return EMPTY;

  const colorMap = new Map<string, FigmaColorToken>();
  const fontMap  = new Map<string, FigmaTextStyle>();

  const walkDNA = (node: FigmaNode, d = 0) => {
    if (d > 14) return;
    for (const fill of (node.fills ?? []).filter(f => f.visible !== false)) {
      if (fill.type === 'SOLID' && fill.color && colorMap.size < 60) {
        const hex = rgbToHex(fill.color);
        if (!colorMap.has(hex)) {
          const rawName = `raw/${(node.name ?? hex).slice(0, 40).replace(/[^a-zA-Z0-9 /_-]/g, '')}`;
          colorMap.set(hex, { styleId: `raw-${colorMap.size}`, name: rawName, cssVar: toCssVar(rawName), hex, r: fill.color.r, g: fill.color.g, b: fill.color.b, a: fill.opacity ?? fill.color.a ?? 1 });
        }
      }
      if ((fill.type === 'LINEAR_GRADIENT' || fill.type === 'RADIAL_GRADIENT') && fill.gradientStops) {
        for (const stop of fill.gradientStops) {
          if (colorMap.size >= 60) break;
          const hex = rgbToHex(stop.color);
          if (!colorMap.has(hex)) {
            const rawName = `raw/gradient-${colorMap.size}`;
            colorMap.set(hex, { styleId: `raw-${colorMap.size}`, name: rawName, cssVar: toCssVar(rawName), hex, r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a ?? 1 });
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
    for (const child of (node.children ?? [])) walkDNA(child, d + 1);
  };
  walkDNA(doc);

  const imgMap = new Map(Object.entries(imgRefs));
  const pages = (doc.children ?? []).filter(c => c.type === 'CANVAS');
  const primaryPage = pages[0];
  let visualNodes: FigmaVisualNode[] = [];

  if (primaryPage?.children) {
    const frameRoots: FigmaVisualNode[] = [];
    for (const topNode of primaryPage.children) {
      const mapped = mapNode(topNode, 0, imgMap);
      if (mapped) frameRoots.push(mapped);
    }
    const flat = flattenTree(frameRoots);
    visualNodes = flat.slice(0, 500);
  }

  return { fileName, colors: [...colorMap.values()], textStyles: [...fontMap.values()], visualNodes, imageRefs: imgRefs, fromCache: false, source };
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleScrape(body: { fileKey?: string; userToken?: string }): Promise<Response> {
  const { fileKey, userToken } = body;
  if (!fileKey) return jsonError('fileKey is required', 400);

  const masterToken = Deno.env.get('FIGMA_MASTER_TOKEN');
  const token  = userToken ?? masterToken;
  const source: 'user_token' | 'master_token' = userToken ? 'user_token' : 'master_token';
  if (!token) return jsonError('FIGMA_MASTER_TOKEN not configured', 500);

  const fileRes = await fetch(`${FIGMA_BASE}/files/${fileKey}?depth=10`, {
    headers: { 'X-Figma-Token': token },
  });
  if (fileRes.status === 429) return jsonError('rate_limited', 429);
  if (fileRes.status === 403) return jsonError('private_file', 403);
  if (fileRes.status === 401) return jsonError('no_access', 401);
  if (!fileRes.ok) return jsonError(`figma_error_${fileRes.status}`, fileRes.status);

  const fileData = await fileRes.json() as Record<string, unknown>;
  const fileName = (fileData.name as string | undefined) ?? 'Untitled';

  // Fetch image refs in parallel (non-fatal if it fails)
  let imgRefs: Record<string, string> = {};
  try {
    const imgRes = await fetch(`${FIGMA_BASE}/files/${fileKey}/images`, {
      headers: { 'X-Figma-Token': token },
    });
    if (imgRes.ok) {
      const d = await imgRes.json();
      imgRefs = (d.images as Record<string, string> | undefined) ?? {};
    }
  } catch { /* non-fatal */ }

  const result = buildUniversalJSON(fileData, imgRefs, fileName, source);
  return jsonOk(result);
}

async function handleProbe(body: { fileKey?: string; userToken?: string }): Promise<Response> {
  const { fileKey, userToken } = body;
  if (!fileKey) return jsonError('fileKey is required', 400);

  const masterToken = Deno.env.get('FIGMA_MASTER_TOKEN');
  const token  = userToken ?? masterToken;
  if (!token) return jsonError('FIGMA_MASTER_TOKEN not configured', 500);

  const res = await fetch(`${FIGMA_BASE}/files/${fileKey}?depth=1`, {
    headers: { 'X-Figma-Token': token },
  });
  if (res.status === 429) return jsonError('rate_limited', 429);
  if (res.status === 403) return jsonError('private_file', 403);
  if (res.status === 401) return jsonError('no_access', 401);
  if (!res.ok) return jsonError(`figma_error_${res.status}`, res.status);

  const data = await res.json();
  return jsonOk({
    ok:       true,
    fileName: (data.name as string | undefined) ?? 'Untitled',
    source:   userToken ? 'user_token' : 'master_token',
  });
}

async function handleOAuthStart(body: { redirectUri?: string; state?: string }): Promise<Response> {
  const { redirectUri, state } = body;
  if (!redirectUri || !state) return jsonError('redirectUri and state are required', 400);

  const clientId = Deno.env.get('FIGMA_CLIENT_ID');
  if (!clientId) return jsonError('FIGMA_CLIENT_ID not configured — register at developers.figma.com', 500);

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         'file_read',
    state,
    response_type: 'code',
  });
  return jsonOk({ authUrl: `https://www.figma.com/oauth?${params}` });
}

async function handleOAuthCallback(body: { code?: string; redirectUri?: string }): Promise<Response> {
  const { code, redirectUri } = body;
  if (!code || !redirectUri) return jsonError('code and redirectUri are required', 400);

  const clientId     = Deno.env.get('FIGMA_CLIENT_ID');
  const clientSecret = Deno.env.get('FIGMA_CLIENT_SECRET');
  if (!clientId || !clientSecret) return jsonError('OAuth not configured on server', 500);

  const tokenRes = await fetch('https://api.figma.com/v1/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      code,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('[figma-proxy] OAuth exchange failed:', tokenRes.status, errText);
    return jsonError(`token_exchange_failed: ${errText}`, 400);
  }

  const d = await tokenRes.json();
  return jsonOk({
    accessToken:  d.access_token,
    refreshToken: d.refresh_token,
    expiresIn:    d.expires_in,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonError('POST only', 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 400); }

  const action = (body.action as string | undefined) ?? 'scrape';
  if (action === 'scrape')         return handleScrape(body as { fileKey?: string; userToken?: string });
  if (action === 'probe')          return handleProbe(body as { fileKey?: string; userToken?: string });
  if (action === 'oauth_start')    return handleOAuthStart(body as { redirectUri?: string; state?: string });
  if (action === 'oauth_callback') return handleOAuthCallback(body as { code?: string; redirectUri?: string });

  return jsonError(`Unknown action: ${action}`, 400);
});

/**
 * DesignContract — pack resolver + theme materialization + design validator.
 *
 * Pipeline integration point that turns the prototype-bank from "files in repo"
 * into an enforced contract:
 *
 *   1. resolveDesignContext(prompt, skeletonId)
 *        → picks an archetype, an optional domain, a surface mood, contrast,
 *          radius, and produces the materialized CSS variables for the
 *          generated theme.
 *
 *   2. archetypeContextForArchitect(ctx)  → string injected into architect
 *      prompt so the planner aligns with the chosen pack.
 *
 *   3. designContractForCoder(ctx) → string injected into coder prompt
 *      forbidding raw colors and listing the semantic tokens that MUST be used.
 *
 *   4. themeFile(ctx) → returns the synthetic delta file that materializes
 *      ThemeEngine output (preview-workspace/src/styles/generated-theme.css).
 *
 *   5. validateDesignContract(files) → rejects any generated file using:
 *        - Raw hex colours  (#fff, #abc123…)
 *        - rgb/rgba/hsl/hsla literals in className strings
 *        - Tailwind semantic-less colour utilities (bg-blue-500, text-red-600 …)
 *        - Generic "blank Tailwind" fallback (bg-white text-black w/o tokens)
 *
 *      Returns { ok: true } or { ok: false, violations: [...] }.
 *
 * Behaviour is deterministic — no LLM call is made for pack selection.
 */

import {
  PrototypeBankService,
  type ArchetypeManifest,
  type DomainManifest,
} from './PrototypeBankService';
import {
  resolveFileVisualSelection,
  type NormalizedVisualBank,
  type NormalizedVisualPack,
  type VisualSelection,
} from './FileVisualBankService';
import { generateTheme, type DesignIntent, type ThemeMood } from './ThemeEngine';
import type { SkeletonId } from './SkeletonRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignContext {
  archetype: ArchetypeManifest | null;
  domain:    DomainManifest    | null;
  intent:    DesignIntent;
  visualSelection: VisualSelection;
  fallbackVisualSelection: boolean;
  /** Materialised theme: name + cssVars block + tailwindExtend */
  theme: ReturnType<typeof generateTheme>;
}

export interface ResolveDesignContextOptions {
  projectId?: string;
  semanticDomainId?: string | null;
  surface?: string | null;
  subdomain?: string | null;
  tone?: string | null;
  visualBankOverride?: NormalizedVisualBank;
  visualPacksOverride?: NormalizedVisualPack[];
}

export interface DesignViolation {
  path:    string;
  rule:    string;
  example: string;
  line?:   number;
}

// ─── Pack resolver ────────────────────────────────────────────────────────────

const ARCHETYPE_BY_SKELETON: Record<SkeletonId, string> = {
  'mobile-app':         'consumer-feed',
  'saas-dashboard':     'dashboard-workspace',
  'landing-page':       'consumer-feed',
  'social-community':   'consumer-feed',
  'productivity-tool':  'dashboard-workspace',
  'ecommerce':          'consumer-feed',
};

const DOMAIN_KEYWORDS: Array<{ id: string; rx: RegExp }> = [
  { id: 'medicine', rx: /\b(med|health|clinic|patient|doctor|appointment|prescription|hospital|медиц|здоров|пациент|врач|клиник)/i },
  { id: 'fintech',  rx: /\b(bank|finance|wallet|crypto|payment|invoice|budget|transaction|финанс|банк|кошел|бюдж|перевод|транзак)/i },
  { id: 'gaming',   rx: /\b(game|play|leaderboard|xp|achievement|quest|игр|лидер|достиж)/i },
  { id: 'wellness', rx: /\b(meditat|mindful|yoga|fitness|habit|mood|медитац|йога|трениров|привыч|настроени)/i },
  { id: 'social',   rx: /\b(social|feed|post|follow|like|comment|story|chat\s*room|соцсет|лента|подпис|пост|коммент)/i },
  { id: 'ai-tools', rx: /\b(ai|gpt|llm|prompt|generate|assistant|copilot|нейро|ассистент|генерац)/i },
];

const MOOD_BY_DOMAIN: Record<string, ThemeMood> = {
  medicine: 'calm',
  fintech:  'corporate',
  gaming:   'playful',
  wellness: 'calm',
  social:   'playful',
  'ai-tools': 'corporate',
};

function pickDomainId(prompt: string): string | null {
  for (const { id, rx } of DOMAIN_KEYWORDS) {
    if (rx.test(prompt)) return id;
  }
  return null;
}

function pickMood(domainId: string | null, prompt: string): ThemeMood {
  if (domainId && MOOD_BY_DOMAIN[domainId]) return MOOD_BY_DOMAIN[domainId];
  if (/\b(luxury|premium|elite|élite)\b/i.test(prompt)) return 'luxury';
  if (/\b(brutal|bold|raw)\b/i.test(prompt))            return 'brutal';
  if (/\b(playful|fun|kids|игр)\b/i.test(prompt))       return 'playful';
  if (/\b(calm|zen|spa|медитац)\b/i.test(prompt))       return 'calm';
  return 'corporate';
}

export async function resolveDesignContext(
  prompt: string,
  skeletonId: SkeletonId,
  options: ResolveDesignContextOptions = {},
): Promise<DesignContext> {
  const archetypeId = ARCHETYPE_BY_SKELETON[skeletonId] ?? null;
  const archetype   = archetypeId ? await PrototypeBankService.getArchetype(archetypeId) : null;
  const domainId    = options.semanticDomainId ?? pickDomainId(prompt);
  const domain      = domainId ? await PrototypeBankService.getDomain(domainId) : null;
  const visualSelection = resolveFileVisualSelection({
    brief: prompt,
    skeletonId,
    projectId: options.projectId,
    semanticDomainId: domainId,
    semanticDomain: domain,
    surface: options.surface,
    subdomain: options.subdomain,
    tone: options.tone,
    visualBankOverride: options.visualBankOverride,
    visualPacksOverride: options.visualPacksOverride,
  });

  const mood = visualSelection.fallbackVisualSelection
    ? pickMood(domainId, prompt)
    : moodFromVisualSelection(visualSelection);
  const intent: DesignIntent = {
    mood,
    contrast: contrastFromVisualSelection(visualSelection, mood),
    radius:   radiusFromVisualSelection(visualSelection, mood),
    colorTokens: visualSelection.colorFamilyTokens,
    seed:     visualSelection.variationSeed || `${skeletonId}:${domainId ?? 'generic'}`,
  };
  const theme = generateTheme(intent);

  return {
    archetype,
    domain,
    intent,
    visualSelection,
    fallbackVisualSelection: visualSelection.fallbackVisualSelection,
    theme,
  };
}

function moodFromVisualSelection(selection: VisualSelection): ThemeMood {
  const text = [
    selection.selectedVariantId,
    selection.theme,
    selection.trustProfile,
    selection.toneProfile,
    selection.colorFamily,
    selection.targetUsers,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/(fintech|finance|financial|corporate|bank|compliance)/.test(text)) return 'corporate';
  if (/(clinical|medical|health|patient|care|calm|soft|wellness)/.test(text)) return 'calm';
  if (/(playful|creator|social|game|fun)/.test(text)) return 'playful';
  if (/(brutal|minimal|sharp)/.test(text)) return 'brutal';
  if (/(premium|luxury|elite|dark)/.test(text)) return 'luxury';
  return 'corporate';
}

function contrastFromVisualSelection(
  selection: VisualSelection,
  mood: ThemeMood,
): NonNullable<DesignIntent['contrast']> {
  const text = [
    selection.selectedVariantId,
    selection.toneProfile,
    selection.colorFamily,
    selection.theme,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/(premium|dark|brutal|minimal|fintech)/.test(text)) return 'high';
  if (/(soft|calm|clinical|wellness)/.test(text)) return 'low';
  return mood === 'luxury' || mood === 'brutal' ? 'high' : 'medium';
}

function radiusFromVisualSelection(
  selection: VisualSelection,
  mood: ThemeMood,
): NonNullable<DesignIntent['radius']> {
  const radiusText = typeof selection.radius === 'string'
    ? selection.radius
    : JSON.stringify(selection.radius);
  const text = `${selection.selectedVariantId} ${selection.toneProfile} ${radiusText}`.toLowerCase();
  if (/9999|full|pill|rounded/.test(text)) return 'pill';
  if (/\b(4px|6px|8px|sharp|brutal|minimal|corporate|clinical)\b/.test(text)) return 'sharp';
  return mood === 'brutal' ? 'sharp' : mood === 'playful' ? 'pill' : 'soft';
}

function visualSelectionPromptBlock(
  selection: VisualSelection,
  audience: 'architect' | 'coder',
): string {
  const lines = [
    '',
    'VISUAL_BANK_SELECTION:',
    `selectedPackId: ${selection.selectedPackId}`,
    `selectedVariantId: ${selection.selectedVariantId}`,
    `selectedVariantPath: ${selection.selectedVariantPath ?? '(none)'}`,
    `selectedManifestPath: ${selection.selectedManifestPath ?? '(none)'}`,
    `compatibleSkeletons: ${inlineList(selection.compatibleSkeletons)}`,
    `domains: ${inlineList(selection.domains)}`,
    `subdomains: ${inlineList(selection.subdomains)}`,
    `surfaces: ${inlineList(selection.surfaces)}`,
    `trustProfile: ${selection.trustProfile}`,
    `toneProfile: ${selection.toneProfile}`,
    `productTone: ${formatJson(selection.productTone)}`,
    `theme: ${selection.theme}`,
    `colorFamily: ${selection.colorFamily}`,
    `colorTokens: ${formatJson(selection.colorFamilyTokens)}`,
    `spacing: ${selection.spacing}`,
    `typography: ${selection.typography}`,
    `radius: ${formatJson(selection.radius)}`,
    `radiusProfile: ${selection.radiusProfile}`,
    `motionPreset: ${selection.motionPreset}`,
    `densityProfile: ${selection.densityProfile}`,
    `contrastProfile: ${selection.contrastProfile}`,
    `variationPreset: ${formatJson(selection.variationPreset)}`,
    `antiRepeatGroup: ${selection.antiRepeatGroup}`,
    `selectionPipeline: ${selection.audit.pipelineStages.map(stage => stage.stage).join(' > ')}`,
    arrayBlock('tokenHints', selection.tokenHints),
    arrayBlock('componentHints', selection.componentHints),
    arrayBlock('layoutHints', selection.layoutHints),
    arrayBlock('forbiddenPatterns', selection.forbiddenPatterns),
    arrayBlock('requiredFiles', selection.requiredFiles),
    arrayBlock('sourceFiles', selection.sourceFiles),
    `fallbackVisualSelection: ${selection.fallbackVisualSelection}`,
  ];

  if (audience === 'coder') {
    lines.push(
      '',
      'CODER VISUAL BANK INSTRUCTIONS:',
      '- Use this selected visual variant as the source of design truth.',
      '- Do not invent a separate visual system if fallbackVisualSelection is false.',
      '- Respect spacing, typography, radius, motionPreset, colorFamily, componentHints, and layoutHints.',
      '- Use the selected colorTokens as the full palette: background, foreground, muted, card, primary, secondary, accent, border, success, warning, danger, and chartPalette.',
      '- Apply variationPreset consistently for spacing, radius, elevation, motion, and block emphasis.',
      '- Do not use forbiddenPatterns.',
      '- If requiredFiles/sourceFiles are provided, copy, import, or adapt them into generated output where applicable.',
    );
  }

  return lines.join('\n');
}

function inlineList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}

function arrayBlock(label: string, values: readonly string[]): string {
  if (values.length === 0) return `${label}: []`;
  return `${label}:\n${values.map(value => `  - ${value}`).join('\n')}`;
}

function formatJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// ─── Prompt fragments ─────────────────────────────────────────────────────────

export function archetypeContextForArchitect(ctx: DesignContext): string {
  const lines: string[] = [];
  if (ctx.archetype) {
    lines.push(
      `ARCHETYPE: ${ctx.archetype.name} (${ctx.archetype.id})`,
      `  description: ${ctx.archetype.description}`,
      `  navigation:  ${ctx.archetype.navigation}`,
      `  must include: ${ctx.archetype.includes.join('; ')}`,
      `  must NOT do:  ${(ctx.archetype.forbids ?? []).join('; ') || '(none)'}`,
      `  required modules: ${ctx.archetype.requiredModules.join(', ') || '(none)'}`,
    );
  }
  if (ctx.domain) {
    lines.push(
      ``,
      `DOMAIN: ${ctx.domain.name} (${ctx.domain.id})`,
      `  entities:        ${ctx.domain.entities.join(', ')}`,
      `  typical flows:   ${ctx.domain.typicalFlows.slice(0, 4).join(' | ')}`,
      `  ui patterns:     ${ctx.domain.uiPatterns.slice(0, 4).join(' | ')}`,
      `  restrictions:    ${ctx.domain.restrictions.join('; ') || '(none)'}`,
    );
  }
  lines.push(visualSelectionPromptBlock(ctx.visualSelection, 'architect'));
  if (lines.length === 0) return '';
  return `\nPACK CONTEXT — your plan MUST satisfy this:\n${lines.join('\n')}\n`;
}

export function designContractForCoder(ctx: DesignContext): string {
  const tokenList = [
    'bg-background', 'text-foreground',
    'bg-card text-card-foreground',
    'bg-primary text-primary-foreground',
    'bg-secondary text-secondary-foreground',
    'bg-muted text-muted-foreground',
    'bg-accent text-accent-foreground',
    'bg-destructive text-destructive-foreground',
    'border-border', 'ring-ring',
  ];

  const archetypeSection = ctx.archetype
    ? `\nARCHETYPE REFERENCE — ${ctx.archetype.name} (${ctx.archetype.id})\n` +
      `  Available prebuilt components (import these, do NOT recreate):\n` +
      ctx.archetype.includes.slice(0, 6).map(i => `    • ${i}`).join('\n') + '\n' +
      `  Navigation: ${ctx.archetype.navigation}  |  Entities: ${ctx.archetype.entities.slice(0, 4).join(', ')}\n`
    : '';

  const domainSection = ctx.domain
    ? `\nDOMAIN CONSTRAINTS — ${ctx.domain.name}\n` +
      ctx.domain.restrictions.slice(0, 4).map(r => `  • ${r}`).join('\n') + '\n'
    : '';

  return `
DESIGN CONTRACT — ENFORCED BY VALIDATOR (your build will fail if you break this)

Theme: ${ctx.theme.name}  (mood=${ctx.intent.mood}, contrast=${ctx.intent.contrast}, radius=${ctx.intent.radius})
${visualSelectionPromptBlock(ctx.visualSelection, 'coder')}
${archetypeSection}${domainSection}
You may use ONLY these semantic Tailwind utilities for colour and surfaces:
  ${tokenList.join('  ')}

FORBIDDEN — any of these will fail validation:
  • Raw hex colours in JSX/className  (e.g. "#0ea5e9", style={{color:'#fff'}})
  • Raw rgb()/rgba()/hsl()/hsla() literals in className or inline style
  • Tailwind palette utilities like  bg-blue-500, text-red-600, border-emerald-400, bg-gray-50
  • Generic blank fallback such as  className="bg-white text-black"
    (use bg-background text-foreground instead)

Use lucide-react icons; choose Tailwind radius utilities that match VISUAL_BANK_SELECTION.radius;
respect the archetype's navigation choice (do NOT add a sidebar to a bottom-tabs app and vice versa).
`.trim() + '\n';
}

// ─── Theme materialisation ────────────────────────────────────────────────────

const THEME_FILE_PATH = 'styles/generated-theme.css';

export function themeFile(ctx: DesignContext): { path: string; content: string } {
const content = `/* AUTO-GENERATED by DesignContract — do not edit by hand. */
/* mood=${ctx.intent.mood} contrast=${ctx.intent.contrast} radius=${ctx.intent.radius} */
/* visualBank=${ctx.visualSelection.selectedPackId}/${ctx.visualSelection.selectedVariantId} colorFamily=${ctx.visualSelection.colorFamily} variation=${ctx.visualSelection.variationPreset.id} fallback=${ctx.visualSelection.fallbackVisualSelection} */
${ctx.theme.cssVars}
`;
  return { path: THEME_FILE_PATH, content };
}

// ─── Validator ────────────────────────────────────────────────────────────────

const HEX_RX        = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN_RX   = /\b(rgb|rgba|hsl|hsla)\s*\(/;
const TW_PALETTE_RX = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|placeholder|caret|accent|outline|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/;
const GENERIC_FALLBACK_RX = /\b(?:bg|text)-(?:white|black)\b/;

const SAFE_FILE_RX = /\.(css|svg|json|md)$/i;

/**
 * @param ctx — design context (used to whitelist the auto-generated theme file
 *              which legitimately defines hsl() / hex colours).
 */
export function validateDesignContract(
  files: Record<string, string>,
  ctx: DesignContext | null = null,
): { ok: true } | { ok: false; violations: DesignViolation[] } {
  const violations: DesignViolation[] = [];
  const themePath = ctx ? themeFile(ctx).path : THEME_FILE_PATH;

  for (const [path, content] of Object.entries(files)) {
    if (path === themePath || path.endsWith('/' + themePath)) continue;
    if (SAFE_FILE_RX.test(path)) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Only inspect lines that look like JSX/style usage to keep noise low —
      // skip comments and import lines.
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) continue;

      const inClassNameOrStyle =
        /className\s*=/.test(line) ||
        /\bclass\s*=/.test(line)   ||
        /style\s*=/.test(line)     ||
        /\bcn\(/.test(line)        ||
        /\bclsx\(/.test(line);

      if (HEX_RX.test(line) && inClassNameOrStyle) {
        violations.push({ path, rule: 'no-raw-hex', line: i + 1, example: line.trim().slice(0, 140) });
      }
      if (COLOR_FN_RX.test(line) && inClassNameOrStyle) {
        violations.push({ path, rule: 'no-raw-color-fn', line: i + 1, example: line.trim().slice(0, 140) });
      }
      if (TW_PALETTE_RX.test(line)) {
        violations.push({ path, rule: 'no-tailwind-palette', line: i + 1, example: line.trim().slice(0, 140) });
      }
      if (GENERIC_FALLBACK_RX.test(line) && inClassNameOrStyle) {
        violations.push({ path, rule: 'no-generic-fallback', line: i + 1, example: line.trim().slice(0, 140) });
      }
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export function describeViolations(v: DesignViolation[], maxItems = 12): string {
  return v
    .slice(0, maxItems)
    .map(x => `  ${x.path}:${x.line ?? '?'}  [${x.rule}]  ${x.example}`)
    .join('\n');
}

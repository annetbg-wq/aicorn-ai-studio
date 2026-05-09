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
import { generateTheme, type DesignIntent, type ThemeMood } from './ThemeEngine';
import type { SkeletonId } from './SkeletonRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignContext {
  archetype: ArchetypeManifest | null;
  domain:    DomainManifest    | null;
  intent:    DesignIntent;
  /** Materialised theme: name + cssVars block + tailwindExtend */
  theme: ReturnType<typeof generateTheme>;
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
): Promise<DesignContext> {
  const archetypeId = ARCHETYPE_BY_SKELETON[skeletonId] ?? null;
  const archetype   = archetypeId ? await PrototypeBankService.getArchetype(archetypeId) : null;
  const domainId    = pickDomainId(prompt);
  const domain      = domainId ? await PrototypeBankService.getDomain(domainId) : null;

  const mood = pickMood(domainId, prompt);
  const intent: DesignIntent = {
    mood,
    contrast: mood === 'luxury' || mood === 'brutal' ? 'high' : 'medium',
    radius:   mood === 'brutal' ? 'sharp' : mood === 'playful' ? 'pill' : 'soft',
    seed:     `${skeletonId}:${domainId ?? 'generic'}`,
  };
  const theme = generateTheme(intent);

  return { archetype, domain, intent, theme };
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
  return `
DESIGN CONTRACT — ENFORCED BY VALIDATOR (your build will fail if you break this)

Theme: ${ctx.theme.name}  (mood=${ctx.intent.mood}, contrast=${ctx.intent.contrast}, radius=${ctx.intent.radius})

You may use ONLY these semantic Tailwind utilities for colour and surfaces:
  ${tokenList.join('  ')}

FORBIDDEN — any of these will fail validation:
  • Raw hex colours in JSX/className  (e.g. "#0ea5e9", style={{color:'#fff'}})
  • Raw rgb()/rgba()/hsl()/hsla() literals in className or inline style
  • Tailwind palette utilities like  bg-blue-500, text-red-600, border-emerald-400, bg-gray-50
  • Generic blank fallback such as  className="bg-white text-black"
    (use bg-background text-foreground instead)

Use lucide-react icons; use rounded-2xl/rounded-3xl for cards;
respect the archetype's navigation choice (do NOT add a sidebar to a bottom-tabs app and vice versa).
`.trim() + '\n';
}

// ─── Theme materialisation ────────────────────────────────────────────────────

const THEME_FILE_PATH = 'styles/generated-theme.css';

export function themeFile(ctx: DesignContext): { path: string; content: string } {
  const content = `/* AUTO-GENERATED by DesignContract — do not edit by hand. */
/* mood=${ctx.intent.mood} contrast=${ctx.intent.contrast} radius=${ctx.intent.radius} */
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

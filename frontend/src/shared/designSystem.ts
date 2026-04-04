/**
 * designSystem.ts — Typed Visual Presets for Generated Prototypes  (v1)
 *
 * Each preset defines a complete design token set that flows into:
 *   • ManifestPlanner scaffold templates (CSS variables, layout shells)
 *   • BatchGenerator AI prompts (token constraints the AI must follow)
 *   • Orchestrator system prompt (visual rules)
 *
 * Presets are inferred by ProductArchitect from intent + productMode.
 */

// ─── Core token types ─────────────────────────────────────────────────────────

export interface TypographyScale {
  /** Font family stack */
  fontFamily:  string;
  /** Display heading — hero/page titles */
  display:     string;   // e.g. '3rem'
  /** Section headings */
  h1:          string;
  h2:          string;
  h3:          string;
  /** Body text */
  body:        string;
  /** Small / caption */
  small:       string;
  /** Line height multiplier */
  lineHeight:  number;
  /** Font weight for headings */
  headingWeight: number;
}

export interface SpacingScale {
  /** Base unit in px — all spacings are multiples */
  unit:   number;
  /** Named stops: xs=unit*1, sm=unit*2, md=unit*3, lg=unit*5, xl=unit*8 */
  xs:     string;
  sm:     string;
  md:     string;
  lg:     string;
  xl:     string;
  /** Section-level vertical gap */
  section: string;
}

export interface RadiusShadow {
  /** Border radius for small elements (buttons, inputs) */
  sm:       string;
  /** Border radius for cards */
  md:       string;
  /** Border radius for modals/panels */
  lg:       string;
  /** Full pill radius */
  full:     string;
  /** Card shadow */
  cardShadow:  string;
  /** Elevated shadow (dropdowns, modals) */
  elevatedShadow: string;
}

export interface ColorTokens {
  /** Brand / accent color */
  primary:      string;
  primaryHover: string;
  /** Background surfaces */
  surface:      string;
  surfaceAlt:   string;
  /** Text colors */
  text:         string;
  textMuted:    string;
  /** Borders */
  border:       string;
  borderStrong: string;
  /** Semantic */
  success:      string;
  warning:      string;
  error:        string;
  info:         string;
}

export interface LayoutShell {
  /** Top-level layout pattern */
  pattern:      'sidebar-left' | 'sidebar-right' | 'top-nav' | 'stacked' | 'split';
  /** Sidebar width (if applicable) */
  sidebarWidth: string;
  /** Max content width */
  maxWidth:     string;
  /** Main content padding */
  contentPad:   string;
  /** Gap between cards/sections */
  cardGap:      string;
}

export interface StateStyle {
  /** Empty state: centered illustration placeholder + message */
  empty:   { bgClass: string; textClass: string; iconSize: string };
  /** Loading state: skeleton or spinner */
  loading: { type: 'skeleton' | 'spinner'; bgClass: string };
  /** Error state: banner or inline */
  error:   { type: 'banner' | 'inline'; bgClass: string; textClass: string; borderClass: string };
}

// ─── Visual Preset ────────────────────────────────────────────────────────────

export type VisualPresetId =
  | 'enterprise-dashboard'
  | 'consumer-mobile'
  | 'editorial-light'
  | 'dense-admin';

export interface VisualPreset {
  id:          VisualPresetId;
  name:        string;
  description: string;
  typography:  TypographyScale;
  spacing:     SpacingScale;
  radius:      RadiusShadow;
  colors:      ColorTokens;
  layout:      LayoutShell;
  states:      StateStyle;
}

// ─── Preset definitions ───────────────────────────────────────────────────────

export const VISUAL_PRESETS: Record<VisualPresetId, VisualPreset> = {

  'enterprise-dashboard': {
    id:          'enterprise-dashboard',
    name:        'Enterprise Dashboard',
    description: 'Data-dense dark dashboard with compact spacing and strong hierarchy',
    typography: {
      fontFamily:    'Inter, system-ui, sans-serif',
      display:       '2.25rem',
      h1:            '1.5rem',
      h2:            '1.25rem',
      h3:            '1rem',
      body:          '0.875rem',
      small:         '0.75rem',
      lineHeight:    1.5,
      headingWeight: 600,
    },
    spacing: {
      unit:    4,
      xs:      '4px',
      sm:      '8px',
      md:      '12px',
      lg:      '20px',
      xl:      '32px',
      section: '24px',
    },
    radius: {
      sm:             '6px',
      md:             '8px',
      lg:             '12px',
      full:           '9999px',
      cardShadow:     '0 1px 3px rgba(0,0,0,0.3)',
      elevatedShadow: '0 8px 24px rgba(0,0,0,0.4)',
    },
    colors: {
      primary:      '#3b82f6',
      primaryHover: '#2563eb',
      surface:      '#0f1117',
      surfaceAlt:   '#1a1d27',
      text:         '#f1f5f9',
      textMuted:    '#64748b',
      border:       '#2a2d3a',
      borderStrong: '#3b3f4f',
      success:      '#22c55e',
      warning:      '#f59e0b',
      error:        '#ef4444',
      info:         '#3b82f6',
    },
    layout: {
      pattern:      'sidebar-left',
      sidebarWidth: '240px',
      maxWidth:     '1440px',
      contentPad:   '24px',
      cardGap:      '16px',
    },
    states: {
      empty:   { bgClass: 'bg-slate-800/50', textClass: 'text-slate-400', iconSize: '48px' },
      loading: { type: 'skeleton', bgClass: 'bg-slate-700/50' },
      error:   { type: 'banner', bgClass: 'bg-red-500/10', textClass: 'text-red-400', borderClass: 'border-red-500/30' },
    },
  },

  'consumer-mobile': {
    id:          'consumer-mobile',
    name:        'Consumer Mobile',
    description: 'Spacious, touch-friendly layout with rounded corners and vibrant accents',
    typography: {
      fontFamily:    "'SF Pro Display', Inter, system-ui, sans-serif",
      display:       '2rem',
      h1:            '1.75rem',
      h2:            '1.375rem',
      h3:            '1.125rem',
      body:          '1rem',
      small:         '0.8125rem',
      lineHeight:    1.6,
      headingWeight: 700,
    },
    spacing: {
      unit:    8,
      xs:      '8px',
      sm:      '16px',
      md:      '24px',
      lg:      '40px',
      xl:      '64px',
      section: '48px',
    },
    radius: {
      sm:             '12px',
      md:             '16px',
      lg:             '24px',
      full:           '9999px',
      cardShadow:     '0 2px 8px rgba(0,0,0,0.08)',
      elevatedShadow: '0 12px 32px rgba(0,0,0,0.12)',
    },
    colors: {
      primary:      '#6366f1',
      primaryHover: '#4f46e5',
      surface:      '#ffffff',
      surfaceAlt:   '#f8fafc',
      text:         '#0f172a',
      textMuted:    '#64748b',
      border:       '#e2e8f0',
      borderStrong: '#cbd5e1',
      success:      '#10b981',
      warning:      '#f59e0b',
      error:        '#ef4444',
      info:         '#6366f1',
    },
    layout: {
      pattern:      'stacked',
      sidebarWidth: '0px',
      maxWidth:     '480px',
      contentPad:   '20px',
      cardGap:      '16px',
    },
    states: {
      empty:   { bgClass: 'bg-slate-50', textClass: 'text-slate-400', iconSize: '64px' },
      loading: { type: 'skeleton', bgClass: 'bg-slate-100' },
      error:   { type: 'inline', bgClass: 'bg-red-50', textClass: 'text-red-600', borderClass: 'border-red-200' },
    },
  },

  'editorial-light': {
    id:          'editorial-light',
    name:        'Editorial Light',
    description: 'Typography-forward light theme with generous whitespace for content-heavy apps',
    typography: {
      fontFamily:    "'Georgia', 'Times New Roman', serif",
      display:       '3rem',
      h1:            '2rem',
      h2:            '1.5rem',
      h3:            '1.25rem',
      body:          '1.0625rem',
      small:         '0.875rem',
      lineHeight:    1.75,
      headingWeight: 700,
    },
    spacing: {
      unit:    8,
      xs:      '8px',
      sm:      '16px',
      md:      '24px',
      lg:      '48px',
      xl:      '80px',
      section: '64px',
    },
    radius: {
      sm:             '4px',
      md:             '6px',
      lg:             '8px',
      full:           '9999px',
      cardShadow:     '0 1px 2px rgba(0,0,0,0.05)',
      elevatedShadow: '0 4px 16px rgba(0,0,0,0.08)',
    },
    colors: {
      primary:      '#1a1a1a',
      primaryHover: '#333333',
      surface:      '#fafaf9',
      surfaceAlt:   '#f5f5f4',
      text:         '#1c1917',
      textMuted:    '#78716c',
      border:       '#e7e5e4',
      borderStrong: '#d6d3d1',
      success:      '#16a34a',
      warning:      '#d97706',
      error:        '#dc2626',
      info:         '#2563eb',
    },
    layout: {
      pattern:      'top-nav',
      sidebarWidth: '0px',
      maxWidth:     '720px',
      contentPad:   '32px',
      cardGap:      '24px',
    },
    states: {
      empty:   { bgClass: 'bg-stone-50', textClass: 'text-stone-400', iconSize: '56px' },
      loading: { type: 'skeleton', bgClass: 'bg-stone-100' },
      error:   { type: 'banner', bgClass: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-200' },
    },
  },

  'dense-admin': {
    id:          'dense-admin',
    name:        'Dense Admin',
    description: 'Maximum information density with tight grid and minimal decoration',
    typography: {
      fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
      display:       '1.75rem',
      h1:            '1.25rem',
      h2:            '1rem',
      h3:            '0.875rem',
      body:          '0.8125rem',
      small:         '0.6875rem',
      lineHeight:    1.4,
      headingWeight: 600,
    },
    spacing: {
      unit:    4,
      xs:      '2px',
      sm:      '4px',
      md:      '8px',
      lg:      '12px',
      xl:      '20px',
      section: '16px',
    },
    radius: {
      sm:             '3px',
      md:             '4px',
      lg:             '6px',
      full:           '9999px',
      cardShadow:     'none',
      elevatedShadow: '0 2px 8px rgba(0,0,0,0.15)',
    },
    colors: {
      primary:      '#0ea5e9',
      primaryHover: '#0284c7',
      surface:      '#f8fafc',
      surfaceAlt:   '#f1f5f9',
      text:         '#0f172a',
      textMuted:    '#475569',
      border:       '#e2e8f0',
      borderStrong: '#cbd5e1',
      success:      '#22c55e',
      warning:      '#eab308',
      error:        '#dc2626',
      info:         '#0ea5e9',
    },
    layout: {
      pattern:      'sidebar-left',
      sidebarWidth: '200px',
      maxWidth:     '1600px',
      contentPad:   '12px',
      cardGap:      '8px',
    },
    states: {
      empty:   { bgClass: 'bg-slate-100', textClass: 'text-slate-500', iconSize: '32px' },
      loading: { type: 'spinner', bgClass: 'bg-transparent' },
      error:   { type: 'inline', bgClass: 'bg-red-50', textClass: 'text-red-600', borderClass: 'border-red-300' },
    },
  },
};

// ─── Inference helper ─────────────────────────────────────────────────────────

import type { ProductMode, VisualMode } from './projectModel';

/**
 * Infer the best visual preset from product mode + visual mode.
 * Called by ProductArchitect.infer().
 */
export function inferVisualPreset(
  mode:   ProductMode,
  visual: VisualMode,
  intent: string,
): { presetId: VisualPresetId; note: string } {
  const lower = intent.toLowerCase();

  // Explicit keyword overrides
  if (lower.includes('dense') || lower.includes('compact admin'))
    return { presetId: 'dense-admin', note: "visual preset='dense-admin' (keyword match)" };
  if (lower.includes('editorial') || lower.includes('magazine') || lower.includes('reading'))
    return { presetId: 'editorial-light', note: "visual preset='editorial-light' (keyword match)" };
  if (lower.includes('mobile app') || lower.includes('consumer app') || lower.includes('ios'))
    return { presetId: 'consumer-mobile', note: "visual preset='consumer-mobile' (keyword match)" };

  // Mode-based inference
  if (mode === 'dashboard' || mode === 'saas')
    return { presetId: 'enterprise-dashboard', note: `visual preset='enterprise-dashboard' (mode='${mode}')` };
  if (mode === 'admin')
    return { presetId: 'dense-admin', note: "visual preset='dense-admin' (mode='admin')" };
  if (mode === 'blog' || mode === 'portfolio')
    return { presetId: 'editorial-light', note: "visual preset='editorial-light' (content-focused mode)" };
  if (mode === 'social' || mode === 'game')
    return { presetId: 'consumer-mobile', note: `visual preset='consumer-mobile' (mode='${mode}')` };

  // Density-based fallback
  if (visual.density === 'compact')
    return { presetId: 'dense-admin', note: "visual preset='dense-admin' (compact density fallback)" };
  if (visual.density === 'spacious')
    return { presetId: 'editorial-light', note: "visual preset='editorial-light' (spacious density fallback)" };

  // Default
  return { presetId: 'enterprise-dashboard', note: "visual preset='enterprise-dashboard' (default)" };
}

// ─── CSS variable generator ───────────────────────────────────────────────────

/**
 * Generate a CSS :root block from a visual preset.
 * Used by ManifestPlanner when scaffolding styles/global.css.
 */
export function presetToCssVariables(preset: VisualPreset): string {
  const { typography: t, spacing: s, radius: r, colors: c } = preset;
  return `:root {
  /* Typography — ${preset.name} */
  --font-family: ${t.fontFamily};
  --font-display: ${t.display};
  --font-h1: ${t.h1};
  --font-h2: ${t.h2};
  --font-h3: ${t.h3};
  --font-body: ${t.body};
  --font-small: ${t.small};
  --line-height: ${t.lineHeight};
  --heading-weight: ${t.headingWeight};

  /* Spacing scale */
  --space-xs: ${s.xs};
  --space-sm: ${s.sm};
  --space-md: ${s.md};
  --space-lg: ${s.lg};
  --space-xl: ${s.xl};
  --space-section: ${s.section};

  /* Radius & shadow */
  --radius-sm: ${r.sm};
  --radius-md: ${r.md};
  --radius-lg: ${r.lg};
  --radius-full: ${r.full};
  --shadow-card: ${r.cardShadow};
  --shadow-elevated: ${r.elevatedShadow};

  /* Colors */
  --color-primary: ${c.primary};
  --color-primary-hover: ${c.primaryHover};
  --color-surface: ${c.surface};
  --color-surface-alt: ${c.surfaceAlt};
  --color-text: ${c.text};
  --color-text-muted: ${c.textMuted};
  --color-border: ${c.border};
  --color-border-strong: ${c.borderStrong};
  --color-success: ${c.success};
  --color-warning: ${c.warning};
  --color-error: ${c.error};
  --color-info: ${c.info};

  /* Layout */
  --max-width: ${preset.layout.maxWidth};
  --content-pad: ${preset.layout.contentPad};
  --card-gap: ${preset.layout.cardGap};
}`;
}

// ─── AI prompt token block ────────────────────────────────────────────────────

/**
 * Generate a compact design-system block for injection into AI generation prompts.
 * Used by BatchGenerator to constrain AI output to the preset's visual language.
 */
export function presetToPromptBlock(preset: VisualPreset): string {
  const { typography: t, spacing: s, radius: r, colors: c, layout: l, states: st } = preset;
  return `## DESIGN SYSTEM — ${preset.name}
${preset.description}

### Typography scale
- Font: ${t.fontFamily}
- Display: ${t.display} | H1: ${t.h1} | H2: ${t.h2} | H3: ${t.h3} | Body: ${t.body} | Small: ${t.small}
- Line height: ${t.lineHeight} | Heading weight: ${t.headingWeight}
- Use Tailwind: text-xs=${t.small}, text-sm=${t.body}, text-base=${t.h3}, text-lg=${t.h2}, text-xl=${t.h1}, text-3xl=${t.display}

### Spacing scale
- Unit: ${s.unit}px | xs: ${s.xs} | sm: ${s.sm} | md: ${s.md} | lg: ${s.lg} | xl: ${s.xl} | section: ${s.section}
- Use gap-1 to gap-8 mapping; prefer gap/padding over margin

### Radius & shadow rules
- Buttons/inputs: ${r.sm} | Cards: ${r.md} | Modals: ${r.lg} | Pills: ${r.full}
- Card shadow: ${r.cardShadow}
- Elevated shadow: ${r.elevatedShadow}

### Colors (use CSS variables: var(--color-primary), etc.)
- Primary: ${c.primary} / hover: ${c.primaryHover}
- Surface: ${c.surface} / alt: ${c.surfaceAlt}
- Text: ${c.text} / muted: ${c.textMuted}
- Border: ${c.border} / strong: ${c.borderStrong}
- Success: ${c.success} | Warning: ${c.warning} | Error: ${c.error} | Info: ${c.info}

### Preferred layout shell: ${l.pattern}
- Sidebar: ${l.sidebarWidth} | Max width: ${l.maxWidth} | Padding: ${l.contentPad} | Card gap: ${l.cardGap}

### Empty state style
- Container: ${st.empty.bgClass} + rounded-lg + p-8 text-center
- Text: ${st.empty.textClass} + text-sm
- Icon placeholder: ${st.empty.iconSize} centered above message

### Loading state style
- Type: ${st.loading.type}
- ${st.loading.type === 'skeleton' ? `Skeleton bars: ${st.loading.bgClass} animate-pulse rounded` : `Spinner: w-6 h-6 border-2 border-t-transparent border-primary animate-spin rounded-full`}

### Error state style
- Type: ${st.error.type}
- Container: ${st.error.bgClass} ${st.error.borderClass} border rounded-md p-3
- Text: ${st.error.textClass} text-sm

IMPORTANT: All generated components MUST use these design tokens consistently.
Use var(--color-*), var(--space-*), var(--radius-*) CSS variables when possible.
Every page MUST include proper empty state, loading state, and error state handling.`;
}

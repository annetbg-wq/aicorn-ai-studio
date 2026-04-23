export type ThemeMood = 'playful' | 'corporate' | 'luxury' | 'brutal' | 'calm';
export type ThemeContrast = 'low' | 'medium' | 'high';
export type ThemeRadius = 'sharp' | 'soft' | 'pill';

export type DesignIntent = {
  mood?: ThemeMood;
  contrast?: ThemeContrast;
  radius?: ThemeRadius;
  /** Deterministic seed for color variation; defaults to plan.id when called from pipeline. */
  seed?: string;
};

export type GeneratedTheme = {
  name: string;
  /** Complete :root { … } block ready to embed in index.css */
  cssVars: string;
  /** Object for tailwind.config.js → theme.extend */
  tailwindExtend: object;
};

// ── Palette mappings ─────────────────────────────────────────────────────────

const MOOD_HUE: Record<ThemeMood, number> = {
  calm:      180,
  corporate: 220,
  luxury:    45,
  playful:   330,
  brutal:    0,
};

const SATURATION: Record<ThemeContrast, number> = {
  high:   90,
  medium: 60,
  low:    20,
};

const RADIUS_VALUE: Record<ThemeRadius, string> = {
  sharp: '0.25rem',
  soft:  '0.5rem',
  pill:  '9999px',
};

// ── WCAG helpers ─────────────────────────────────────────────────────────────

function relativeLuminance(h: number, s: number, l: number): number {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const raw = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    const linear = raw <= 0.04045 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
    return linear;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Shift lightness by ±10 once to pass WCAG AA (4.5:1) against the counterpart. */
function isUgly(
  fgH: number, fgS: number, fgL: number,
  bgH: number, bgS: number, bgL: number,
): boolean {
  const ratio = contrastRatio(
    relativeLuminance(fgH, fgS, fgL),
    relativeLuminance(bgH, bgS, bgL),
  );
  return ratio < 4.5;
}

function ensureContrast(
  fgH: number, fgS: number, fgL: number,
  bgH: number, bgS: number, bgL: number,
): number {
  if (!isUgly(fgH, fgS, fgL, bgH, bgS, bgL)) return fgL;
  const bgLum = relativeLuminance(bgH, bgS, bgL);
  // shift toward the pole (lighter or darker) that gives higher contrast
  const adjusted = bgLum > 0.5 ? fgL - 10 : fgL + 10;
  return Math.min(95, Math.max(5, adjusted));
}

// ── Core generator ───────────────────────────────────────────────────────────

function spaceHsl(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

export function generateTheme(intent: DesignIntent): GeneratedTheme {
  const mood     = intent.mood     ?? 'corporate';
  const contrast = intent.contrast ?? 'medium';
  const radius   = intent.radius   ?? 'soft';

  const h   = MOOD_HUE[mood];
  const sat = SATURATION[contrast];
  const r   = RADIUS_VALUE[radius];

  // Dark background for high contrast, light for low; medium gets dark
  const isDark  = contrast !== 'low';
  const bgL     = isDark ? 4  : 96;
  const fgL     = isDark ? 96 : 4;

  const surfaceL      = isDark ? bgL + 6  : bgL - 5;
  const mutedL        = isDark ? bgL + 15 : bgL - 15;
  const borderL       = isDark ? bgL + 12 : bgL - 10;
  const primaryL      = isDark ? 65       : 45;
  const primaryFgL    = isDark ? 4        : 98;
  const primaryMutedL = isDark ? 20       : 90;

  // WCAG check — foreground vs background, one retry
  const safeFgL = ensureContrast(h, sat * 0.15, fgL, h, sat * 0.1, bgL);

  const bgVal           = spaceHsl(h, sat * 0.10, bgL);
  const fgVal           = spaceHsl(h, sat * 0.15, safeFgL);
  const cardVal         = spaceHsl(h, sat * 0.10, surfaceL);
  const cardFgVal       = fgVal;
  const popoverVal      = cardVal;
  const popoverFgVal    = fgVal;
  const primaryVal      = spaceHsl(h, sat,        primaryL);
  const primaryFgVal    = spaceHsl(0, 0,           primaryFgL);
  const secondaryVal    = spaceHsl(h, sat * 0.25,  primaryMutedL);
  const secondaryFgVal  = spaceHsl(h, sat * 0.15,  fgL);
  const mutedVal        = spaceHsl(h, sat * 0.15,  mutedL);
  const mutedFgVal      = spaceHsl(h, sat * 0.10,  isDark ? fgL - 20 : fgL + 20);
  const accentVal       = spaceHsl(h, sat * 0.30,  mutedL);
  const accentFgVal     = fgVal;
  const destructiveVal  = spaceHsl(0, 84,           60);
  const destructiveFgVal = spaceHsl(0, 0,           98);
  const borderVal       = spaceHsl(h, sat * 0.15,  borderL);
  const inputVal        = borderVal;
  const ringVal         = spaceHsl(h, sat,          primaryL);

  const name = `${mood}-${contrast}-${radius}`;

  const cssVars = `:root {
  --background:          ${bgVal};
  --foreground:          ${fgVal};
  --card:                ${cardVal};
  --card-foreground:     ${cardFgVal};
  --popover:             ${popoverVal};
  --popover-foreground:  ${popoverFgVal};
  --primary:             ${primaryVal};
  --primary-foreground:  ${primaryFgVal};
  --secondary:           ${secondaryVal};
  --secondary-foreground:${secondaryFgVal};
  --muted:               ${mutedVal};
  --muted-foreground:    ${mutedFgVal};
  --accent:              ${accentVal};
  --accent-foreground:   ${accentFgVal};
  --destructive:         ${destructiveVal};
  --destructive-foreground:${destructiveFgVal};
  --border:              ${borderVal};
  --input:               ${inputVal};
  --ring:                ${ringVal};
  --radius:              ${r};
}`;

  const tailwindExtend = {
    colors: {
      background:           'hsl(var(--background))',
      foreground:           'hsl(var(--foreground))',
      card:                 'hsl(var(--card))',
      'card-foreground':    'hsl(var(--card-foreground))',
      popover:              'hsl(var(--popover))',
      'popover-foreground': 'hsl(var(--popover-foreground))',
      primary:              'hsl(var(--primary))',
      'primary-foreground': 'hsl(var(--primary-foreground))',
      secondary:            'hsl(var(--secondary))',
      'secondary-foreground': 'hsl(var(--secondary-foreground))',
      muted:                'hsl(var(--muted))',
      'muted-foreground':   'hsl(var(--muted-foreground))',
      accent:               'hsl(var(--accent))',
      'accent-foreground':  'hsl(var(--accent-foreground))',
      destructive:          'hsl(var(--destructive))',
      'destructive-foreground': 'hsl(var(--destructive-foreground))',
      border:               'hsl(var(--border))',
      input:                'hsl(var(--input))',
      ring:                 'hsl(var(--ring))',
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
  };

  return { name, cssVars, tailwindExtend };
}

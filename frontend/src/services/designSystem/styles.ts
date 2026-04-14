import type { StyleId } from './categories';

export interface StyleDefinition {
  id: StyleId;
  label: string;
  labelRu: string;
  description: string;
  designPrompt: string;
  cssVariables: Record<string, string>;
  tailwindConfig: {
    fontFamily?: string;
    rounded?: string;
    shadow?: string;
  };
  animationProfile: 'none' | 'subtle' | 'moderate' | 'expressive';
  exampleComponents: string[];
}

export const STYLES: Record<StyleId, StyleDefinition> = {
  'dark-pro': {
    id: 'dark-pro',
    label: 'Dark Pro',
    labelRu: 'Тёмный профессиональный',
    description: 'Dark backgrounds, sharp edges, data-dense, professional',
    designPrompt: `
DESIGN LANGUAGE: Dark Pro
- Background: #0f0f1a or #0d1117 (near-black, not pure black)
- Surface: #1a1a2e or #161b22 (elevated elements)
- Border: rgba(255,255,255,0.08) subtle borders
- Primary accent: use category color
- Text: #e2e8f0 primary, #94a3b8 secondary, #475569 muted
- Typography: Inter, weights 400/500/600/700, tight tracking on headings
- Border radius: 8px default, 12px cards, 4px small elements
- Shadows: dark glows using primary color at 20% opacity
- Spacing: generous padding (20-24px), breathable layout
- Icons: Lucide or Heroicons, 16-20px, consistent weight
- Charts/data: use recharts with dark theme, grid lines rgba(255,255,255,0.05)
- Transitions: 150ms ease on hover, 200ms on state changes
- NO pure white backgrounds, NO light grays as backgrounds
- Cards have subtle border + background elevation, no heavy shadows
`,
    cssVariables: {
      '--bg': '#0f0f1a',
      '--surface': '#1a1a2e',
      '--border': 'rgba(255,255,255,0.08)',
      '--text': '#e2e8f0',
      '--text-muted': '#94a3b8',
    },
    tailwindConfig: { rounded: 'rounded-lg', shadow: 'shadow-lg' },
    animationProfile: 'subtle',
    exampleComponents: ['Linear', 'Vercel', 'Railway', 'Raycast'],
  },

  'clean-light': {
    id: 'clean-light',
    label: 'Clean Light',
    labelRu: 'Чистый светлый',
    description: 'White backgrounds, clear hierarchy, modern minimal',
    designPrompt: `
DESIGN LANGUAGE: Clean Light
- Background: #ffffff or #f9fafb
- Surface: #f1f5f9 or #f8fafc for elevated cards
- Border: #e2e8f0 or #f1f5f9
- Primary accent: use category color
- Text: #0f172a primary, #475569 secondary, #94a3b8 muted
- Typography: Inter, clear size hierarchy (14/16/20/24/32px)
- Border radius: 12px cards, 8px inputs, 6px badges
- Shadows: subtle box-shadow 0 1px 3px rgba(0,0,0,0.1)
- Spacing: 16-20px padding on cards, 8-12px between elements
- Icons: consistent 16-20px, use filled for active states
- Dividers: #f1f5f9 or #e2e8f0, not heavy lines
- Hover states: background shift to #f8fafc, subtle
- Focus rings: 2px primary color at 30% opacity
- NO dark backgrounds, NO heavy borders, NO cluttered layouts
- White space is intentional and generous
`,
    cssVariables: {
      '--bg': '#ffffff',
      '--surface': '#f8fafc',
      '--border': '#e2e8f0',
      '--text': '#0f172a',
      '--text-muted': '#64748b',
    },
    tailwindConfig: { rounded: 'rounded-xl', shadow: 'shadow-sm' },
    animationProfile: 'subtle',
    exampleComponents: ['Notion', 'Linear (light)', 'Stripe', 'Figma'],
  },

  'colorful-vibrant': {
    id: 'colorful-vibrant',
    label: 'Colorful Vibrant',
    labelRu: 'Яркий и красочный',
    description: 'Bold colors, gradients, energetic, consumer-facing',
    designPrompt: `
DESIGN LANGUAGE: Colorful Vibrant
- Use bold gradient backgrounds: linear-gradient with category primary + secondary
- Surface: white cards on colored background, or semi-transparent
- Accent: vibrant complementary colors, not just one color
- Typography: Inter 700/800 for headings, round feel
- Border radius: 16-20px cards, pill buttons (9999px), 12px inputs
- Shadows: colored shadows matching primary (box-shadow 0 8px 25px primary at 30%)
- Gradients: use on buttons, heroes, badges, progress bars
- Icons: slightly larger 20-24px, colorful or white on colored bg
- Animations: bouncy micro-interactions (spring easing)
- Use emoji or colorful illustrations as accents
- Categories: color-code different sections
- Buttons: gradient fill, white text, slight shadow
- Cards: white with colored left border or gradient header strip
- High contrast ratios, accessible despite vibrancy
`,
    cssVariables: {
      '--bg': '#f5f3ff',
      '--surface': '#ffffff',
      '--border': 'transparent',
      '--text': '#1e1b4b',
      '--text-muted': '#6b7280',
    },
    tailwindConfig: { rounded: 'rounded-2xl', shadow: 'shadow-xl' },
    animationProfile: 'expressive',
    exampleComponents: ['Duolingo', 'Notion (colorful)', 'Figma', 'Pitch'],
  },

  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    labelRu: 'Корпоративный',
    description: 'Professional, trustworthy, data-dense, conservative',
    designPrompt: `
DESIGN LANGUAGE: Enterprise
- Background: #f8fafc or white
- Surface: white with 1px #e2e8f0 border
- Primary: deep blue #1e40af or category color (must convey trust)
- Text: #0f172a primary, #334155 secondary
- Typography: Inter, precise sizes, tabular numbers for data
- Border radius: 6-8px, conservative
- Tables: zebra striping (#f8fafc), fixed headers, sortable columns
- Forms: clear labels above inputs, validation states
- Density: compact — more information per screen
- Sidebar: fixed, hierarchical navigation with sections
- Status badges: semantic colors (green=success, red=error, yellow=warning)
- Data: tables preferred over cards where possible
- Buttons: outlined or subtle, primary actions clear
- NO decorative elements, NO gradients on content areas
- Accessibility: WCAG AA minimum, focus states always visible
- Header: company branding area, breadcrumbs, user menu
`,
    cssVariables: {
      '--bg': '#f8fafc',
      '--surface': '#ffffff',
      '--border': '#e2e8f0',
      '--text': '#0f172a',
      '--text-muted': '#475569',
    },
    tailwindConfig: { rounded: 'rounded-md', shadow: 'shadow-sm' },
    animationProfile: 'none',
    exampleComponents: ['Salesforce', 'SAP', 'Workday', 'ServiceNow'],
  },

  glassmorphism: {
    id: 'glassmorphism',
    label: 'Glassmorphism',
    labelRu: 'Стекло и размытие',
    description: 'Frosted glass, blur effects, layered depth, modern premium',
    designPrompt: `
DESIGN LANGUAGE: Glassmorphism
- Background: rich gradient (dark purple/blue mesh or colorful blur)
  Use: background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
  Or: radial gradients with multiple color stops
- Cards: backdrop-filter: blur(20px), background: rgba(255,255,255,0.1)
  border: 1px solid rgba(255,255,255,0.2)
- Text: white or near-white on glass surfaces
- Depth: multiple layers with different blur amounts
- Shadows: 0 8px 32px rgba(31,38,135,0.37)
- Border radius: 16-24px
- Highlights: top border rgba(255,255,255,0.3) for glass edge effect
- Buttons: glass style or solid primary color
- Icons: white or light pastel, 20-24px
- Animated gradient background (CSS @keyframes on background-position)
- Use sparingly: not every element is glass, mix with solid surfaces
- Light mode glass: rgba(255,255,255,0.7) blur on light gradient bg
- Ensure readable contrast despite transparency
`,
    cssVariables: {
      '--bg': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      '--surface': 'rgba(255,255,255,0.1)',
      '--border': 'rgba(255,255,255,0.2)',
      '--text': '#ffffff',
      '--text-muted': 'rgba(255,255,255,0.7)',
    },
    tailwindConfig: { rounded: 'rounded-2xl', shadow: 'shadow-2xl' },
    animationProfile: 'moderate',
    exampleComponents: ['iOS widgets', 'macOS', 'Nothing Phone UI', 'Raycast'],
  },

  gamified: {
    id: 'gamified',
    label: 'Gamified',
    labelRu: 'Геймифицированный',
    description: 'Game mechanics, achievements, levels, fun and engaging',
    designPrompt: `
DESIGN LANGUAGE: Gamified
- Bright, energetic colors with clear visual hierarchy
- XP bars, progress rings, achievement badges as primary UI elements
- Typography: rounded sans-serif (simulate Nunito or use Inter with 700-800 weight)
- Border radius: very round — 20px+ on cards, pill badges
- Animations:
  * Completion: scale(1.1) + shake on wrong, bounce on correct
  * Progress: smooth fill animations on bars and rings
  * Achievements: slide-in + sparkle effect (use CSS keyframes)
  * Streak flame: pulsing glow animation
- Color coding: green=success, red=fail, gold=special/rare
- Sound indicators: visual wave icons (even if no audio)
- Level indicators: clear visual hierarchy (bronze/silver/gold)
- Streak counters: prominent, flame emoji or icon
- Lives system: hearts or similar limited resource visual
- Leaderboards: avatar + name + score rows, top 3 highlighted
- Reward pop-ups: centered modal with confetti (CSS particle effect)
- Progress always visible, never hidden
- Micro-copy: encouraging, second-person ("You're on fire! 🔥")
`,
    cssVariables: {
      '--bg': '#fafafa',
      '--surface': '#ffffff',
      '--border': 'transparent',
      '--text': '#1c1c1e',
      '--text-muted': '#8e8e93',
    },
    tailwindConfig: { rounded: 'rounded-3xl', shadow: 'shadow-lg' },
    animationProfile: 'expressive',
    exampleComponents: ['Duolingo', 'Habitica', 'Kahoot', 'ClassDojo'],
  },

  editorial: {
    id: 'editorial',
    label: 'Editorial',
    labelRu: 'Редакционный',
    description: 'Typography-first, magazine feel, content-focused, premium',
    designPrompt: `
DESIGN LANGUAGE: Editorial
- Typography is the design: large headings, careful sizing ratios
- Heading font: serif or high-quality sans (Georgia, Playfair Display, or Inter 800)
- Body font: readable serif or clean sans, 16-18px, 1.6-1.8 line-height
- Background: off-white #fffef7 or pure white, NOT gray
- Accent color: single color used sparingly (black + one color)
- Layout: column-based, generous margins (5-10% sides), max-width 720-900px
- Images: full-bleed heroes, 16:9 or 3:2 ratio, high visual weight
- Drop caps, pull quotes, blockquote styling as design elements
- Navigation: minimal, top or side, never intrusive
- Sections: clear visual breaks using whitespace, not dividers
- Cards: minimal borders, rely on whitespace and typography for separation
- Author bylines: small detail text with photo
- Tags: simple, minimal, no colorful badges
- Reading experience: no distractions, focus on content
- Mobile: single column, font scales up proportionally
`,
    cssVariables: {
      '--bg': '#fffef7',
      '--surface': '#ffffff',
      '--border': '#f0ede0',
      '--text': '#1a1a1a',
      '--text-muted': '#666666',
    },
    tailwindConfig: { rounded: 'rounded-sm', shadow: 'shadow-none' },
    animationProfile: 'none',
    exampleComponents: ['Medium', 'Substack', 'NYT', 'Stripe Press'],
  },

  'minimal-mono': {
    id: 'minimal-mono',
    label: 'Minimal Mono',
    labelRu: 'Минималистичный моно',
    description: 'Monochrome, ultra-clean, function over form, developer-aesthetic',
    designPrompt: `
DESIGN LANGUAGE: Minimal Mono
- Color: black and white ONLY, with one optional accent color used very sparingly
- Background: pure white #ffffff or #fafafa
- Text: #000000 or #111111 for all content
- Borders: 1px solid #000000 or #e5e5e5 (choose one, be consistent)
- Typography: Inter or system-ui, careful weight contrast (400 body, 700 headings)
- Spacing: mathematical grid — multiples of 4 or 8px only
- Border radius: 0px (sharp) or maximum 4px
- Icons: line-only, no fill, consistent 16px stroke weight
- Shadows: NONE or 2px 2px 0 #000 (pixel shadow aesthetic)
- Buttons: bordered (1px solid black) or solid black with white text
- Tables: simple borders, no alternating rows unless #f5f5f5
- Links: underlined, black
- Hover: background-color: #f5f5f5 or #000 with white text inversion
- Focus: 2px solid black outline
- NO gradients, NO colors, NO decorative elements
- Density: information-dense, Unix terminal aesthetic
- This is about clarity and function, every pixel justified
`,
    cssVariables: {
      '--bg': '#ffffff',
      '--surface': '#fafafa',
      '--border': '#e5e5e5',
      '--text': '#111111',
      '--text-muted': '#666666',
    },
    tailwindConfig: { rounded: 'rounded-none', shadow: 'shadow-none' },
    animationProfile: 'none',
    exampleComponents: ['Linear Issues (mono)', 'HN', 'iA Writer', 'Basecamp'],
  },

  'warm-organic': {
    id: 'warm-organic',
    label: 'Warm Organic',
    labelRu: 'Тёплый органический',
    description: 'Warm tones, natural materials feel, approachable, human',
    designPrompt: `
DESIGN LANGUAGE: Warm Organic
- Background: warm off-whites #fdf8f2, #fffbf0, or #faf5eb
- Surface: #ffffff or #fef9f0 cards
- Accent: warm tones — terracotta #c2714f, sage #7d9b76, warm amber #d4a853
- Text: warm near-black #1c0a00 or #2d1b0e
- Typography: slightly rounded feel — Inter works, or simulate rounded fonts
  Use larger line-height (1.7) for warm readable feel
- Border radius: 16px cards, 12px inputs, smooth curves throughout
- Textures: subtle grain or noise overlay (CSS: use pseudo-element with noise SVG)
- Borders: warm toned #e8d5c0 or #f0e0d0
- Shadows: warm-tinted rgba(180,120,80,0.15)
- Images: use warm filter aesthetic (no cold grays)
- Icons: slightly chunky, friendly weight
- Spacing: generous, breathing room, never cramped
- Buttons: warm filled or warm outlined
- Illustrations: if included, organic shapes, no sharp angles
- Micro-copy: friendly, warm, approachable (avoid corporate tone)
- Nature metaphors: use organic/growth metaphors in UI (seed→bloom for progress)
`,
    cssVariables: {
      '--bg': '#fdf8f2',
      '--surface': '#ffffff',
      '--border': '#e8d5c0',
      '--text': '#1c0a00',
      '--text-muted': '#7a6050',
    },
    tailwindConfig: { rounded: 'rounded-2xl', shadow: 'shadow-md' },
    animationProfile: 'moderate',
    exampleComponents: ['Notion (cozy)', 'Superhuman', 'Things 3', 'Craft'],
  },

  futuristic: {
    id: 'futuristic',
    label: 'Futuristic',
    labelRu: 'Футуристический',
    description: 'Sci-fi aesthetic, neon accents, cutting-edge tech feel',
    designPrompt: `
DESIGN LANGUAGE: Futuristic
- Background: near-black with subtle blue tint #050510 or #030318
- Surface: #0a0a20 or #0f0f2d
- Accent: neon colors — electric blue #00d4ff, neon green #00ff88,
  hot pink #ff0080 (use ONE neon as primary)
- Text: white #ffffff primary, #94a3b8 secondary
- Typography: Inter with wide letter-spacing on headings (0.05-0.1em)
  Use uppercase for labels and navigation
- Borders: neon color at 30-50% opacity, or subtle glowing borders
  border: 1px solid rgba(0,212,255,0.3)
- Glow effects:
  box-shadow: 0 0 20px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1)
  text-shadow: 0 0 10px rgba(0,212,255,0.8) for neon text
- Gradients: dark-to-neon gradients on important elements
- Animations:
  * Scanning line effect (CSS animation moving horizontal line)
  * Pulsing glow on active elements
  * Glitch effect on hover (optional, text-shadow shift)
  * Data stream background animation
- Grid lines: faint grid on background rgba(0,212,255,0.05)
- Charts: neon colored lines/bars on dark background
- Loading: pulsing neon dots or scanning animation
- Corner decorations: HUD-style brackets on important cards
- Numbers/data: monospace font, neon colored for key metrics
`,
    cssVariables: {
      '--bg': '#050510',
      '--surface': '#0a0a20',
      '--border': 'rgba(0,212,255,0.3)',
      '--text': '#ffffff',
      '--text-muted': '#94a3b8',
    },
    tailwindConfig: { rounded: 'rounded-lg', shadow: 'shadow-2xl' },
    animationProfile: 'expressive',
    exampleComponents: ['Cyberpunk UI', 'Bloomberg Terminal', 'SpaceX', 'Palantir'],
  },
};

export function getStyleDefinition(id: StyleId): StyleDefinition {
  return STYLES[id];
}

export function getAllStyles(): StyleDefinition[] {
  return Object.values(STYLES);
}

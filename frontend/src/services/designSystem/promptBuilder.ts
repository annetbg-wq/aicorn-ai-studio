import { CATEGORIES, type CategoryId, type StyleId } from './categories';
import { STYLES } from './styles';
import type { ClassificationResult } from './classifier';

export interface DesignContext {
  category: CategoryId;
  style: StyleId;
  idea: string;
  classification: ClassificationResult;
}

export function buildDesignSystemPrompt(ctx: DesignContext): string {
  const category = CATEGORIES[ctx.category];
  const style = STYLES[ctx.style];

  return `
═══ DESIGN SYSTEM CONTEXT ═══
Category: ${category.label} (${category.labelRu})
Style: ${style.label} (${style.labelRu})
App Idea: ${ctx.idea}

═══ COLOR PALETTE ═══
Primary: ${category.colorPalette.primary}
Secondary: ${category.colorPalette.secondary}
Accent: ${category.colorPalette.accent}
Background: ${category.colorPalette.background}
Surface: ${category.colorPalette.surface}
Text: ${category.colorPalette.text}

═══ TYPOGRAPHY ═══
Heading Font: ${category.typography.headingFont}
Body Font: ${category.typography.bodyFont}
${category.typography.monoFont ? `Mono Font: ${category.typography.monoFont}` : ''}

═══ STYLE GUIDE ═══
${style.designPrompt.trim()}

═══ UI PATTERNS TO USE ═══
${category.uiPatterns.map(p => `- ${p}`).join('\n')}

═══ REFERENCE APPS ═══
Study these for inspiration: ${category.exampleApps.join(', ')}

═══ ANIMATION PROFILE ═══
${
  style.animationProfile === 'none'
    ? 'NO animations. Static, stable UI only.'
    : style.animationProfile === 'subtle'
    ? 'Subtle transitions only: 150ms ease on hover, opacity/color changes.'
    : style.animationProfile === 'moderate'
    ? 'Moderate animations: entrance animations (200-300ms), smooth transitions, no loops.'
    : 'Expressive animations: spring physics, celebration effects, engaging micro-interactions.'
}

═══ TECHNICAL REQUIREMENTS ═══
- React functional components with TypeScript
- Tailwind CSS for all styling
- Import icons from lucide-react
- Use inline styles ONLY for dynamic values (colors from palette above)
- No external image URLs — use gradient placeholders or emoji
- Component must be self-contained, no external dependencies beyond React/Tailwind/lucide-react
- Export default the main component
- Include realistic sample data (5-10 items minimum)
- Responsive: works on mobile (375px) and desktop (1280px)
`.trim();
}

export function buildQuickPrompt(ctx: DesignContext): string {
  const category = CATEGORIES[ctx.category];
  const style = STYLES[ctx.style];
  return (
    `${style.label} style, ${category.label} app. ` +
    `Colors: bg ${category.colorPalette.background}, ` +
    `primary ${category.colorPalette.primary}. ` +
    `Patterns: ${category.uiPatterns.slice(0, 3).join(', ')}.`
  );
}

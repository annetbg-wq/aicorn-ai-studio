# Landing Page Skeleton

Single-scroll marketing site. Production-grade React + TypeScript.

## Sections

Nav → Hero → SocialProof → Features → HowItWorks → Pricing (with monthly/annual toggle) → FAQ accordion → FinalCTA → Footer.

## What's wired

- **All copy in one file**: `src/data/content.ts` — agent rewrites here, components untouched.
- **Smooth anchor scrolling** between sections.
- **Sticky nav** with scroll-aware background, mobile hamburger.
- **Pricing** with monthly/annual toggle, highlighted middle tier.
- **FAQ** as accessible accordion (single-open).
- **Token-driven gradients** in Hero and FinalCTA — no hardcoded colors.

## Customization

1. Edit `src/config/app.ts` — tagline, subtitle, CTA labels.
2. Rewrite all copy in `src/data/content.ts` (logos, features, steps, pricing, FAQ, footer).
3. Replace the Hero media placeholder with a real `<img>` or `<video>`.
4. Run `npm run validate` — checks no dead sections, no hardcoded colors.

## Running

```bash
npm install
npm run dev
npm run typecheck
npm run validate
npm run build
```

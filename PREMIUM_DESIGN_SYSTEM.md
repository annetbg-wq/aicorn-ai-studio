# Premium Design System

This repository now has an internal premium materials layer for future consumer UI work.
The canonical implementation lives in `preview-workspace/src`.

Reference screen:

- `#/materials` in the preview app
- `preview-workspace/src/pages/PremiumMaterialsShowcase.tsx`

## Stack

- React + TypeScript
- Tailwind CSS
- shadcn-style primitives built with `class-variance-authority`, Radix Slot/Tabs, and local `cn`
- `lucide-react` icons
- `clsx` + `tailwind-merge`
- `framer-motion` for restrained product motion
- Radix primitives where accessible behavior is needed

## Source Policy

The block language is normalized from permissive open-source Tailwind and React ecosystems, especially:

- shadcn/ui: https://github.com/shadcn-ui/ui
- HyperUI: https://github.com/markmead/hyperui
- Flowbite: https://flowbite.com/docs/getting-started/license/
- Preline UI: https://github.com/htmlstreamofficial/preline

Do not paste paid/pro/proprietary blocks. Do not mix raw donor styles directly into screens.
Use donors only as structural references, then normalize into this system. Treat dual-license
sources such as Preline as inspiration unless the exact target license has been reviewed.

## Tokens

Token source:

- `preview-workspace/src/styles/premium.css`
- `preview-workspace/src/styles/premium-tokens.ts`

Core color tokens:

- `--pm-canvas`: app/page background
- `--pm-surface`: primary card/control surface
- `--pm-surface-soft`: subtle bands and grouped controls
- `--pm-surface-tint`: light product tint surface
- `--pm-ink`: primary text and strongest action color
- `--pm-muted`: secondary text
- `--pm-line`: default border
- `--pm-line-strong`: hover/active border
- `--pm-brand`, `--pm-success`, `--pm-warning`, `--pm-rose`, `--pm-violet`: semantic accent tones

Radius scale:

- Controls: `rounded-2xl`
- Cards: `rounded-3xl`
- Hero/large sections: `rounded-[2rem]`
- Chips/badges: `rounded-full`

Shadow scale:

- Controls: soft low shadow
- Cards: `0 18px 50px rgba(15,23,42,0.08)`
- Raised cards/hero: `0 24px 80px rgba(15,23,42,0.12)`
- Focus: visible cyan focus ring

## Layout

- Page content uses a max width of `max-w-7xl`.
- Page gutters are `px-4 sm:px-6 lg:px-8`.
- Sections are spaced with large vertical rhythm, usually `gap-16` at page level.
- Product grids use `gap-4` and switch to 2 or 3 columns only when content can stay readable.
- Avoid nested cards. Cards are for repeated items, tools, and reference examples.

## Typography

- Use system sans (`Inter`, system fallback).
- Letter spacing stays normal except tiny uppercase eyebrows.
- Hero text is large and tight: `text-5xl` to `text-7xl`.
- Section titles: `text-3xl sm:text-4xl`.
- Body copy: `text-base leading-7`.
- Metadata/helper copy: `text-sm`, muted.

## Cards

Use `PremiumCard` variants:

- `default`: standard surface
- `interactive`: hover lift for clickable cards
- `selected`: active/selected state
- `subtle`: grouped neutral surface
- `elevated`: stronger hierarchy

Card anatomy should follow:

- Icon or category chip
- Title
- Description
- Metadata
- Single clear action when needed

## Buttons And Inputs

Use `PremiumButton`, `PremiumInput`, `PremiumTextarea`, and `PremiumField`.

Button rules:

- `primary`: main page action
- `brand`: highlighted conversion/action
- `secondary`: normal secondary action
- `outline`: low-emphasis bordered action
- `ghost`: quiet utility action
- `destructive`: irreversible/risky action
- Icon-only buttons must have `aria-label`

Input rules:

- Inputs use `h-12`, `rounded-2xl`, soft border, white surface, and visible focus ring.
- Search-heavy screens should use `PremiumSearchBar` or `PremiumSearchFilterBar`.
- Inline validation uses `PremiumField` error text.

## Directories

`src/components/ui`

- Atomic primitives and premium variants.
- Examples: `PremiumButton`, `PremiumCard`, `PremiumInput`, `PremiumChip`, `PremiumSkeleton`.
- Raw HTML buttons/inputs should only live here or inside blocks/patterns.

`src/components/blocks`

- Reusable product sections.
- Examples: hero, header shell, section header, CTA, cards, empty/loading states.
- Blocks should be visually complete and safe to place into a screen.

`src/components/patterns`

- Composed workflows made from primitives and blocks.
- Examples: search bar, search + filter bar, filter chips, tabs, interaction states.

`src/styles`

- Premium token CSS and token documentation exports.
- Use prefixed `--pm-*` tokens to avoid changing existing Community Connect screens.

## Consumer Screen Rule

New consumer screens must be composed from this premium layer.

Do:

- Import from `@/components/ui`, `@/components/blocks`, and `@/components/patterns`.
- Reuse `PremiumSectionHeader`, `PremiumSearchFilterBar`, card blocks, empty states, and loading states.
- Extend variants inside the material layer when a new recurring need appears.

Do not:

- Build screens from random one-off `div`, `button`, `input`, and ad hoc Tailwind clusters.
- Copy donor block styles directly into a screen.
- Mix unrelated visual systems on the same page.
- Redesign existing Community Connect screens as part of material-layer work.
- Touch generation, parser, lifecycle, or founder-flow code for visual materials.

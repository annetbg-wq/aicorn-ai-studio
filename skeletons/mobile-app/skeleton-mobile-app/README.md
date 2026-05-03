# Mobile App Skeleton (v0.2)

Production-grade React + TypeScript skeleton for consumer mobile products.
**75% complete** — an AI agent or developer fills the remaining 25% with
product-specific copy, data and feature surface.

## What changed in 0.2

- **No dead routes** — every bottom tab maps to a real registered page.
- **Theme system wired** — `useTheme` hook, `system | light | dark`, persisted, applied on `<html>`.
- **Config layer** — `src/config/{app,routes,navigation,theme}.ts` is the single source of truth.
- **Token-only colors** — added `--pm-on-brand` and `--pm-overlay`. Validator blocks `#fff`, `rgb(...)`, `bg-white`.
- **Lazy routes** — every page loads via `React.lazy`, `Suspense` falls back to `LoadingScreen`.
- **Loading state pattern** — `Home` shows a real `loading → empty → content` switch with `Skeleton`.
- **Validator** — `npm run validate` enforces: no `any`, no `console`, no dead tabs, no hardcoded colors, manifest in sync.
- **All 11 primitives** — added `Avatar`, `Dialog`, `Select`, `Tabs`.
- **Manifest accuracy** — counts and paths verified by the validator.

## File map

```
package.json           Vite + React + Radix + Tailwind + framer-motion
tsconfig.json          strict, noUnusedLocals, paths: @/*
vite.config.ts         dev server on :5173, alias @/
tailwind.config.js     darkMode: class, every color references a CSS var
postcss.config.js
index.html

src/
  main.tsx
  App.tsx              router + guards + lazy pages + ErrorBoundary
  index.css            CSS tokens (light + dark) + safe-area utilities
  config/
    app.ts             APP_CONFIG, STORAGE_KEYS
    routes.ts          ROUTES constants + detailRoute()
    navigation.ts      BOTTOM_TABS — drives BottomTabs component
    theme.ts           ThemeChoice, resolveTheme()
  context/
    AppContext.tsx     profile + theme + plan + usage; useApp()
  hooks/
    useLocalStorage.ts typed, SSR-safe, tab-synced
    useTheme.ts        applies/removes `dark` class on <html>
  data/
    types.ts           UserProfile, FeedItem, ProgressEntry, PricingTier
    seed.ts            5 feed items, 7 progress days, 3 pricing tiers
  lib/
    cn.ts              clsx + tailwind-merge
  components/
    ErrorBoundary.tsx
    LoadingScreen.tsx
    EmptyState.tsx
    BottomTabs.tsx     reads BOTTOM_TABS, no hardcoded routes
    PaywallSheet.tsx
    ui/
      Avatar.tsx       Radix
      Badge.tsx
      Button.tsx       cva variants, asChild via Slot
      Card.tsx
      Dialog.tsx       centered modal
      Input.tsx
      Progress.tsx     Radix
      Select.tsx       Radix
      Sheet.tsx        bottom sheet
      Skeleton.tsx
      Tabs.tsx         Radix
  pages/
    Onboarding.tsx     3-step wizard (welcome → name → goal)
    Home.tsx           feed + FAB + paywall trigger
    Detail.tsx         /detail/:id, back button, action surface
    Create.tsx         compose form (NEW — fills the /create tab)
    Progress.tsx       streak + done/total + weekly bars
    Profile.tsx        avatar + plan + theme select + sign out
  route-manifest.json  machine-readable route table

scripts/
  validate.mjs         CI quality gate
```

## Running locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run validate     # custom skeleton checks
npm run build        # production bundle
```

## Customization workflow

1. Edit `src/config/app.ts` — set `name`, `tagline`, `freeActionLimit`.
2. Rewrite copy at every `PRODUCT:` marker.
3. Replace exports in `src/data/seed.ts` with real domain entities.
4. Add new pages: register in `src/config/routes.ts`, add a `<Route>` in `App.tsx`,
   add a tab in `src/config/navigation.ts` if it needs one. Update the manifest.
5. Run `npm run validate` before shipping.

## What the validator catches

- `: any` annotations anywhere in `src/`.
- `console.log` / `console.error` / etc. in `src/`.
- Bottom tabs that point at unregistered routes.
- Pages declared in the manifest but missing on disk.
- Hardcoded colors (`#fff`, `rgb(...)`, `bg-white`, `text-black`).
- Manifest route count out of sync with `src/config/routes.ts`.
- Manifest tab count out of sync with `src/config/navigation.ts`.

If any of these fire, `npm run validate` exits non-zero and CI blocks the merge.

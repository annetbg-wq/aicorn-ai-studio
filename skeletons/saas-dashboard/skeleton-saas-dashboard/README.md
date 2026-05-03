# SaaS Dashboard Skeleton

Production-grade React + TypeScript skeleton for B2B / admin / analytics products.
**75% complete** — agent fills the remaining 25% with the product domain.

## Layout

- Sidebar (collapsible, grouped: Workspace + Account)
- Top bar (breadcrumb, global search, notifications, avatar)
- Routed content area (Dashboard / Data / Settings)

## Pages

- **Dashboard** — onboarding checklist + 4 KPI cards + 12-week sparkline + recent activity
- **Data** — sortable, filterable, paginated table of records with status badges
- **Settings** — Tabs: General (profile + theme), Team, Billing, API keys

## What's wired

- `useTable` — pure sort/filter/paginate hook for any list
- `useTheme` — system / light / dark, persisted, applied on `<html>`
- `OnboardingChecklist` — first-run activation tasks, dismissible
- `Sparkline` — pure SVG, token-driven, swappable for a real chart
- All 11 UI primitives: Avatar, Badge, Button, Card, Dialog, Input, Progress, Select, Sheet, Skeleton, Tabs

## Running

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run validate     # CI quality gate
npm run build
```

## Customization

1. Edit `src/config/app.ts` — set `name`, `tagline`.
2. Rewrite copy at every `PRODUCT:` marker.
3. Replace exports in `src/data/seed.ts` with real entities.
4. Add new sidebar groups in `src/config/navigation.ts` after registering routes.
5. Run `npm run validate` before shipping.

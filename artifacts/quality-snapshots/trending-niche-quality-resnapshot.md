# Trending Niche Quality Re-Snapshot

## Summary verdict
**PARTIAL** — PR #24 definitively fixed the missing-component/import failure mode. All 3 runs now complete the full architect → coder pipeline without import errors. However, 0/3 still succeed because a new quality gate bottleneck emerged: the coder leaves a `PRODUCT` literal placeholder in `pages/Dashboard.tsx` (runs 1 & 3) or generates empty local data arrays (run 2), and the repair pass cannot fix these in the single allowed attempt.

---

## Comparison with previous snapshot

**Previous (pre-PR #24):**
- 3 runs attempted
- 0 / 3 succeeded
- 2 failed (1 packaging, 1 missing `KPICard` import after coder ran)
- 1 timed out (packaging `spawn EINVAL` on bridge)
- Root cause: coder referenced `components/ui/kpicard` which was not in the skeleton, after implicit "mental planning" with no written plan

**Current (post-PR #24):**
- 3 runs attempted
- 0 / 3 succeeded
- 3 failed (all on quality gate after repair)
- 0 timed out
- Root cause shift: coder now writes a Product Assembly Plan, completes coding without import errors, but leaves a `PRODUCT` token or empty data arrays that the quality gate catches and the repair pass cannot clear in one shot

**Improvement confirmed:**
- Packaging reliability: 3/3 reached the engine (vs 2/3 previously, with 1 timeout)
- Import/missing-component errors: 0 (vs at least 1 confirmed in previous run 2)
- Pipeline completion (coder runs to end): 3/3 (vs 1/3 previously)

---

## Runs table

| run | trend idea | same as previous? | direct-launch confirmed | skeleton | Product Assembly Plan observed | preview status | quality verdict | main issue |
|-----|-----------|:-----------------:|:-----------------------:|----------|:------------------------------:|---------------|----------------|-----------|
| 1 | Margin Recovery Cockpit for Shopify Brands | yes | ✓ | saas-dashboard | ✓ (no import errors) | Превью временно недоступно | FAIL | Quality gate: `pages/Dashboard.tsx: PRODUCT` literal placeholder |
| 2 | WorkWell - Mental Health Assistant for Remote Workers | yes (prev timed out) | ✓ (2nd attempt) | mobile-app | ✓ (no import errors) | Current run failed before usable output | FAIL | Quality gate: `hooks/useMentalHealthResources.ts: empty local arrays without realistic sample data` |
| 3 | Eco-Friendly Supply Chain Navigator | no (new archetype) | ✓ | saas-dashboard (inferred) | ✓ (no import errors) | Current run failed before usable output | FAIL | Quality gate: `pages/Dashboard.tsx: PRODUCT` literal placeholder |

---

## Per-run notes

### Run 1 — Margin Recovery Cockpit for Shopify Brands
- **Input:** `Margin Recovery Cockpit for Shopify Brands` via "В работу" (Trending niches → Идеи дня, card 1)
- **Run ID:** `3sr1f7zgmpl4jjka`
- **TREND context injected:** yes — full market-aware brief visible in chat:  
  _"return fraud, actionable insights, recover lost margins… visual direction: dark-slate"_
- **Pipeline:** ✓ Дизайн-пак → ✓ Архитектура → ✓ Выбор skeleton → ✓ Кодирование (88%) → ✗ Финальная сборка
- **Telemetry highlights:**
  - `shadcn add exited 1` → atomic fallback to `saas-dashboard` skeleton
  - Coder completed at 88% — no import/component hallucination errors
  - Quality gate: `Generic placeholder content in 1 location(s): pages/Dashboard.tsx: PRODUCT`
  - Repair attempted; quality gate triggered again with same message → marked `generation_failed`
  - Preview: "Превью временно недоступно"
- **Strengths:** pipeline fully traversed; no KPICard missing import (main previous failure); coder produced code that cleared compiler but failed content check
- **Weaknesses:** `PRODUCT` token left as literal in Dashboard.tsx; repair did not substitute it; quality gate correctly blocks this
- **Missing component issues:** none
- **Screenshot:** `artifacts/quality-snapshots/screenshots/resnapshot/run1-quality-gate-fail.png`

---

### Run 2 — WorkWell - Mental Health Assistant for Remote Workers
- **Input:** `WorkWell - Mental Health Assistant for Remote Workers` via "В работу" (Trending niches → Идеи недели, card 1)
- **Run ID:** `l90v8zkcmpl4ttvx`
- **Note:** First attempt opened an empty engine with no TREND context (backend returning 500/503 after recovery from Run 1). Second attempt ~30s later succeeded with full context injection.
- **TREND context injected:** yes (second attempt) — pitch and visual direction visible in chat
- **Pipeline:** ✓ Дизайн-пак → ✓ Архитектура → ✓ Выбор skeleton → ✓ Кодирование → ✗ Финальная сборка
- **Telemetry highlights:**
  - `shadcn add exited 1` → atomic fallback to `mobile-app` skeleton
  - Coder completed — no import errors
  - Quality gate: `Empty or generic dashboard metric cards: hooks/useMentalHealthResources.ts: empty local arrays without realistic sample data`
  - Repair attempted; same quality gate message → `generation_failed`
  - Preview: "Current run failed before usable output"
- **Strengths:** previously this run timed out at packaging (`spawn EINVAL`); it now completes the full pipeline; different failure mode from Run 1 (data quality rather than placeholder token)
- **Weaknesses:** coder generated `useMentalHealthResources.ts` hook with empty `[]` arrays as data source rather than realistic sample data; quality gate correctly rejects; repair did not fill arrays
- **Missing component issues:** none
- **Screenshot:** `artifacts/quality-snapshots/screenshots/resnapshot/run2-quality-gate-fail.png`

---

### Run 3 — Eco-Friendly Supply Chain Navigator
- **Input:** `Eco-Friendly Supply Chain Navigator` (new idea, not in previous snapshot) via "В работу" (Trending niches → Идеи дня, card 2)
- **Run ID:** `2u5zvvo6mpl50b2h`
- **Note:** This is a new archetype. Previous snapshot had no third completed run (timeout). Using this idea as the closest "business tool with supply chain / sustainability dashboard" archetype replacement.
- **TREND context injected:** yes — pitch with sustainability metrics, carbon footprints, dark-slate visual direction
- **Pipeline:** ✓ Дизайн-пак → ✓ Архитектура → ✓ Выбор skeleton → ✓ Кодирование → ✗ Финальная сборка
- **Telemetry highlights:**
  - Architecture phase confirmed (was at 30% at capture; proceeded to 45% coder)
  - Coder completed — no import/component errors
  - Quality gate: `Generic placeholder content in 1 location(s): pages/Dashboard.tsx: PRODUCT` (same string as Run 1)
  - Repair attempted; same failure → `generation_failed`
  - Preview: "Current run failed before usable output"
- **Strengths:** same as Run 1 — pipeline fully traversed; no missing component issues; coder architecture appears solid
- **Weaknesses:** `PRODUCT` placeholder pattern recurs in Dashboard.tsx; this appears to be a systematic pattern in the coder when generating dashboard-type apps — the word `PRODUCT` is used as a placeholder where the product name should appear
- **Missing component issues:** none
- **Screenshot:** `artifacts/quality-snapshots/screenshots/resnapshot/run3-quality-gate-fail.png`

---

## Cross-run conclusion

**Did Product Assembly Plan reduce missing component/component hallucination failures?**  
Yes — definitively. Previous snapshot had 1 confirmed `components/ui/kpicard` import error (run 2) and 2 runs never reached the coder at all. In this snapshot, all 3 runs reached the coder and completed without any import/missing-component errors. The failure mode shifted entirely.

**Did it improve first screen clarity?**  
Not measurably — 0/3 produced a visible preview, so first screen quality cannot be assessed. However, the fact that the coder runs fully (without import errors stopping compilation) means the architecture/first-screen intent is at least being produced in code. The blocker is now the quality gate, not the coder's component references.

**Did it improve product-specific composition?**  
Partially. The market-aware brief terms appear in injected prompts (return fraud, sustainability metrics, mental health resources) and the coder responds with domain-named files (`useMentalHealthResources.ts`, sustainability-specific Dashboard.tsx), which is an improvement over generic filler. The `PRODUCT` placeholder is the remaining generic gap.

**Is the remaining bottleneck prompt planning, component inventory, preview compile, repair, or visual quality?**  
**Repair** is the proximate bottleneck — specifically, the repair pass cannot fix:  
1. The literal `PRODUCT` token in `pages/Dashboard.tsx` (runs 1 & 3)  
2. Empty local data arrays in hooks (run 2)  
The quality gate correctly identifies these issues, but the single-shot repair prompt fails to substitute/fill them. The root cause of the failures now lives in the repair prompt, not in the initial coder prompt.

---

## Recommended next implementation step

**Add an explicit "no bare PRODUCT token + no empty data arrays" rule to the repair prompt.**

Specifically: the repair instruction should include a literal check rule — if the output contains the word `PRODUCT` as a standalone token (not part of a longer product name), replace it with the actual product name extracted from the TREND context. Similarly, if a hook or data file contains `[]` as a literal export, the repair pass must generate 3–5 realistic sample entries before re-submitting to the quality gate.

This is a targeted, low-risk prompt fix that addresses the exact failure pattern observed in 3/3 current runs and requires no source code change to the pipeline architecture.

---

## Validation

```
npm run typecheck --prefix frontend
→ tsc --noEmit --skipLibCheck (exit 0)
```

---

## Evidence screenshots

| file | description |
|------|-------------|
| `artifacts/quality-snapshots/screenshots/resnapshot/panel-overview.png` | Trending niches panel with all idea cards |
| `artifacts/quality-snapshots/screenshots/resnapshot/run1-launch-click.png` | Run 1 — "В работу" button click moment |
| `artifacts/quality-snapshots/screenshots/resnapshot/run1-engine-12pct.png` | Run 1 — engine opened at 12% pipeline |
| `artifacts/quality-snapshots/screenshots/resnapshot/run1-coder-done-88pct.png` | Run 1 — coder completed at 88%, no import errors |
| `artifacts/quality-snapshots/screenshots/resnapshot/run1-quality-gate-fail.png` | Run 1 — quality gate failure (PRODUCT placeholder) |
| `artifacts/quality-snapshots/screenshots/resnapshot/run2-empty-engine.png` | Run 2 — first attempt: empty engine (silent injection fail) |
| `artifacts/quality-snapshots/screenshots/resnapshot/run2-quality-gate-fail.png` | Run 2 — quality gate failure (empty data arrays) |
| `artifacts/quality-snapshots/screenshots/resnapshot/run3-engine-30pct.png` | Run 3 — engine opened at 30% Architecture |
| `artifacts/quality-snapshots/screenshots/resnapshot/run3-quality-gate-fail.png` | Run 3 — quality gate failure (PRODUCT placeholder) |

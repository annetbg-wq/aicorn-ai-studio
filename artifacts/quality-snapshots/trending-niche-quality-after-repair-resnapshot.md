# Trending Niche Quality After Repair Re-Snapshot

**Branch:** `p2/trending-niche-quality-after-repair-resnapshot`
**Date:** 2025-07 (after PR #26 merge)
**Baseline:** `main` at `eaa4520` — "P2: strengthen quality repair for PRODUCT token and empty data arrays"

---

## Summary verdict

**FAIL — 0/3 succeeded**

PR #26's repair rules (PRODUCT token replacement, empty array fill) could not be verified because the quality gate triggered a hard contract error before repair was ever reached. A new blocking bottleneck was discovered: the `saas-dashboard` skeleton's `BottomTabs.tsx` imports `BOTTOM_TABS` from `@/config/navigation`, but the coder regenerates `navigation.ts` with only `SIDEBAR_NAV`. This error fires deterministically on every run, halting the pipeline at ~8 seconds.

---

## Comparison

| Snapshot | Runs | Succeeded | Bottleneck |
|---|---|---|---|
| Initial (`trending-niche-quality-snapshot.md`) | 3 | 0 | Missing component/import hallucinations (e.g. `KPICard`) |
| Post-Product-Assembly-Plan (task context only — file not committed) | 3 | 0 | PRODUCT placeholder + empty `[]` arrays survived repair |
| **Current — after PR #26** | 3 | 0 | `missing_named_export`: `BottomTabs.tsx` needs `BOTTOM_TABS` from `navigation.ts`; coder generates only `SIDEBAR_NAV`; repair never reached |

**Progress:** PR #24 eliminated `KPICard`-style hallucinations. PR #26 added repair rules for PRODUCT tokens and empty arrays. Both improvements are real, but a new pre-repair blocker is masking them.

---

## Runs table

| Run | Trend idea | Same as previous? | Direct-launch | Skeleton | PAP observed | Repair ran? | PRODUCT token fixed? | Empty arrays fixed? | Preview status | Quality verdict | Main issue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Clinic Inbox Triage Copilot (Daily) | closest-archetype | ✓ | `saas-dashboard` | ✓ | ✗ | ✗ (repair not reached) | ✗ (repair not reached) | failed | FAIL | `BOTTOM_TABS` missing export — contract error at 8s |
| 2 | Freelancer Cashflow Guard (Daily) | closest-archetype | ✓ | `saas-dashboard` | ✓ | ✗ | ✗ (repair not reached) | ✗ (repair not reached) | failed | FAIL | identical `BOTTOM_TABS` error |
| 3 | Creator Loop Lab for Indie Games (Daily) | different-archetype | ✓ | `saas-dashboard` | ✓ | ✗ | n/a (timeout) | n/a (timeout) | timeout | FAIL | packaging timed out (>120s); app state degraded after 2 failed runs |

**Notes on idea selection:**  
The panel showed LLM-generated Daily ideas at test time. Title extraction captured the section heading "Daily ideas" in the telemetry JSON, but screenshot `run0-ideas-loaded.png` confirms the actual ideas: Clinic Inbox Triage Copilot, Freelancer Cashflow Guard, Creator Loop Lab for Indie Games — all three default daily ideas, same archetypes as the previous target selection.

---

## Per-run notes

### Run 1 — Clinic Inbox Triage Copilot

**Input:** Clinic Inbox Triage Copilot (Daily, Medicine / AI / Productivity)
**Direct-launch path:** ✓ Build now clicked from Trending Niches panel → packaging started

**Telemetry highlights:**
- Packaging completed (~90s)
- Pipeline started
- Quality gate fired at **8s** with:
  ```
  root_cause_type: missing_named_export
  file: src/components/BottomTabs.tsx
  import_path: @/config/navigation
  expected: named export BOTTOM_TABS
  actual: available exports: NavGroup, NavItem, SIDEBAR_NAV
  ```
- `totalFiles: 56`, `generatedDeltaCount: 1`, `materializedFileCount: 1`
- The single generated delta is `config/navigation.ts`, which the coder created with only `SIDEBAR_NAV`, dropping the `BOTTOM_TABS` export that `BottomTabs.tsx` (a shell owner file) requires
- Repair step: **not triggered** — the pipeline terminated at the contract-error stage

**Strengths:** Navigation, packaging, and architect/coder all completed. Only the final export consistency check failed.

**Weaknesses:** Coder generates `navigation.ts` without preserving `BOTTOM_TABS`, which the skeleton's mobile nav shell file expects.

**PRODUCT placeholder issues:** 11 skeleton template files contain `PRODUCT` — but repair never ran, so this is the expected pre-repair state, not a regression.

**Empty array issues:** 3 skeleton template files (`FAQ.tsx`, `Marquee.tsx`, `accordion.tsx`) contain `= []` — same situation: pre-repair state, not actionable without repair running.

**Screenshots:**
- `artifacts/quality-snapshots/screenshots/after-repair-resnapshot/run1-01-trend-panel.png`
- `artifacts/quality-snapshots/screenshots/after-repair-resnapshot/run1-04-fail.png`

---

### Run 2 — Freelancer Cashflow Guard

**Input:** Freelancer Cashflow Guard (Daily, Fintech / Productivity / AI)
**Direct-launch path:** ✓

**Telemetry highlights:**
- Identical failure — `BOTTOM_TABS` missing export at 8s
- `generatedDeltaCount: 1`, `materializedFileCount: 0` (delta written but not flushed before gate fired)
- Confirms the error is deterministic and not idea-specific — every `saas-dashboard` build hits it

**Strengths / Weaknesses:** same as run 1.

**Screenshots:**
- `artifacts/quality-snapshots/screenshots/after-repair-resnapshot/run2-01-trend-panel.png`
- `artifacts/quality-snapshots/screenshots/after-repair-resnapshot/run2-04-fail.png`

---

### Run 3 — Creator Loop Lab for Indie Games

**Input:** Creator Loop Lab for Indie Games (Daily, Games / Social / AI)
**Direct-launch path:** ✓ — Build now clicked

**Telemetry highlights:**
- Packaging timed out at 120s — no `generating` state was reached
- After two consecutive failed runs that left the app in an error state with orphaned project artifacts, the third packaging pass did not complete within the 120s budget
- Repair: not triggered

**Screenshots:**
- `artifacts/quality-snapshots/screenshots/after-repair-resnapshot/run3-01-trend-panel.png`

---

## Cross-run conclusion

**Did PR #26 eliminate PRODUCT placeholder failures?**
Cannot confirm. Repair was never triggered across all 3 runs. The 11 PRODUCT tokens observed are in skeleton template files (expected pre-repair state). The repair rules added by PR #26 were not exercised.

**Did PR #26 eliminate empty visible-content arrays?**
Cannot confirm for the same reason. The 3 empty `[]` arrays in `FAQ.tsx`, `Marquee.tsx`, and `accordion.tsx` are pre-repair skeleton template stubs. Repair did not run.

**Did quality repair now complete successfully?**
No. The pipeline never reached repair. The hard contract error (`missing_named_export`) fires before the repair step.

**Did previews reach ready?**
No — 0/3.

**Is the remaining bottleneck repair, preview compile, visual quality, weak data/content, skeleton choice, or coder composition?**
**Coder composition + skeleton contract.** The `saas-dashboard` skeleton's `BottomTabs.tsx` is a shell owner file that imports `BOTTOM_TABS` from `navigation.ts`. The coder regenerates `navigation.ts` with only `SIDEBAR_NAV`. This is a structural contract mismatch that the quality gate enforces, but the repair step does not fix (it only handles PRODUCT tokens and empty arrays, not missing exports). The error is deterministic: every run using `saas-dashboard` will hit it.

**Did Product Assembly Plan + repair fixes materially improve direct-launch generation?**
Progress is real but invisible at the live-preview level:
- PR #24 eliminated hallucinated component imports (KPICard etc.) — verified
- PR #26 added two repair rules — cannot yet be verified due to the new pre-repair blocker
The pipeline now gets further (packaging + architect + coder + quality gate all run), but the new bottleneck prevents any run from reaching repair or preview.

---

## Recommended next implementation step

**Fix the `saas-dashboard` skeleton so that `navigation.ts` exports `BOTTOM_TABS`.**

The skeleton's `BottomTabs.tsx` is a shell owner file that imports `{ BOTTOM_TABS }` from `@/config/navigation`. The coder is generating `navigation.ts` with only `SIDEBAR_NAV`. The coder has no signal that `BOTTOM_TABS` is required.

Concrete action: Add a `BOTTOM_TABS` array export to the skeleton's `src/config/navigation.ts` template so that:
1. The skeleton is self-consistent before and after coder generation
2. The coder, seeing the existing `BOTTOM_TABS` in the template, preserves or replaces it rather than dropping it
3. The quality gate no longer triggers a hard contract error on every `saas-dashboard` build

Do not change repair, do not change the quality gate, do not change Product Assembly Plan. This is a single skeleton file change.

---

## Skeleton file evidence

**`preview-workspace/src/config/navigation.ts` (coder-generated):**
Exports: `NavItem`, `NavGroup`, `SIDEBAR_NAV` — no `BOTTOM_TABS`.

**`preview-workspace/src/components/BottomTabs.tsx` (skeleton shell):**
Line 2: `import { BOTTOM_TABS } from '@/config/navigation';`

This mismatch is the complete and sole cause of all 3 failures in this snapshot.

---

## Screenshots index

| File | Description |
|---|---|
| `run0-dashboard.png` | Initial dashboard state |
| `run0-ideas-loaded.png` | Trending Niches panel with all 9 idea cards loaded |
| `run1-01-trend-panel.png` | Run 1 panel state before build |
| `run1-02-packaging.png` | Run 1 packaging started |
| `run1-03-gen-started.png` | Run 1 generation started |
| `run1-04-fail.png` | Run 1 failed state |
| `run2-01-trend-panel.png` | Run 2 panel — LLM-generated ideas visible |
| `run2-fail-no-idea.png` | Previous attempt showing LLM ideas vs. default search mismatch |
| `run3-01-trend-panel.png` | Run 3 panel state |

---

## Validation

`npm run typecheck --prefix frontend` — **PASSED** (exit code 0)

No source code was modified in this snapshot run. The typecheck validates the frontend application source only.

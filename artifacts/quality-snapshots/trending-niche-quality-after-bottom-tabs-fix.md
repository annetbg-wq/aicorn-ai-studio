# Trending Niche Quality After Bottom Tabs Fix

**Branch:** `p2/trending-niche-quality-after-bottom-tabs-fix`  
**Date:** 2026-05-25  
**Merged fix:** PR #28 — added `BOTTOM_TABS` export to `skeletons/saas-dashboard/skeleton-saas-dashboard/src/config/navigation.ts`

---

## Summary verdict

**FAIL — 0/3 succeeded**

New blocker emerged after PR #28: packaging step fails with **"Model returned an invalid blueprint payload"** before reaching runArchitect. The deterministic BOTTOM_TABS failure at ~8 s is no longer present, which represents measurable forward progress, but the run sequence now stalls at an earlier model-response validation gate.

---

## Comparison

| Snapshot | Result | Bottleneck |
|---|---|---|
| Initial | 0/3 | Missing components / KPICard hallucinations |
| Post Product Assembly Plan | 0/3 | PRODUCT placeholders + empty `[]` arrays after repair |
| After PR #26 repair | 0/3 | Deterministic: `BOTTOM_TABS` not exported in nav — crash at ~8 s |
| **After PR #28 (this run)** | **0/3** | **"Model returned an invalid blueprint payload" during packaging** |

Progress: the 8 s deterministic crash is gone. The run now reaches the packaging/brief-generation step (~2 s after click) and fails there, never reaching runArchitect.

---

## Runs table

| # | Trend idea | Same as prev? | Direct-launch | Skeleton | PAP observed | Repair ran? | BOTTOM_TABS fixed? | PRODUCT token fixed? | Empty `[]` fixed? | Preview status | Verdict | Main issue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AI-триаж входящих для клиник (Clinic Inbox Triage Copilot) | ✅ yes | ✅ yes | saas-dashboard | ❌ not reached | ❌ no | ⚠️ not verifiable | ❌ no (old WS) | ❌ no (old WS) | timeout | ❌ fail | Model returned an invalid blueprint payload |
| 2 | Cashflow Guard для фрилансеров (Freelancer Cashflow Guard) | ✅ yes | ✅ yes | saas-dashboard | ❌ not reached | ❌ no | ⚠️ not verifiable | ❌ no (old WS) | ❌ no (old WS) | timeout | ❌ fail | Model returned an invalid blueprint payload |
| 3 | Creator Loop Lab для indie games (Creator Loop Lab) | ✅ yes | ✅ yes | saas-dashboard | ❌ not reached | ❌ no | ⚠️ not verifiable | ❌ no (old WS) | ❌ no (old WS) | timeout | ❌ fail | Model returned an invalid blueprint payload |

Notes:
- PRODUCT token and empty `[]` files reflect the **previous generation's workspace** (preview-workspace/src, 45 files). No new generation completed, so workspace was not updated.
- BOTTOM_TABS fix: the skeleton template was verified to contain `BOTTOM_TABS` export after PR #28. The 8 s crash is gone. Whether the coder would emit BOTTOM_TABS in a delta is unverifiable since coder phase was never reached.

---

## Per-run notes

### Run 1 — AI-триаж входящих для клиник (Clinic Inbox Triage Copilot)

**Input:** daily idea #1, "В работу" (direct-launch) button clicked  
**Direct-launch path:** confirmed — PACKAGING card appeared immediately: *"AI-триаж входящих для клиник — Проектируем путь к aha-момент…"*  
**Idea confirmed same as previous runs:** yes  
**Total elapsed:** ~495 s (150 s packaging timeout + 340 s poll timeout)

**Telemetry highlights:**
- At `run1-03-after-click.png` (t+2 s): PACKAGING card shown, packaging spinner active
- At `run1-04-packaging.png` (t+150 s): Error displayed — **"Model returned an invalid blueprint payload"**
- Ideas refreshed to a new set (Agent Veracity Console, Borderless Warranty Vault, Carbon Passport for SMEs)
- Backend console: `500 Internal Server Error` on packaging API call
- Subsequent progress screenshots (t+30 s … t+331 s) all identical — page frozen at error state

**BOTTOM_TABS issue:** not seen at 8 s (deterministic crash eliminated)  
**PRODUCT placeholder issue:** not applicable (workspace not updated)  
**Empty array issue:** not applicable (workspace not updated)  
**Missing component issues:** not reached  
**Screenshot:** `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run1-03-after-click.png`, `run1-04-packaging.png`

---

### Run 2 — Cashflow Guard для фрилансеров (Freelancer Cashflow Guard)

**Input:** daily idea #2, "В работу" (direct-launch) button clicked  
**Direct-launch path:** confirmed — PACKAGING card: *"Cashflow Guard для фрилансеров — Проектируем путь к aha-момент…"*  
**Idea confirmed same as previous runs:** yes  
**Total elapsed:** ~495 s

**Telemetry highlights:**
- At `run2-03-after-click.png` (t+2 s): PACKAGING card shown with correct idea name
- Same 3 daily ideas visible (Clinic Inbox Triage, Cashflow Guard, Creator Loop Lab)
- Backend returned 500, packaging aborted
- Same frozen error state after 150 s

**BOTTOM_TABS issue:** not seen  
**Screenshot:** `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run2-03-after-click.png`

---

### Run 3 — Creator Loop Lab для indie games

**Input:** daily idea #3, "В работу" (direct-launch) button clicked  
**Direct-launch path:** confirmed — PACKAGING card: *"Creator Loop Lab для indie games — Проектируем путь к aha-момент…"*  
**Idea confirmed same as previous runs:** yes  
**Total elapsed:** ~494 s

**Telemetry highlights:**
- At `run3-03-after-click.png` (t+2 s): PACKAGING card shown with correct idea name
- Same 3 daily ideas visible
- Backend returned 500, packaging aborted
- Same frozen error state

**BOTTOM_TABS issue:** not seen  
**Screenshot:** `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run3-03-after-click.png`

---

## Cross-run conclusion

**Did PR #28 eliminate the BOTTOM_TABS blocker?**  
The deterministic 8 s crash (`missing_named_export: BOTTOM_TABS`) is no longer observed in any of the 3 runs. The skeleton template now correctly exports `BOTTOM_TABS`. However, because all 3 runs failed at the packaging step (before runCoder), whether the coder would still emit a BOTTOM_TABS-free delta is untested. The skeleton fix is necessary but not yet proven sufficient.

**Did repair now run when needed?**  
No. Repair requires a generated workspace to inspect. No generation completed.

**Did PR #26 repair rules become verifiable?**  
No. The bottleneck is earlier in the pipeline (packaging/brief). Repair is never reached.

**Did previews reach ready?**  
No. Zero previews loaded.

**Is the remaining bottleneck repair, preview compile, visual quality, skeleton choice, or coder composition?**  
The remaining bottleneck is **packaging/blueprint generation**: the backend model call during the brief-generation step returns an invalid blueprint payload (HTTP 500). The pipeline stalls here — no project is created, no workspace is seeded, no coder runs.

---

## Recommended next implementation step

**Fix the packaging/blueprint step to handle and retry invalid model responses.**

Specifically: audit the backend handler that receives the model's brief/blueprint JSON response. Add schema validation with a clear error, and add at least one retry with a simplified prompt fallback when the model returns malformed or non-JSON output. Do not change the skeleton, coder, repair, quality gate, or preview pipeline.

This is the single highest-leverage fix: resolving the 500 at packaging would unblock all 3 runs from reaching runArchitect, runCoder, and the repair/quality gate that previous PRs improved.

---

## Artifact paths

| Item | Path |
|---|---|
| Report | `artifacts/quality-snapshots/trending-niche-quality-after-bottom-tabs-fix.md` |
| Telemetry JSON | `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run-telemetry.json` |
| Run 1 — packaging triggered | `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run1-03-after-click.png` |
| Run 1 — blueprint error | `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run1-04-packaging.png` |
| Run 2 — packaging triggered | `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run2-03-after-click.png` |
| Run 3 — packaging triggered | `artifacts/quality-snapshots/screenshots/after-bottom-tabs-fix/run3-03-after-click.png` |

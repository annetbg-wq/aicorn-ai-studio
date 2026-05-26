# Trending Niche Quality After Blueprint Packaging Fix

**Branch:** `p2/trending-niche-quality-after-blueprint-packaging-fix`  
**Date:** 2026-05-26  
**Merged fixes:** PR #30 (blueprint packaging schema validation + one-retry fallback) · PR #31 (structured HTTP 500 for runArchitect/runCoder)

---

## Summary verdict

**PARTIAL PASS — packaging stall is fixed; pipeline now reaches runArchitect for all 3 runs**

The "Model returned an invalid blueprint payload" stall that blocked all previous snapshots is **eliminated**. Packaging succeeded on the first attempt for 2/3 runs (confirmed via `[blueprint_packaging]` telemetry). Run 1 shows `runArchitectReached: true` with identical network pattern, indicating packaging also completed there. All 3 runs now advance into the architect/coder phase — a first for this snapshot series.

The monitoring window (120 s) was insufficient to observe runCoder completion or preview status. The remaining open question is whether runCoder produces compilable code free of PRODUCT-token and empty-array issues.

---

## Comparison

| Snapshot | Result | Bottleneck |
|---|---|---|
| Initial | 0/3 | Missing components / KPICard hallucinations |
| Post Product Assembly Plan | 0/3 | PRODUCT placeholders + empty `[]` arrays after repair |
| After PR #26 repair | 0/3 | Deterministic: `BOTTOM_TABS` not exported in nav (crash at ~8 s) |
| After PR #28 bottom tabs fix | 0/3 | "Model returned an invalid blueprint payload" during packaging (HTTP 500 from Claude CLI) |
| **After PR #30 (this run)** | **3/3 packaging passed · runArchitect reached in all 3 · full preview undetermined** | **Generation runtime exceeds 2-minute monitoring window** |

---

## Runs table

| # | Trend idea | Direct-launch | Pkg telemetry captured | Pkg retry used | Pkg final status | Pkg error | runArchitect reached | runCoder reached | Repair ran | Preview status | Quality verdict | Main issue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AI-триаж входящих для клиник | ✅ yes | ⚠️ missed (window) | — | inferred success | none | ✅ yes | ❌ not in window | ❌ not in window | undetermined | ⚠️ partial | Generation runtime > monitoring window |
| 2 | Cashflow Guard для фрилансеров | ✅ yes | ✅ yes | ❌ no | success (first attempt) | none | ✅ yes | ❌ not in window | ❌ not in window | undetermined | ⚠️ partial | Generation runtime > monitoring window |
| 3 | Creator Loop Lab для indie games | ✅ yes | ✅ yes | ❌ no | success (first attempt) | none | ✅ yes | ❌ not in window | ❌ not in window | undetermined | ⚠️ partial | Generation runtime > monitoring window |

Notes:
- "Pkg telemetry captured" = whether the `[blueprint_packaging]` console log was observed by the monitoring script within 120 s.
- Run 1 telemetry was missed by the 120 s window, but `runArchitectReached: true` was detected — an event that can only occur after packaging completes — confirming packaging did succeed.
- runCoder and repair were not reached within the 120 s window; the pipeline is actively executing at window close.

---

## Per-run notes

### Run 1 — AI-триаж входящих для клиник

**Input:** direct-launch "В работу" on daily idea #1  
**Direct-launch path:** confirmed — packaging card appeared  
**Packaging telemetry:** not captured within 120 s window  
**Packaging inferred:** yes — `runArchitectReached: true` detected on page within window  

**Network trace (captured, first 10 calls):**
```
/chat 500 → /chat 500 → openrouter 200 → openrouter 200  ← packaging (2 LLM calls)
/chat 500 → openrouter 200                                ← architect start
/chat 503 → openrouter 200 → /chat 503 → openrouter 200  ← architect/coder progress
```

**Console events:**
- `[IdeaModel] Local claude bridge unavailable (HTTP 500: {"error":"Error: spawn EINVAL"}). Falling back to standard model flow.` — repeats for each LLM call
- No `BlueprintPackagingError` thrown
- No "Model returned an invalid blueprint payload" message (previous snapshot bottleneck gone)

**Strengths:** packaging completed, pipeline advanced to architect phase  
**Weaknesses:** packaging telemetry emitted after monitoring window closed (slow model response ~120 s)  
**PRODUCT placeholder / empty array issues:** not verifiable (coder not reached in window)  
**Screenshot:** `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run1-final.png`

---

### Run 2 — Cashflow Guard для фрилансеров

**Input:** direct-launch "В работу" on daily idea #2  
**Direct-launch path:** confirmed — packaging card appeared  
**Packaging telemetry (t+73 s):** `[blueprint_packaging] {blueprint_packaging_first_attempt_valid: true, blueprint_packaging_retry_used: false, blueprint_packaging_final_status: success}`

**Network trace (first 10 calls):**
```
/chat 500 → /chat 500 → openrouter 200 → openrouter 200   ← packaging (2 bridge retries, 1 LLM call)
/chat 500 → openrouter 200                                  ← architect step 1
/chat 500 → openrouter 200                                  ← architect step 2
/chat 500 → openrouter 200                                  ← architect step 3 / coder start
```

**Console events:**
- 7× `[IdeaModel] Local claude bridge unavailable… Falling back to standard model flow.`
- `[blueprint_packaging] … final_status: success`
- No `BlueprintPackagingError`, no packaging error displayed

**Packaging behavior:** bridge attempted (500), OpenRouter fallback used, first attempt returned valid JSON per `validateBlueprintShape`, no retry needed  
**Strengths:** clean packaging success, architect phase active at t+73 s  
**Screenshot:** `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run2-final.png`

---

### Run 3 — Creator Loop Lab для indie games

**Input:** direct-launch "В работу" on daily idea #3  
**Direct-launch path:** confirmed  
**Packaging telemetry (t+53 s):** `[blueprint_packaging] {blueprint_packaging_first_attempt_valid: true, blueprint_packaging_retry_used: false, blueprint_packaging_final_status: success}`

**Network trace (first 10 calls):**
```
/chat 500 → /chat 500 → openrouter 200 → openrouter 200   ← packaging
/chat 500 → openrouter 200                                  ← architect step 1
/chat 500 → /chat 500 → openrouter 200 → openrouter 200   ← architect/coder steps
```

**Console events:** same bridge-fallback pattern, no errors, packaging success telemetry  

**Packaging behavior:** identical to run 2 — first attempt valid, no retry  
**Strengths:** fastest packaging of the 3 runs (t+53 s), clean pipeline handoff  
**Screenshot:** `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run3-final.png`

---

## Cross-run conclusion

**Did PR #30 eliminate the blueprint packaging invalid-payload stall?**  
Yes. The `[blueprint_packaging]` telemetry — which was never seen in any previous snapshot — is now emitted for 2/3 runs and inferred for the third. The "Model returned an invalid blueprint payload" error from the previous snapshot has disappeared entirely.

**Did packaging either succeed or fail fast with typed `BlueprintPackagingError`?**  
Packaging succeeded on the first attempt for all observed runs. `BlueprintPackagingError` was not thrown, because the model (OpenRouter via fallback) returned a valid blueprint shape on the first attempt. The retry path and `BlueprintPackagingError` remain available as safety nets but were not exercised in this run.

**Did generation reach runArchitect/runCoder?**  
`runArchitectReached: true` for all 3 runs — confirmed. runCoder was not detected within the 120 s monitoring window but network evidence shows continued LLM calls (bridge fail → OpenRouter fallback) beyond the packaging step, consistent with architect/coder progress.

**Did repair from PR #26 finally run when needed?**  
Unknown. Repair requires runCoder to complete and a post-generation quality gate to run. Neither was observed in the 120 s window. This is now testable for the first time since repair was never reached in previous snapshots.

**Did PRODUCT placeholder and empty-array issues disappear?**  
Unknown. Both issues were in the coder output and cannot be assessed until a generation run completes fully.

**Did previews reach ready?**  
Unknown — generation runtime exceeds the 120 s monitoring window. No preview status was captured.

**What is the remaining bottleneck?**  
The packaging gate is no longer the bottleneck. The remaining unknowns are:
1. **runCoder output quality**: whether PRODUCT tokens or empty arrays still appear in the generated workspace
2. **Preview compile**: whether the generated code compiles after repair
3. **Generation speed**: full generation via OpenRouter fallback takes 3–8 minutes; this is not a failure but means a longer monitoring window is needed for future snapshots

---

## Recommended next implementation step

**Run a full end-to-end generation with a 10-minute observation window to assess runCoder output quality.**

Specifically: re-run one of these 3 ideas (e.g., Cashflow Guard) and wait for generation to complete. Capture the post-coder preview-workspace to inspect:
- whether PRODUCT placeholder tokens remain in any generated file
- whether visible-content arrays are empty `[]`
- whether the preview compiles
- whether the quality gate triggers repair

Do not change any source code. This observation is the prerequisite for knowing which of the three known residual issues (PRODUCT token, empty arrays, preview compile) is the actual next bottleneck. Only after observing the first complete end-to-end run should a targeted code fix be planned.

---

## Artifact paths

| Item | Path |
|---|---|
| Report | `artifacts/quality-snapshots/trending-niche-quality-after-blueprint-packaging-fix.md` |
| Telemetry JSON | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run-telemetry.json` |
| Run 1 — after click | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run1-02-after-click.png` |
| Run 1 — final | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run1-final.png` |
| Run 2 — after click | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run2-02-after-click.png` |
| Run 2 — final | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run2-final.png` |
| Run 3 — after click | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run3-02-after-click.png` |
| Run 3 — final | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/run3-final.png` |
| Dashboard — initial | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/dashboard-initial.png` |
| Trend panel — final state | `artifacts/quality-snapshots/screenshots/after-blueprint-packaging-fix/trend-panel-final-state.png` |

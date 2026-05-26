# Trending Niche Single Run Long Observation

## Summary verdict

**PARTIAL**

Blueprint packaging is unblocked (PR #30 confirmed), architect/skeleton phase completes, and
the coder step is reached — but coder fails at the Supabase llm-proxy layer (HTTP 546) after
one retry. Quality gate, repair, and full preview never execute.

---

## Run

- **idea:** Cashflow Guard для фрилансеров (`daily-fintech-cashflow-guard`)
- **observation window:** 10 minutes
- **branch:** `p2/trending-niche-single-run-long-observation`
- **date:** 2026-05-26
- **final status:** PARTIAL — coder failed (HTTP 546), generation ownership released at ~522 s

---

## Pipeline timeline

| Stage | Status | Elapsed (from build click) | Notes |
|---|---|---|---|
| **Blueprint packaging** | ✅ success | ~86 s | `firstAttemptValid: true`, `retryUsed: false`, `finalStatus: success`. Backend Claude CLI bridge returned HTTP 500/503 × 6 (spawn EINVAL, ETIMEDOUT); service correctly fell back to OpenRouter and produced a valid blueprint. |
| **Planner dispatch** | ✅ completed | ~88 s | `appName: Freelancer Cashflow Guard`, `theme: trust`, `layout: bottom-tabs`, `routes resolved: openai/gpt-4o-mini (primary) / xiaomi/mimo-v2-pro (build)` |
| **Architect / skeleton** | ✅ completed | ~127–187 s | Skeleton compiled (`buildStage: skeleton`); `ready_set` reached at ~187 s (`source: proto_pipeline_complete`). Skeleton contains 12 component files, seed data, 3 pages. |
| **Coder** | ❌ failed | ~338 s (first attempt) / ~489 s (retry) | `llm_call_step: coder`, `llm_http_status: 546`, `llm_error_category: provider_http_500`, `llm_retry_used: true`, `llm_final_status: failed`. Both attempts to `supabase/functions/v1/llm-proxy` returned HTTP 546. Generation ownership released at ~489 s. |
| **Quality gate** | ❌ not reached | — | Coder never completed. |
| **Repair** | ❌ not reached | — | Coder never completed. |
| **Preview compile** | ⚠️ skeleton only | ~127 s | Skeleton (1-file App.tsx stub) initially failed with `root_cause_type=m…abs.tsx` (missing bottom-tabs skeleton file). Recovered automatically: full skeleton compiled and ready at ~187 s. Full app (coder output) never compiled. |
| **Live preview** | ❌ not reached | — | Skeleton preview loaded, but generation failed before coder could produce the Cashflow Guard app. |

---

## Workspace inspection

The `preview-workspace/src/` directory contains the **skeleton-phase output** — a generic
project template produced before the coder runs. The Cashflow Guard app was never generated.

### PRODUCT token status

**Present — expected at this stage.**  
Skeleton files contain inline `PRODUCT:` comment markers as intentional TODOs for the coder to
replace:
- `ErrorBoundary.tsx`: `// PRODUCT: forward to telemetry`
- `LoadingScreen.tsx`: `// PRODUCT: copy this when wiring real fetches`
- `OnboardingChecklist.tsx`: `// PRODUCT: rewrite tasks to match the activation milestones`
- `Sparkline.tsx`: `// PRODUCT: swap for a full chart`
- `TopBar.tsx`: `{/* PRODUCT: wire up command-palette / global search */}`
- `Dashboard.tsx`: `{/* PRODUCT: replace with a real dashboard tagline */}`

These are not a regression — they are the coder's input, not its output. The coder step did
not run, so these markers were never replaced with domain-specific content.

### Empty array status

**None — skeleton seed data is adequate.**  
`data/seed.ts` contains:
- `SEED_ROWS`: 12 realistic rows (generic project/task entities, not Cashflow Guard domain)
- `SEED_KPIS`: 4 KPI metrics with numbers
- `SEED_ACTIVITY`: 5 activity events
- `SEED_SPARKLINE`: 12 numeric values

No empty `[]` arrays backing visible UI content. Seed data is structurally sound but domain-
generic (not freelancer finance).

### Missing component / import status

**None in skeleton.** All imports resolve within the skeleton. Missing: the coder-generated
pages/components specific to Cashflow Guard (invoice tracker, cashflow forecast, etc.).

### Compile status

**Skeleton compiles successfully** (confirmed by `ready_set` at ~187 s).  
Full app was never compiled — coder did not produce output.

### Preview status

**Skeleton-only preview** displayed the generic workspace dashboard template (3 pages:
Dashboard, DataView, Settings). Not the Cashflow Guard app.

---

## LLM error analysis

| Call | Endpoint | Status | Handling |
|---|---|---|---|
| Packaging (× 6) | `localhost:3000/chat` (Claude CLI bridge) | 500, 503 | `[IdeaModel]` fallback to standard model flow — **correct** |
| Coder attempt 1 | `supabase/functions/v1/llm-proxy` | 546 | `provider_http_500` category, retry queued |
| Coder attempt 2 (retry) | `supabase/functions/v1/llm-proxy` | 546 | `llm_final_status: failed`, generation released |

HTTP 546 is a non-standard Supabase Edge Function error, categorised by the transport layer as
`provider_http_500`. The retry mechanism fires correctly, but no fallback model is configured
for the coder step when the llm-proxy itself returns 5xx.

---

## Conclusion

### Did PR #30 fully unblock packaging?

**Yes.** `firstAttemptValid: true, retryUsed: false, finalStatus: success`. The packaging step
produced a valid blueprint on the first LLM attempt (after falling back from the Claude CLI
bridge). PR #30 is confirmed working.

### Did generation reach and complete coder?

**Reached: yes. Completed: no.** The coder step was invoked (`llm_call_step: coder` confirmed),
but both the primary call and the retry returned HTTP 546 from `supabase/functions/v1/llm-proxy`.
The generation was terminated cleanly (ownership released).

### Did PR #26 repair become verifiable?

**No.** Repair requires a coder output to inspect. Because coder failed before producing any
files, the repair step was never triggered. PR #26 cannot be verified or ruled out in this run.

### Is the remaining bottleneck LLM reliability, repair, compile, preview, or UI quality?

**LLM reliability (coder step).** The build model `xiaomi/mimo-v2-pro` routed via
`supabase/functions/v1/llm-proxy` returns HTTP 546 consistently (two attempts). All other
pipeline stages — packaging, planner, architect/skeleton — complete successfully. Until the
coder LLM call succeeds, no downstream stage (quality gate, repair, compile, preview) is
reachable.

---

## Recommended next implementation step

**Configure a coder-step fallback model.**

The packaging step already has a working fallback path (Claude CLI bridge → OpenRouter via
backend). The coder step has no equivalent: when `xiaomi/mimo-v2-pro` via llm-proxy returns
5xx, there is no recovery. The transport layer already supports a `fallback` model field in
`agent-config.json` (currently `z-ai/glm-5.1` for `agent_build`). The priority action is to
either:
1. Replace `xiaomi/mimo-v2-pro` with a model that is confirmed available on the current
   OpenRouter account (e.g. `openai/gpt-4o-mini`, already used for the primary agent), **or**
2. Ensure the fallback model `z-ai/glm-5.1` is activated and reachable via the same llm-proxy
   path before the retry is exhausted.

This is a single `agent-config.json` change (no source code change) and would allow the next
run to proceed through coder → quality gate → repair → preview.

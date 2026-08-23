# Coder Payload Size Diagnosis for DeepSeek HTTP 546

Branch: `p2/diagnose-coder-payload-size-for-deepseek-546`
Source: `p2/trace-deepseek-direct-proxy-authority`
Date: 2025-07 (local only, not pushed)

---

## Summary verdict

**PARTIAL** — The payload risk classification infrastructure is in place and the
coder step is confirmed high-risk due to `max_tokens=35000` exceeding the high-risk
threshold (>32 000). Full quantitative evidence (actual byte sizes and char counts
from a live run) cannot be collected without a real LLM call. However, structural
analysis of the coder pipeline provides strong enough signal to recommend a
concrete next step.

---

## Transport path

```
Browser (Frontend)
  └─► Supabase functions/v1/llm-proxy   (POST /v1/chat/completions)
        └─► https://api.deepseek.com/v1/chat/completions
```

**OpenRouter is NOT in this path.**

When `provider=deepseek` and a `DEEPSEEK_API_KEY` is present, the Supabase Edge
Function routes directly to DeepSeek's API. This was confirmed in the prior diagnosis
(`deepseek-direct-proxy-authority-diagnosis.md`) and is unaffected by this branch.

---

## Evidence

### Code-structural findings

| Signal | Architect step | Coder step |
|--------|---------------|------------|
| `max_tokens` (STEP_BUDGET) | 8 000 | **35 000** |
| System prompt source | Static instructions only | Static instructions + skeleton files + full planning-block output from architect + market brief |
| User payload source | Short clarification brief | Summary of architect plan (can be multi-KB) |
| `messages_count` | 2 | 2 |
| Risk classification (`evaluateLlmPayloadRisk`) | **low** (max_tokens=8000) | **high** (max_tokens=35000 > 32 000 threshold alone) |

### Observed failure from prior evidence
Source: `cashflow-guard-user-model-long-observation.md`

| Metric | Value |
|--------|-------|
| Step that failed | coder |
| HTTP status | 546 |
| Error category | proxy_resource_limit |
| Architect step outcome | Success (~5.5 min) |
| Duration before 546 | ~455 s from build click |
| Retry behaviour | Retried once; second attempt failed with same 546 |

### Key observation on retry
The fact that a retry reproduced the exact same 546 is consistent with a deterministic
capacity/resource limit, not a transient server error. This matches the classification:
`proxy_resource_limit` is NOT retried by `executeWithClassifiedRetry` (only
`provider_http_500` is retried). If a 500 were received instead and the retry also
fails with 546, the same payload is sent twice to the same constrained endpoint.

### Payload risk evaluation (structural)

Running `evaluateLlmPayloadRisk` with coder's known `max_tokens=35000`:

```
evaluateLlmPayloadRisk({
  request_payload_byte_size: unknown (to be measured at runtime),
  total_prompt_char_count:   unknown (to be measured at runtime),
  estimated_token_count:     unknown (to be measured at runtime),
  max_tokens:                35000,   // STEP_BUDGET.coder
  messages_count:            2,
})
→ { level: 'high', reasons: ['max_tokens=35000 is unusually high (>32 000)'] }
```

Even without runtime char/byte measurements, the coder step is already flagged
**high risk** from `max_tokens` alone. If the planning-block output is large (common
when architect succeeds and produces a full plan), the combined system prompt
(skeleton files + planning blocks) can easily reach 30 000–80 000+ characters,
which would add further high-risk signals.

### Why the architect step does NOT hit 546
- `max_tokens=8000` (within safe range)
- System prompt = instructions only (no planning blocks, no skeleton files)
- Architect succeeds in ~5.5 min — the duration suggests it does stream back and
  complete, before the coder request is sent

### Why the coder step is more likely to hit a proxy/provider resource limit
1. `max_tokens=35000` ≈ 4× the architect budget
2. System prompt includes skeleton file content (can be 10–30 KB of template code)
3. System prompt includes the full planning-block JSON output from architect
4. Together: total context (input + max output) may approach DeepSeek-v4-pro's
   64k token context window
5. Supabase Edge Function has ~50MB memory, CPU limits, and a default wall-clock
   timeout that can trigger before a long-running LLM streaming call completes

---

## Likely cause

**max_tokens=35000 combined with large system prompt (skeleton + planning blocks)**
pushing total context near or beyond Supabase Edge Function and/or DeepSeek API
resource limits. The 546 status originates from the DeepSeek API (received by the
Supabase proxy and forwarded to the client), consistent with a provider-side
resource/capacity limit signal.

Secondary hypothesis: Supabase Edge Function CPU/wall-clock timeout firing during
a long streaming response before the coder LLM call even completes a first token.
This would be indistinguishable from a 546 at the client if the proxy wraps it.

**Primary cause selected: payload/context too large (max_tokens + system prompt).**

---

## Recommendation

**Reduce `max_tokens` for the coder step and compact the planning-block system prompt
before sending to the coder LLM call.**

Specifically:
1. **Lower `STEP_BUDGET.coder.maxTokens`** from 35 000 to ≤ 16 000 as a safe first
   step. DeepSeek-v4-pro produces well-structured React/TypeScript at 8 000–12 000
   tokens for a single-page prototype. 35 000 provides capacity that isn't used and
   increases resource consumption.

2. **Compact the planning-block content** included in the coder system prompt.
   Instead of forwarding the full architect output JSON, include only a structured
   summary (feature list, component names, key logic decisions — not the full
   content of each planning block).

These two changes together would reduce the coder request from high risk to medium
or low risk without changing the product output quality for typical single-page
prototypes.

**Next implementation step: maxTokens adjustment for coder.**

---

## Diagnostics added in this branch

### New `LlmCallDiagnostics` fields (extended interface)
- `endpoint_kind` — `direct_provider | supabase_proxy | openrouter_proxy | unknown`
- `route_authority` — `user_set | backend_runtime_saved | backend_factory_template | ...`
- `system_prompt_char_count` — system message character length
- `user_payload_char_count` — user message character length
- `total_prompt_char_count` — system + user combined (renamed from `prompt_char_count`)
- `request_payload_byte_size` — JSON body length in bytes (renamed from `payload_byte_size`)
- `streaming_enabled` — whether SSE streaming is active for this call

### New interfaces
- `LlmCallOutcomeDiagnostics` — post-call outcome: timing, final status, http_status, error_category
- `LlmPayloadRiskResult` — `{ level: 'low' | 'medium' | 'high', reasons: string[] }`

### New functions
- `evaluateLlmPayloadRisk(metrics)` — pure helper, no side effects, thresholds:
  - High: byte_size > 120 KB, chars > 80 K, tokens > 40 K, max_tokens > 32 K, messages > 10
  - Medium: byte_size > 40 KB, chars > 20 K, tokens > 16 K, max_tokens > 16 K
- `recordLlmCallOutcome(data)` — emits `[llm_call_outcome]` with timing and status

### ProtoPipeline.ts changes
- `ResolvedRoute` extended with optional `endpointKind?`, `sourceAuthority?`
- `NATIVE_ROUTE_HOSTS` constant and `routeEndpointKind()` helper added
- `resolveRoute()` populates `endpointKind` and `sourceAuthority` from `ConfigService`
- `streamCall()` captures `callStart = Date.now()` and calls `recordLlmCallOutcome`
  on both success and failure paths
- `recordLlmCallDiagnostics` call updated with all new fields

---

## Tests added

File: `frontend/src/services/__tests__/llmPayloadDiagnostics.test.ts`

| Suite | Count |
|-------|-------|
| `evaluateLlmPayloadRisk` — low risk | 2 |
| `evaluateLlmPayloadRisk` — medium risk | 4 |
| `evaluateLlmPayloadRisk` — high risk | 6 |
| `evaluateLlmPayloadRisk` — determinism | 2 |
| `recordLlmCallDiagnostics` — field completeness | 5 |
| `recordLlmCallDiagnostics` — safety | 3 |
| `recordLlmCallOutcome` | 4 |
| Byte size estimation | 2 |
| Token estimation consistency | 2 |
| Integration: coder vs architect risk | 2 |
| **Total new tests** | **32** |

Existing tests updated: `LlmTransportError.test.ts` — 3 `recordLlmCallDiagnostics`
tests updated to use renamed fields and new required fields.

Total tests in affected files: **88 passed, 0 failed.**

---

## What is NOT done (by design)

- No prompt text or API key is logged (verified by safety tests)
- No provider defaults changed
- No `STEP_BUDGET` changed (intentionally deferred — diagnosis only)
- No planning-block compaction implemented (deferred — see recommendation)
- No real LLM calls in tests
- No push to GitHub; local branch only
